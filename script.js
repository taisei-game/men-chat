'use strict';

// ==========================================
// 男性パート チャット - 共通基盤 + トーク
//   config.js  : Firebase / LIFF / 利用制限の設定
//   script.js  : 共通処理・LIFFログイン・トーク  (このファイル)
//   board.js   : 掲示板
// ==========================================

const APP_VERSION = '2026.09.28';
const MAX_TEXT = 2000;      // 1投稿の最大文字数
const CHAT_LIMIT = 300;     // トークで読み込む最新メッセージ数
const PREFS_KEY = 'menchat.prefs.v1';

let db = null;

// アプリのグローバル状態
const state = {
  user: { id: '', name: 'ゲスト', avatar: '' },
  postMode: 'normal',       // 'normal' | 'anon' (切り替えるまで維持)
  currentRoom: 'main',
  replyTo: null,
  connected: null,          // Firebase接続状態 (null=未確認)
  tab: 'chat',
  lastBoardHash: '#/board',
  ready: false
};

// ==========================================
// 1. ユーティリティ
// ==========================================
const $ = (id) => document.getElementById(id);

function esc(value) {
  return String(value == null ? '' : value).replace(/[&<>"']/g, (m) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
  })[m]);
}

function svgDataUri(svg) {
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
}

// 外部画像サービスに頼らない、アプリ内蔵のアイコン
const ANON_AVATAR = svgDataUri(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><circle cx="20" cy="20" r="20" fill="#8e8e93"/>' +
  '<text x="20" y="28" font-size="22" font-weight="700" text-anchor="middle" fill="#fff" font-family="sans-serif">?</text></svg>'
);
const DEFAULT_AVATAR = svgDataUri(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><circle cx="20" cy="20" r="20" fill="#c7c7cc"/>' +
  '<circle cx="20" cy="15" r="7" fill="#fff"/><path d="M6 36c1-8 7-12 14-12s13 4 14 12z" fill="#fff"/></svg>'
);

function safeAvatar(url, isAnon) {
  if (isAnon) return ANON_AVATAR;
  if (typeof url === 'string' && /^https:\/\//.test(url) && url.indexOf('via.placeholder.com') === -1) return url;
  return DEFAULT_AVATAR;
}

function displayName(msg) {
  return msg && msg.isAnon ? '匿名' : (msg && msg.sender) || '名無し';
}

function lsGet(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw == null ? fallback : JSON.parse(raw);
  } catch (e) { return fallback; }
}

function lsSet(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* 保存できなくても動作は継続 */ }
}

function formatTime(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  const now = new Date();
  const hm = d.getHours() + ':' + String(d.getMinutes()).padStart(2, '0');
  if (d.toDateString() === now.toDateString()) return hm;
  const md = (d.getMonth() + 1) + '/' + d.getDate();
  return d.getFullYear() === now.getFullYear() ? md + ' ' + hm : d.getFullYear() + '/' + md + ' ' + hm;
}

// URL と レス参照(>>1 / 1>>) を解釈する
const TOKEN_RE = /(https?:\/\/[^\s<>"']+)|(?:>>|＞＞)([0-9０-９]{1,5})(?![0-9０-９])|([0-9０-９]{1,5})(?:>>|＞＞)/g;

function refNumber(m) {
  return parseInt((m[2] || m[3]).normalize('NFKC'), 10);
}

function extractRefs(text) {
  const refs = [];
  for (const m of String(text || '').matchAll(TOKEN_RE)) {
    if (!m[1]) refs.push(refNumber(m));
  }
  return refs;
}

// 本文をHTMLへ変換（必ずエスケープしてから装飾する）
function formatText(raw, opts) {
  const withRefs = !!(opts && opts.refs);
  const text = String(raw == null ? '' : raw);
  let out = '';
  let last = 0;
  for (const m of text.matchAll(TOKEN_RE)) {
    out += esc(text.slice(last, m.index));
    if (m[1]) {
      const url = m[1].replace(/[)\].,、。!?]+$/, '');
      out += '<a href="' + esc(url) + '" target="_blank" rel="noopener noreferrer">' + esc(url) + '</a>' + esc(m[1].slice(url.length));
    } else if (withRefs) {
      const n = refNumber(m);
      out += '<a class="ref" data-ref="' + n + '">&gt;&gt;' + n + '</a>';
    } else {
      out += esc(m[0]);
    }
    last = m.index + m[0].length;
  }
  return out + esc(text.slice(last));
}

