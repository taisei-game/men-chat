'use strict';

// ==========================================
// 掲示板
//
// データ構造 (Firebase Realtime Database。既存の messages/ には触れません)
//   board/threads/<スレッドID> : { title, createdBy, authorName, isAnon, createdAt, lastPostAt, postCount }
//   board/posts/<スレッドID>/<6桁の投稿番号> : { no, userId, sender, isAnon, text, timestamp, deleted? }
//
// 投稿番号は postCount をトランザクションで加算して採番します。
// 同時に投稿しても番号は重複せず、削除しても番号は詰まりません(削除は「削除されました」表示に置換)。
// ==========================================

const SEEN_KEY = 'menchat.boardSeen.v1';
const THREAD_LIMIT = 100;   // 一覧に読み込むスレッド数
const POST_LIMIT = 500;     // スレッド内で読み込む最新レス数
const MAX_TITLE = 60;

function padNo(n) {
  return String(n).padStart(6, '0');
}

const Board = {
  threads: {},
  threadsLoaded: false,
  seen: null,               // { スレッドID: 既読レス数 }
  bound: false,

  tid: null,                // 表示中のスレッドID
  extraThread: null,        // 一覧の範囲外から直接開いたスレッド
  knownCurrent: false,
  postRef: null,
  handlers: null,
  postEls: new Map(),       // 投稿キー -> 要素
  postData: new Map(),      // 投稿番号 -> { key, post }
  backrefs: new Map(),      // 投稿番号 -> Set(その投稿を参照しているレス番号)
  postsLoaded: false,
  stick: true,
  canGoBack: false,
  sending: false,
  creating: false,
  selfDeleted: null,

  // ---------- 起動 ----------
  start() {
    this.bind();
    this.seen = lsGet(SEEN_KEY, null);

    db.ref('board/threads').orderByKey().limitToLast(THREAD_LIMIT).on('value', (snap) => {
      this.threads = snap.val() || {};
      this.threadsLoaded = true;

      if (this.seen === null) {
        // 初回は既存スレッドを既読扱いにして、通知だらけにならないようにする
        this.seen = {};
        Object.keys(this.threads).forEach((id) => { this.seen[id] = (this.threads[id] && this.threads[id].postCount) || 0; });
        this.saveSeen();
      }

      if (this.tid && this.knownCurrent && !this.currentThread()) {
        const deletedByMe = this.selfDeleted === this.tid;
        this.selfDeleted = null;
        if (!deletedByMe) showToast('このスレッドは削除されました');
        navigate('#/board', { replace: true });
      } else if (this.tid && this.currentThread()) {
        this.knownCurrent = true;
      }

      if (this.isViewing()) this.markSeen();
      this.renderList();
      this.updateBadge();
      this.updateHeader();
    }, (err) => {
      showToast(errorText(err, 'データを取得できませんでした'), 'error');
    });
  },

  bind() {
    if (this.bound) return;
    this.bound = true;

    $('new-thread-btn').addEventListener('click', () => this.openCreate());
    $('thread-cancel').addEventListener('click', () => closeOverlay('thread-sheet'));
    $('thread-sheet').addEventListener('click', (e) => { if (e.target === $('thread-sheet')) closeOverlay('thread-sheet'); });
    $('thread-form').addEventListener('submit', (e) => { e.preventDefault(); this.createThread(); });

    $('thread-back').addEventListener('click', () => this.backToList());
    $('thread-menu-btn').addEventListener('click', (e) => {
      const r = e.currentTarget.getBoundingClientRect();
      showMenu(r.right - 80, r.bottom + 60, [
        { label: '🗑️ スレッドを削除', danger: true, onClick: () => this.deleteThread() }
      ]);
    });

    const input = $('post-input');
    input.addEventListener('input', () => {
      const list = $('post-list');
      const near = nearBottom(list);
      autosize(input);
      if (near) scrollBottom(list);
    });
    input.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' || e.isComposing || e.keyCode === 229) return;
      if (e.metaKey || e.ctrlKey) { e.preventDefault(); this.submitPost(); }
    });
    $('post-send-btn').addEventListener('mousedown', (e) => e.preventDefault());
    $('post-send-btn').addEventListener('click', () => this.submitPost());

    const list = $('post-list');
    list.addEventListener('scroll', () => {
      this.stick = nearBottom(list);
      $('post-jump').hidden = this.stick;
    }, { passive: true });
    $('post-jump').addEventListener('click', () => scrollBottom(list));
    list.addEventListener('click', (e) => {
      const ref = e.target.closest('.ref');
      if (ref) { e.preventDefault(); this.jumpTo(parseInt(ref.dataset.ref, 10)); return; }
      const no = e.target.closest('.post-no');
      if (no) { this.insertRef(parseInt(no.textContent, 10)); return; }
      const menuBtn = e.target.closest('.post-menu');
      if (menuBtn) {
        const el = menuBtn.closest('.post');
        const data = el && this.postData.get(parseInt(el.dataset.no, 10));
        if (data) {
          const r = menuBtn.getBoundingClientRect();
          this.openPostMenu(r.left + r.width / 2, r.top, data.key, data.post);
        }
      }
    });

    $('thread-list').addEventListener('click', (e) => {
      const item = e.target.closest('.thread-item');
      if (item) this.openFromList(item.dataset.tid);
    });
  },

  // ---------- 既読管理 ----------
  saveSeen() {
    lsSet(SEEN_KEY, this.seen);
  },

  isViewing() {
    return state.tab === 'board' && !!this.tid && !document.hidden;
  },

  unread(id, t) {
    return Math.max(0, ((t && t.postCount) || 0) - ((this.seen && this.seen[id]) || 0));
  },

  markSeen() {
    const t = this.currentThread();
    if (!t || !this.seen) return;
    const count = t.postCount || 0;
    if ((this.seen[this.tid] || 0) < count) {
      this.seen[this.tid] = count;
      this.saveSeen();
      this.renderList();
      this.updateBadge();
    }
  },

  updateBadge() {
    let total = 0;
    Object.keys(this.threads).forEach((id) => { total += this.unread(id, this.threads[id]); });
    setTabDot('board', total > 0 && state.tab !== 'board');
  },

  onVisible() {
    if (this.isViewing()) this.markSeen();
  },

  // ---------- 画面切替 ----------
  currentThread() {
    return this.tid ? (this.threads[this.tid] || this.extraThread) : null;
  },

  show(tid) {
    const view = $('view-board');
    if (!tid) {
      this.canGoBack = false;
      this.closeThread();
      view.dataset.mode = 'list';
      this.renderList();
      this.updateBadge();
      return;
    }
    view.dataset.mode = 'thread';
    if (tid !== this.tid) {
      this.openThread(tid);
    } else {
      if (this.stick) requestAnimationFrame(() => scrollBottom($('post-list')));
      this.onVisible();
    }
    this.updateBadge();
    this.renderList();
  },

  leave() {
    this.canGoBack = false;
    this.updateBadge();
  },

  openFromList(id) {
    const push = !this.tid;
    if (push) this.canGoBack = true;
    navigate('#/board/' + id, { replace: !push });
  },

  backToList() {
    if (!this.tid) return;
    if (this.canGoBack) {
      this.canGoBack = false;
      history.back();
    } else {
      navigate('#/board', { replace: true });
    }
  },

  // ---------- スレッド一覧 ----------
  renderList() {
    const list = $('thread-list');
    const top = list.scrollTop;
    const entries = Object.keys(this.threads)
      .map((id) => ({ id: id, t: this.threads[id] }))
      .filter((e) => e.t && typeof e.t.title === 'string');
    entries.sort((a, b) => (b.t.lastPostAt || 0) - (a.t.lastPostAt || 0));

    list.textContent = '';
    entries.forEach(({ id, t }) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'thread-item' + (id === this.tid ? ' current' : '');
      btn.dataset.tid = id;

      const title = document.createElement('div');
      title.className = 't-title';
      const name = document.createElement('span');
      name.textContent = t.title;
      title.appendChild(name);
      const unread = this.unread(id, t);
      if (unread > 0 && id !== this.tid) {
        const badge = document.createElement('span');
        badge.className = 'badge';
        badge.textContent = '新着 ' + unread;
        title.appendChild(badge);
      }

      const meta = document.createElement('div');
      meta.className = 't-meta';
      meta.textContent = (t.postCount || 0) + 'レス · ' + (t.isAnon ? '匿名' : (t.authorName || '')) + ' · ' + formatTime(t.lastPostAt);

      btn.appendChild(title);
      btn.appendChild(meta);
      list.appendChild(btn);
    });

    list.scrollTop = top;
    $('thread-empty-list').hidden = entries.length > 0;
  },

  updateHeader() {
    const t = this.currentThread();
    $('thread-title').textContent = t ? t.title : '読み込み中…';
    $('thread-menu-btn').hidden = !(t && t.createdBy === state.user.id);
  },

  // ---------- スレッド表示 ----------
  openThread(tid) {
    this.closeThread();
    this.tid = tid;
    this.knownCurrent = !!this.threads[tid];
    this.postsLoaded = false;
    this.stick = true;
    $('post-list').textContent = '';
    $('post-jump').hidden = true;
    this.updateHeader();

    if (!this.threads[tid]) {
      db.ref('board/threads/' + tid).once('value').then((snap) => {
        if (this.tid !== tid) return;
        const t = snap.val();
        if (!t || typeof t.title !== 'string') {
          showToast('スレッドが見つかりません', 'error');
          navigate('#/board', { replace: true });
          return;
        }
        this.extraThread = t;
        this.knownCurrent = true;
        this.updateHeader();
      }).catch((err) => {
        showToast(errorText(err, 'データを取得できませんでした'), 'error');
      });
    }

    const ref = db.ref('board/posts/' + tid).orderByKey().limitToLast(POST_LIMIT);
    const handlers = {
      added: (snap, prev) => this.addPost(snap, prev),
      changed: (snap) => this.changePost(snap),
      removed: (snap) => this.removePost(snap)
    };
    this.postRef = ref;
    this.handlers = handlers;
    ref.on('child_added', handlers.added, (err) => {
      showToast(errorText(err, 'データを取得できませんでした'), 'error');
    });
    ref.on('child_changed', handlers.changed);
    ref.on('child_removed', handlers.removed);
    ref.once('value').then(() => {
      if (this.tid !== tid) return;
      this.postsLoaded = true;
      scrollBottom($('post-list'));
      this.markSeen();
    }).catch(() => { /* 取得エラーは child_added 側で通知済み */ });
  },

  closeThread() {
    if (this.postRef && this.handlers) {
      this.postRef.off('child_added', this.handlers.added);
      this.postRef.off('child_changed', this.handlers.changed);
      this.postRef.off('child_removed', this.handlers.removed);
    }
    this.postRef = null;
    this.handlers = null;
    this.tid = null;
    this.extraThread = null;
    this.knownCurrent = false;
    this.postEls.clear();
    this.postData.clear();
    this.backrefs.clear();
    this.postsLoaded = false;
    $('post-list').textContent = '';
  },

  // ---------- レス ----------
  addPost(snap, prevKey) {
    const p = snap.val();
    if (!p || typeof p.no !== 'number' || this.postEls.has(snap.key)) return;

    const list = $('post-list');
    const wasNear = nearBottom(list);
    const el = this.renderPost(snap.key, p);
    this.postEls.set(snap.key, el);
    this.postData.set(p.no, { key: snap.key, post: p });

    const prev = prevKey ? this.postEls.get(prevKey) : null;
    if (prev) prev.after(el);
    else if (prevKey) list.appendChild(el);
    else list.prepend(el);

    this.trackBackrefs(p);
    this.renderBackrefs(p.no);

    if (!this.postsLoaded) return;
    if (p.userId === state.user.id || wasNear) scrollBottom(list);
    else $('post-jump').hidden = false;
  },

  changePost(snap) {
    const p = snap.val();
    const old = this.postEls.get(snap.key);
    if (!p || !old) return;
    const el = this.renderPost(snap.key, p);
    old.replaceWith(el);
    this.postEls.set(snap.key, el);
    this.postData.set(p.no, { key: snap.key, post: p });
    this.renderBackrefs(p.no);
  },

  removePost(snap) {
    const el = this.postEls.get(snap.key);
    if (el) el.remove();
    this.postEls.delete(snap.key);
    this.postData.forEach((v, no) => { if (v.key === snap.key) this.postData.delete(no); });
  },

  renderPost(key, p) {
    const mine = p.userId === state.user.id;
    const el = document.createElement('article');
    el.className = 'post' + (mine ? ' mine' : '') + (p.deleted ? ' deleted' : '');
    el.dataset.no = String(p.no);
    el.dataset.key = key;

    const head = document.createElement('div');
    head.className = 'post-head';

    const no = document.createElement('span');
    no.className = 'post-no';
    no.textContent = String(p.no);
    no.title = 'タップして返信';
    head.appendChild(no);

    const name = document.createElement('span');
    name.className = 'post-name';
    name.textContent = displayName(p);
    head.appendChild(name);

    if (mine) {
      const chip = document.createElement('span');
      chip.className = 'chip';
      chip.textContent = '自分';
      head.appendChild(chip);
    }

    const time = document.createElement('span');
    time.textContent = formatTime(p.timestamp);
    head.appendChild(time);

    if (!p.deleted) {
      const menu = document.createElement('button');
      menu.type = 'button';
      menu.className = 'post-menu';
      menu.setAttribute('aria-label', 'レスのメニュー');
      menu.textContent = '⋯';
      head.appendChild(menu);
    }

    const body = document.createElement('div');
    body.className = 'post-body';
    if (p.deleted) body.textContent = 'この投稿は削除されました';
    else body.innerHTML = formatText(p.text, { refs: true });

    const backrefs = document.createElement('div');
    backrefs.className = 'post-backrefs';
    backrefs.hidden = true;

    el.appendChild(head);
    el.appendChild(body);
    el.appendChild(backrefs);

    if (!p.deleted) {
      attachLongPress(el, (x, y) => this.openPostMenu(x, y, key, p));
    }
    return el;
  },

  trackBackrefs(p) {
    if (p.deleted || typeof p.text !== 'string') return;
    new Set(extractRefs(p.text)).forEach((target) => {
      if (target === p.no) return;
      if (!this.backrefs.has(target)) this.backrefs.set(target, new Set());
      this.backrefs.get(target).add(p.no);
      this.renderBackrefs(target);
    });
  },

  renderBackrefs(no) {
    const data = this.postData.get(no);
    if (!data) return;
    const el = this.postEls.get(data.key);
    const box = el && el.querySelector('.post-backrefs');
    if (!box) return;
    const set = this.backrefs.get(no);
    if (!set || set.size === 0) {
      box.hidden = true;
      box.textContent = '';
      return;
    }
    box.hidden = false;
    box.innerHTML = '返信: ' + Array.from(set).sort((a, b) => a - b).slice(0, 20)
      .map((n) => '<a class="ref" data-ref="' + n + '">&gt;&gt;' + n + '</a>').join(' ');
  },

  jumpTo(no) {
    const data = this.postData.get(no);
    const el = data && this.postEls.get(data.key);
    if (!el) { showToast('そのレスは見つかりません'); return; }
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    el.classList.remove('flash');
    void el.offsetWidth;
    el.classList.add('flash');
  },

  insertRef(no) {
    if (!no) return;
    const ta = $('post-input');
    const sep = ta.value && !/\s$/.test(ta.value) ? ' ' : '';
    ta.value += sep + '>>' + no + ' ';
    autosize(ta);
    ta.focus();
    ta.setSelectionRange(ta.value.length, ta.value.length);
  },

  openPostMenu(x, y, key, p) {
    const items = [
      { label: '↩️ このレスに返信', onClick: () => this.insertRef(p.no) },
      { label: '📋 テキストをコピー', onClick: () => copyText(p.text || '') }
    ];
    if (p.userId === state.user.id && !p.deleted) {
      items.push({ label: '🗑️ 削除', danger: true, onClick: () => this.deletePost(key, p) });
    }
    showMenu(x, y, items);
  },

  async deletePost(key, p) {
    const ok = await confirmDialog('この投稿を削除しますか？（番号は残り、「削除されました」と表示されます）', '削除する', true);
    if (!ok || !this.tid) return;
    try {
      await db.ref('board/posts/' + this.tid + '/' + key).update({ deleted: true, text: null });
    } catch (err) {
      showToast(errorText(err, '削除できませんでした'), 'error');
    }
  },

  // ---------- 書き込み ----------
  async submitPost() {
    if (this.sending) return;
    const input = $('post-input');
    const text = input.value.trim();
    const tid = this.tid;
    if (!text || !tid) return;
    if (text.length > MAX_TEXT) {
      showToast('書き込みは' + MAX_TEXT + '文字以内にしてください', 'error');
      return;
    }
    if (!this.currentThread()) {
      showToast('スレッドが見つかりません', 'error');
      return;
    }
    if (!canWrite()) return;

    const isAnon = state.postMode === 'anon';
    this.sending = true;
    $('post-send-btn').disabled = true;
    try {
      // 投稿番号を採番（同時投稿でも重複しない）
      const result = await db.ref('board/threads/' + tid + '/postCount').transaction((n) => (n || 0) + 1);
      if (!result.committed) throw new Error('番号を採番できませんでした');
      const no = result.snapshot.val();

      const updates = {};
      updates['board/posts/' + tid + '/' + padNo(no)] = {
        no: no,
        userId: state.user.id,
        sender: isAnon ? '匿名' : state.user.name,
        isAnon: isAnon,
        text: text,
        timestamp: firebase.database.ServerValue.TIMESTAMP
      };
      updates['board/threads/' + tid + '/lastPostAt'] = firebase.database.ServerValue.TIMESTAMP;
      await db.ref().update(updates);

      input.value = '';
      autosize(input);
    } catch (err) {
      showToast(errorText(err, '投稿できませんでした。通信状況を確認してください'), 'error');
    } finally {
      this.sending = false;
      $('post-send-btn').disabled = false;
    }
  },

  // ---------- スレッド作成 / 削除 ----------
  openCreate() {
    $('thread-title-input').value = '';
    $('thread-body-input').value = '';
    openOverlay('thread-sheet');
    setTimeout(() => $('thread-title-input').focus(), 50);
  },

  async createThread() {
    if (this.creating) return;
    const title = $('thread-title-input').value.trim();
    const body = $('thread-body-input').value.trim();
    if (!title) { showToast('タイトルを入力してください', 'error'); return; }
    if (title.length > MAX_TITLE) { showToast('タイトルは' + MAX_TITLE + '文字以内にしてください', 'error'); return; }
    if (!body) { showToast('最初の書き込みを入力してください', 'error'); return; }
    if (body.length > MAX_TEXT) { showToast('書き込みは' + MAX_TEXT + '文字以内にしてください', 'error'); return; }
    if (!canWrite()) return;

    const isAnon = state.postMode === 'anon';
    const sender = isAnon ? '匿名' : state.user.name;
    const stamp = firebase.database.ServerValue.TIMESTAMP;
    const id = db.ref('board/threads').push().key;

    const updates = {};
    updates['board/threads/' + id] = {
      title: title,
      createdBy: state.user.id,
      authorName: sender,
      isAnon: isAnon,
      createdAt: stamp,
      lastPostAt: stamp,
      postCount: 1
    };
    updates['board/posts/' + id + '/' + padNo(1)] = {
      no: 1,
      userId: state.user.id,
      sender: sender,
      isAnon: isAnon,
      text: body,
      timestamp: stamp
    };

    this.creating = true;
    $('thread-create').disabled = true;
    try {
      await db.ref().update(updates);
      closeOverlay('thread-sheet');
      this.seen[id] = 1;
      this.saveSeen();
      this.openFromList(id);
    } catch (err) {
      showToast(errorText(err, 'スレッドを作成できませんでした'), 'error');
    } finally {
      this.creating = false;
      $('thread-create').disabled = false;
    }
  },

  async deleteThread() {
    const t = this.currentThread();
    const tid = this.tid;
    if (!t || !tid || t.createdBy !== state.user.id) return;
    const ok = await confirmDialog('このスレッドを削除しますか？元に戻せません。', '削除する', true);
    if (!ok) return;

    try {
      const snap = await db.ref('board/posts/' + tid).once('value');
      const posts = snap.val() || {};
      const hasOthers = Object.keys(posts).some((k) => posts[k] && posts[k].userId !== state.user.id);
      if (hasOthers) {
        showToast('他の人の書き込みがあるスレッドは削除できません', 'error');
        return;
      }
      this.selfDeleted = tid;
      const updates = {};
      updates['board/threads/' + tid] = null;
      updates['board/posts/' + tid] = null;
      await db.ref().update(updates);
      showToast('スレッドを削除しました');
    } catch (err) {
      this.selfDeleted = null;
      showToast(errorText(err, '削除できませんでした'), 'error');
    }
  }
};