function nearBottom(el) {
  return el.scrollHeight - el.scrollTop - el.clientHeight < 120;
}

function scrollBottom(el) {
  el.scrollTop = el.scrollHeight;
}

function autosize(el) {
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 120) + 'px';
}

function errorText(err, fallback) {
  // 内部エラーの詳細は画面に出さない
  if (err) console.error(fallback, err);
  if (err && err.code === 'PERMISSION_DENIED') return fallback + '（権限がありません）';
  return fallback;
}

// ---------- トースト ----------
let toastTimer = null;
function showToast(message, kind) {
  const t = $('toast');
  t.textContent = message;
  t.className = 'toast show' + (kind ? ' ' + kind : '');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 3000);
}

// ---------- 確認ダイアログ ----------
function confirmDialog(message, okLabel, danger) {
  return new Promise((resolve) => {
    const overlay = $('dialog');
    const ok = $('dialog-ok');
    const cancel = $('dialog-cancel');
    $('dialog-msg').textContent = message;
    ok.textContent = okLabel || 'OK';
    ok.className = 'btn ' + (danger ? 'danger' : 'primary');
    overlay.hidden = false;
    cancel.focus();

    const finish = (result) => {
      overlay.hidden = true;
      ok.onclick = cancel.onclick = overlay.onclick = null;
      resolve(result);
    };
    ok.onclick = () => finish(true);
    cancel.onclick = () => finish(false);
    overlay.onclick = (e) => { if (e.target === overlay) finish(false); };
  });
}

// ---------- 長押し / 右クリックメニュー ----------
function closeMenu() {
  const old = $('custom-context-menu');
  if (old) old.remove();
}

function showMenu(x, y, items) {
  closeMenu();
  const menu = document.createElement('div');
  menu.id = 'custom-context-menu';
  menu.className = 'context-menu';
  const created = Date.now();

  items.forEach((item) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = item.label;
    if (item.danger) btn.className = 'danger';
    btn.addEventListener('click', () => {
      if (Date.now() - created < 350) return; // 長押しの指を離した直後の誤タップを防ぐ
      closeMenu();
      item.onClick();
    });
    menu.appendChild(btn);
  });

  document.body.appendChild(menu);
  const w = menu.offsetWidth;
  const h = menu.offsetHeight;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  let left = Math.min(Math.max(8, x - w / 2), vw - w - 8);
  let top = y - h - 14;
  if (top < 8) top = Math.min(y + 18, vh - h - 8);
  menu.style.left = left + 'px';
  menu.style.top = top + 'px';

  setTimeout(() => {
    const outside = (e) => {
      if (!menu.contains(e.target)) {
        closeMenu();
        document.removeEventListener('pointerdown', outside, true);
      }
    };
    document.addEventListener('pointerdown', outside, true);
  }, 50);
}

function attachLongPress(el, callback) {
  let timer = null;
  let fired = false;
  let sx = 0;
  let sy = 0;
  const cancel = () => clearTimeout(timer);

  el.addEventListener('touchstart', (e) => {
    fired = false;
    const t = e.touches[0];
    sx = t.clientX;
    sy = t.clientY;
    timer = setTimeout(() => {
      fired = true;
      if (navigator.vibrate) navigator.vibrate(10);
      callback(sx, sy);
    }, 450);
  }, { passive: true });
  el.addEventListener('touchmove', (e) => {
    const t = e.touches[0];
    if (Math.abs(t.clientX - sx) > 10 || Math.abs(t.clientY - sy) > 10) cancel();
  }, { passive: true });
  el.addEventListener('touchend', cancel);
  el.addEventListener('touchcancel', cancel);
  el.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    if (!fired) callback(e.clientX, e.clientY);
    fired = false;
  });
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    showToast('コピーしました');
  } catch (e) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;opacity:0;left:0;top:0';
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch (_) { ok = false; }
    ta.remove();
    showToast(ok ? 'コピーしました' : 'コピーできませんでした', ok ? '' : 'error');
  }
}

// 投稿を書き込める状態か
function canWrite() {
  if (!state.ready || !state.user.id) {
    showToast('ログインが完了していません', 'error');
    return false;
  }
  if (state.connected === false || !navigator.onLine) {
    showToast('オフラインのため送信できません。通信状況を確認してください', 'error');
    return false;
  }
  return true;
}

// ==========================================
// 2. 投稿モード (通常 / 匿名)
// ==========================================
function setPostMode(mode) {
  state.postMode = mode === 'anon' ? 'anon' : 'normal';
  document.querySelectorAll('.mode-btn').forEach((btn) => {
    const active = btn.dataset.mode === state.postMode;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-pressed', String(active));
  });
  const prefs = lsGet(PREFS_KEY, {});
  prefs.postMode = state.postMode;
  lsSet(PREFS_KEY, prefs);
}

// ==========================================
// 3. 画面サイズ / キーボード / Safe Area
// ==========================================
function setupViewport() {
  const root = document.documentElement;
  const vv = window.visualViewport;
  let baseline = vv ? vv.height : window.innerHeight;
  let editing = false;

  const isEditing = () => {
    const el = document.activeElement;
    return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA');
  };

  const update = () => {
    const chatList = $('message-container');
    const keepChat = state.tab === 'chat' && chatList && nearBottom(chatList);
    const postList = $('post-list');
    const keepPosts = state.tab === 'board' && postList && nearBottom(postList);

    const h = vv ? vv.height : window.innerHeight;
    editing = isEditing();
    if (!editing) baseline = h;
    const keyboard = editing && h < baseline - 120;

    root.style.setProperty('--app-height', h + 'px');
    root.style.setProperty('--app-top', (vv ? vv.offsetTop : 0) + 'px');
    root.classList.toggle('kb-open', keyboard);
    if (keyboard && window.scrollY) window.scrollTo(0, 0);

    if (keepChat) scrollBottom(chatList);
    if (keepPosts) scrollBottom(postList);
  };

  if (vv) {
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
  }
  window.addEventListener('resize', update);
  window.addEventListener('orientationchange', () => setTimeout(update, 200));
  document.addEventListener('focusin', update);
  document.addEventListener('focusout', () => setTimeout(update, 120));
  update();
}

// ==========================================
// 4. 通信状態
// ==========================================
let offlineTimer = null;
function updateBanner() {
  const offline = !navigator.onLine || state.connected === false;
  clearTimeout(offlineTimer);
  if (offline) {
    offlineTimer = setTimeout(() => { $('status-banner').hidden = false; }, 2500);
  } else {
    $('status-banner').hidden = true;
  }
}

function watchConnection() {
  db.ref('.info/connected').on('value', (snap) => {
    state.connected = snap.val() === true;
    updateBanner();
  });
  window.addEventListener('online', updateBanner);
  window.addEventListener('offline', updateBanner);
}

// ==========================================
// 5. 起動 / LINE LIFF ログイン / メンバー確認
// ==========================================
// ---------- LINEログインの無限ループ防止 ----------
// liff.login() を自動で呼ぶのは、一定時間内に1回まで。
// ログインから戻っても isLoggedIn() が false のままなら、再度自動で login() せず、ボタン操作に切り替える。
const LOGIN_TRY_KEY = 'menchat.loginTry.v1';
const LOGIN_TRY_WINDOW_MS = 2 * 60 * 1000;
const LOGIN_HASH_KEY = 'menchat.loginHash.v1';

function recentLoginAttempt() {
  try {
    const t = parseInt(sessionStorage.getItem(LOGIN_TRY_KEY) || '0', 10);
    return t > 0 && Date.now() - t < LOGIN_TRY_WINDOW_MS;
  } catch (e) { return true; } // 記録できない環境では自動ログインしない(ループ防止)
}

function clearLoginAttempt() {
  try { sessionStorage.removeItem(LOGIN_TRY_KEY); } catch (e) { /* 何もしない */ }
}

// LINEのログイン画面へ移動する。復帰先はハッシュ・クエリを除いたURL(ハッシュルートで code が失われるのを避ける)
function startLineLogin() {
  try {
    sessionStorage.setItem(LOGIN_TRY_KEY, String(Date.now()));
    if (location.hash) sessionStorage.setItem(LOGIN_HASH_KEY, location.hash);
  } catch (e) { /* 何もしない */ }
  liff.login({ redirectUri: location.origin + location.pathname });
}

// 手動ボタン用: 古いLIFFのログイン情報を消してからやり直す
function retryLineLogin() {
  try {
    Object.keys(localStorage).forEach((k) => {
      if (k.indexOf('LIFF_STORE:' + MY_LIFF_ID) === 0) localStorage.removeItem(k);
    });
  } catch (e) { /* 何もしない */ }
  startLineLogin();
}

function isStandalone() {
  return (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || window.navigator.standalone === true;
}

function showGate(opts) {
  $('gate').hidden = false;
  $('gate-title').textContent = opts.title;
  $('gate-msg').textContent = opts.msg || '';
  const action = $('gate-action');
  action.hidden = !opts.action;
  if (opts.action) {
    action.textContent = opts.action;
    action.onclick = opts.onAction;
  }
  const copy = $('gate-copy');
  copy.hidden = !opts.copyId;
  copy.onclick = () => copyText(state.user.id);
}

function hideGate() {
  $('gate').hidden = true;
}

// 'ok' | 'denied'
async function checkMembership() {
  const uid = state.user.id;
  if (ALLOWED_USER_IDS.length > 0) {
    return ALLOWED_USER_IDS.indexOf(uid) !== -1 ? 'ok' : 'denied';
  }
  // 先着 MAX_MEMBERS 人まで自動でメンバー登録する
  const result = await db.ref('members').transaction((current) => {
    const members = current || {};
    if (members[uid]) return undefined;
    if (Object.keys(members).length >= MAX_MEMBERS) return undefined;
    members[uid] = { name: state.user.name, joinedAt: Date.now() };
    return members;
  });
  const members = result.snapshot.val() || {};
  return members[uid] ? 'ok' : 'denied';
}

async function login() {
  showGate({ title: '読み込み中…' });

  try {
    await liff.init({ liffId: MY_LIFF_ID });
  } catch (err) {
    console.error('LIFF 初期化エラー:', err);
    showGate({
      title: 'ログインできませんでした',
      msg: 'LINEとの接続に失敗しました。通信状況を確認して、もう一度お試しください。',
      action: 'もう一度試す',
      onAction: login
    });
    return;
  }

  if (!liff.isLoggedIn()) {
    if (isStandalone() && !liff.isInClient()) {
      // ホーム画面アプリでは自動でログイン画面へ飛ばさず、ボタンで開始する
      showGate({
        title: 'LINEでログイン',
        msg: 'LINEアカウントでログインしてください。',
        action: 'LINEでログイン',
        onAction: startLineLogin
      });
    } else if (recentLoginAttempt()) {
      // ログインから戻ったのに未ログインのまま → 自動で繰り返さず、ボタンで再試行
      console.warn('LINEログイン後も未ログイン状態です。自動ログインを停止しました。');
      showGate({
        title: 'ログインが完了しませんでした',
        msg: 'LINEログイン後も認証状態を確認できませんでした。下のボタンからもう一度お試しください。',
        action: 'LINEでログイン',
        onAction: retryLineLogin
      });
    } else {
      startLineLogin();
    }
    return;
  }

  // ログイン済み: 試行記録を消し、ログイン前のハッシュ(#/board/... など)を復元
  clearLoginAttempt();
  try {
    const savedHash = sessionStorage.getItem(LOGIN_HASH_KEY);
    sessionStorage.removeItem(LOGIN_HASH_KEY);
    if (savedHash && !location.hash) {
      history.replaceState(history.state, '', location.pathname + location.search + savedHash);
    }
  } catch (e) { /* 何もしない */ }

  try {
    const profile = await liff.getProfile();
    state.user = {
      id: profile.userId,
      name: profile.displayName || 'ゲスト',
      avatar: profile.pictureUrl || ''
    };
  } catch (err) {
    console.error('LINEプロフィール取得エラー:', err);
    showGate({
      title: 'ログインできませんでした',
      msg: 'LINEのプロフィールを取得できませんでした。もう一度お試しください。',
      action: 'もう一度試す',
      onAction: login
    });
    return;
  }

  let membership;
  try {
    membership = await checkMembership();
  } catch (err) {
    console.error('メンバー確認エラー:', err);
    showGate({
      title: 'データを取得できませんでした',
      msg: '通信状況を確認して、もう一度お試しください。解決しない場合は管理者に連絡してください。',
      action: 'もう一度試す',
      onAction: login
    });
    return;
  }

  if (membership !== 'ok') {
    showGate({
      title: 'このアプリは利用できません',
      msg: 'このアプリは招待されたメンバー専用です。参加したい場合は、下のユーザーIDを管理者に伝えてください。',
      copyId: true
    });
    return;
  }

  db.ref('members/' + state.user.id).update({
    name: state.user.name,
    lastSeen: firebase.database.ServerValue.TIMESTAMP
  }).catch(() => { /* 記録できなくても利用は続けられる */ });

  startApp();
}

function startApp() {
  if (state.ready) return;
  state.ready = true;
  hideGate();
  updateInfo();
  watchConnection();
  Chat.start();
  Board.start();
  route();
}

// ==========================================
// 6. 画面遷移 (#/chat, #/board, #/board/<スレッドID>)
// ==========================================
function parseHash() {
  const parts = location.hash.replace(/^#\/?/, '').split('/');
  return { tab: parts[0] === 'board' ? 'board' : 'chat', tid: parts[1] || null };
}

function navigate(hash, opts) {
  const replace = !!(opts && opts.replace);
  if (location.hash === hash) { route(); return; }
  const url = location.pathname + location.search + hash;
  if (replace) history.replaceState({ app: true }, '', url);
  else history.pushState({ app: true }, '', url);
  route();
}

function setTabDot(tab, on) {
  const dot = $('tab-' + tab).querySelector('.tab-dot');
  if (dot) dot.hidden = !on;
}

function route() {
  const { tab, tid } = parseHash();
  const leavingChat = state.tab === 'chat' && tab !== 'chat';
  if (leavingChat) Chat.stick = nearBottom($('message-container'));
  state.tab = tab;

  $('view-chat').hidden = tab !== 'chat';
  $('view-board').hidden = tab !== 'board';
  $('tab-chat').classList.toggle('active', tab === 'chat');
  $('tab-board').classList.toggle('active', tab === 'board');
  $('tab-chat').setAttribute('aria-selected', String(tab === 'chat'));
  $('tab-board').setAttribute('aria-selected', String(tab === 'board'));
  $('page-title').textContent = tab === 'chat' ? '💬 トーク' : '📋 掲示板';
  closeMenu();

  if (!state.ready) return;

  if (tab === 'chat') {
    Chat.onShow();
    Board.leave();
  } else {
    state.lastBoardHash = location.hash || '#/board';
    Board.show(tid);
  }
}

// ==========================================
// 7. トーク
// ==========================================
const Chat = {
  els: new Map(),
  loaded: false,
  sending: false,
  stick: true,

  start() {
    const container = $('message-container');
    const ref = db.ref('messages/' + state.currentRoom).orderByKey().limitToLast(CHAT_LIMIT);

    ref.on('child_added', (snap, prevKey) => this.add(snap, prevKey), (err) => {
      showToast(errorText(err, 'データを取得できませんでした'), 'error');
    });
    ref.on('child_removed', (snap) => {
      const el = this.els.get(snap.key);
      if (el) el.remove();
      this.els.delete(snap.key);
      this.checkEmpty();
    });
    ref.once('value').then(() => {
      this.loaded = true;
      scrollBottom(container);
      this.checkEmpty();
    }).catch((err) => {
      showToast(errorText(err, 'データを取得できませんでした'), 'error');
    });
  },

  checkEmpty() {
    $('chat-empty').hidden = this.els.size > 0;
  },

  onShow() {
    setTabDot('chat', false);
    const container = $('message-container');
    if (this.stick) requestAnimationFrame(() => scrollBottom(container));
    $('chat-jump').hidden = nearBottom(container);
  },

  add(snap, prevKey) {
    if (this.els.has(snap.key)) return;
    const msg = snap.val();
    if (!msg || typeof msg.text !== 'string') return;
    msg.id = snap.key;

    const container = $('message-container');
    const wasNear = nearBottom(container);
    const el = this.render(msg);
    this.els.set(snap.key, el);

    const prev = prevKey ? this.els.get(prevKey) : null;
    if (prev) prev.after(el);
    else if (prevKey) container.appendChild(el);
    else container.prepend(el);

    this.checkEmpty();
    if (!this.loaded) return;

    const mine = msg.userId === state.user.id;
    if (mine || (wasNear && state.tab === 'chat')) {
      scrollBottom(container);
    } else if (state.tab === 'chat') {
      $('chat-jump').hidden = false;
    }
    if (!mine && (state.tab !== 'chat' || document.hidden)) setTabDot('chat', true);
  },

  render(msg) {
    const mine = msg.userId === state.user.id;
    const row = document.createElement('div');
    row.className = 'message-bubble ' + (mine ? 'self' : 'other');
    row.dataset.msgId = msg.id;

    const img = document.createElement('img');
    img.className = 'avatar';
    img.alt = '';
    img.loading = 'lazy';
    img.src = safeAvatar(msg.avatar, msg.isAnon);
    img.onerror = () => { img.onerror = null; img.src = DEFAULT_AVATAR; };

    const content = document.createElement('div');
    content.className = 'msg-content';

    const header = document.createElement('div');
    header.className = 'msg-header';
    const time = formatTime(msg.timestamp);
    if (mine) header.textContent = msg.isAnon ? '匿名で投稿 · ' + time : time;
    else header.textContent = displayName(msg) + (time ? ' · ' + time : '');
    content.appendChild(header);

    if (msg.replyTo && typeof msg.replyTo.text === 'string') {
      const rp = document.createElement('div');
      rp.className = 'reply-preview';
      rp.textContent = '↩ ' + (msg.replyTo.sender || '') + ': ' + msg.replyTo.text;
      rp.addEventListener('click', () => this.jumpTo(msg.replyTo.id));
      content.appendChild(rp);
    }

    const text = document.createElement('div');
    text.className = 'msg-text';
    text.innerHTML = formatText(msg.text);
    content.appendChild(text);

    row.appendChild(img);
    row.appendChild(content);
    attachLongPress(row, (x, y) => this.openMenu(x, y, msg));
    return row;
  },

  jumpTo(id) {
    const el = this.els.get(id);
    if (!el) { showToast('元のメッセージは見つかりません'); return; }
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    el.classList.remove('flash');
    void el.offsetWidth;
    el.classList.add('flash');
  },

  openMenu(x, y, msg) {
    const items = [
      { label: '↩️ 返信', onClick: () => this.setReply(msg) },
      { label: '📋 テキストをコピー', onClick: () => copyText(msg.text) }
    ];
    if (msg.userId === state.user.id) {
      items.push({ label: '🗑️ 送信取り消し', danger: true, onClick: () => this.remove(msg) });
    }
    showMenu(x, y, items);
  },

  setReply(msg) {
    state.replyTo = { id: msg.id, sender: displayName(msg), text: msg.text.slice(0, 80) };
    $('reply-bar-text').textContent = '↩ ' + state.replyTo.sender + ' への返信: ' + state.replyTo.text;
    $('reply-bar').hidden = false;
    $('message-input').focus();
  },

  cancelReply() {
    state.replyTo = null;
    $('reply-bar').hidden = true;
  },

  async remove(msg) {
    const ok = await confirmDialog('このメッセージを取り消しますか？', '取り消す', true);
    if (!ok) return;
    try {
      await db.ref('messages/' + state.currentRoom + '/' + msg.id).remove();
    } catch (err) {
      showToast(errorText(err, '取り消せませんでした'), 'error');
    }
  },

  async send() {
    if (this.sending) return;
    const input = $('message-input');
    const text = input.value.trim();
    if (!text) return;
    if (text.length > MAX_TEXT) {
      showToast('メッセージは' + MAX_TEXT + '文字以内で入力してください', 'error');
      return;
    }
    if (!canWrite()) return;

    const isAnon = state.postMode === 'anon';
    const data = {
      userId: state.user.id,
      sender: isAnon ? '匿名' : state.user.name,
      text: text,
      isAnon: isAnon,
      timestamp: firebase.database.ServerValue.TIMESTAMP
    };
    if (!isAnon && state.user.avatar) data.avatar = state.user.avatar;
    if (state.replyTo) data.replyTo = state.replyTo;

    this.sending = true;
    $('send-btn').disabled = true;
    try {
      await db.ref('messages/' + state.currentRoom).push(data);
      input.value = '';
      autosize(input);
      this.cancelReply();
    } catch (err) {
      showToast(errorText(err, '投稿できませんでした。通信状況を確認してください'), 'error');
    } finally {
      this.sending = false;
      $('send-btn').disabled = false;
    }
  }
};

// ==========================================
// 8. 共通UIの初期化
// ==========================================
function openOverlay(id) {
  $(id).hidden = false;
}

function closeOverlay(id) {
  $(id).hidden = true;
}

function updateInfo() {
  $('info-name').textContent = state.user.name;
  $('info-uid').textContent = state.user.id || '-';
  $('info-version').textContent = APP_VERSION;
}

function setupUI() {
  const prefs = lsGet(PREFS_KEY, {});
  setPostMode(prefs.postMode === 'anon' ? 'anon' : 'normal');

  document.querySelectorAll('.mode-btn').forEach((btn) => {
    btn.addEventListener('click', () => setPostMode(btn.dataset.mode));
  });

  // トーク入力
  const input = $('message-input');
  input.addEventListener('input', () => {
    const container = $('message-container');
    const near = nearBottom(container);
    autosize(input);
    if (near) scrollBottom(container);
  });
  input.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || e.shiftKey || e.isComposing || e.keyCode === 229) return;
    if (!window.matchMedia('(pointer: fine)').matches) return; // スマホ/タブレットのEnterは改行
    e.preventDefault();
    Chat.send();
  });
  $('send-btn').addEventListener('mousedown', (e) => e.preventDefault()); // 送信後もキーボードを閉じない
  $('send-btn').addEventListener('click', () => Chat.send());
  $('reply-cancel').addEventListener('click', () => Chat.cancelReply());

  const chatList = $('message-container');
  chatList.addEventListener('scroll', () => { $('chat-jump').hidden = nearBottom(chatList); }, { passive: true });
  $('chat-jump').addEventListener('click', () => scrollBottom(chatList));

  // 下タブ
  $('tab-chat').addEventListener('click', () => {
    if (state.tab !== 'chat') navigate('#/chat', { replace: true });
  });
  $('tab-board').addEventListener('click', () => {
    if (state.tab !== 'board') navigate(state.lastBoardHash || '#/board', { replace: true });
    else Board.backToList();
  });
  window.addEventListener('popstate', route);

  // アプリ情報
  $('info-btn').addEventListener('click', () => { updateInfo(); openOverlay('info-sheet'); });
  $('info-close').addEventListener('click', () => closeOverlay('info-sheet'));
  $('info-copy').addEventListener('click', () => { if (state.user.id) copyText(state.user.id); });
  $('info-reload').addEventListener('click', () => location.reload());
  $('info-sheet').addEventListener('click', (e) => { if (e.target === $('info-sheet')) closeOverlay('info-sheet'); });

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    closeMenu();
    ['info-sheet', 'thread-sheet'].forEach(closeOverlay);
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) return;
    if (state.tab === 'chat') setTabDot('chat', false);
    if (state.ready) Board.onVisible();
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistration().then((reg) => reg && reg.update()).catch(() => {});
    }
  });
}

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  if (location.protocol !== 'https:' && location.hostname !== 'localhost') return;
  navigator.serviceWorker.register('sw.js').catch((err) => {
    console.warn('Service Worker を登録できませんでした:', err);
  });
}

const App = {
  boot() {
    setupViewport();
    setupUI();
    registerServiceWorker();

    if (typeof firebase === 'undefined' || typeof liff === 'undefined') {
      showGate({
        title: '読み込めませんでした',
        msg: '通信状況を確認して、もう一度お試しください。',
        action: '再読み込み',
        onAction: () => location.reload()
      });
      return;
    }

    try {
      firebase.initializeApp(firebaseConfig);
      db = firebase.database();
    } catch (err) {
      console.error('Firebase 初期化エラー:', err);
      showGate({
        title: '読み込めませんでした',
        msg: 'アプリを開き直してください。',
        action: '再読み込み',
        onAction: () => location.reload()
      });
      return;
    }

    login();
  }
};
