// ==========================================
// 1. 設定情報の初期化 (Firebase & LINE LIFF)
// ==========================================
const firebaseConfig = {
  apiKey: "AIzaSyDUvIlgEVhH-CDO2HvVXPx8-somFgjj6Ro",
  authDomain: "men-chat-412f0.firebaseapp.com",
  databaseURL: "https://men-chat-412f0-default-rtdb.firebaseio.com",
  projectId: "men-chat-412f0",
  storageBucket: "men-chat-412f0.firebasestorage.app",
  messagingSenderId: "261075547935",
  appId: "1:261075547935:web:3f452b7e774dd8ebbfe22a"
};

const MY_LIFF_ID = "2011678992-Jyti5NM1";
const ANON_AVATAR = "https://via.placeholder.com/40/888888/ffffff?text=%E2%9D%93"; // 匿名用アイコン

// Firebase初期化
firebase.initializeApp(firebaseConfig);
const db = firebase.database();

// アプリのグローバル状態管理
const state = {
  user: {
    id: "",
    name: "ゲスト",
    avatar: "https://via.placeholder.com/40"
  },
  postMode: "normal", // 'normal' または 'anon' (手動切り替えまで維持)
  currentRoom: "main",
  replyToMessage: null
};

// ==========================================
// 2. 起動処理 (LINE LIFF 認証・イベント登録)
// ==========================================
window.addEventListener('DOMContentLoaded', () => {
  initLiff();
  setupUIEvents();
  listenToMessages('main');
  initMap();
});

// LINE LIFF初期化
function initLiff() {
  liff.init({ liffId: MY_LIFF_ID })
    .then(() => {
      if (liff.isLoggedIn()) {
        liff.getProfile().then(profile => {
          state.user.id = profile.userId;
          state.user.name = profile.displayName;
          state.user.avatar = profile.pictureUrl || "https://via.placeholder.com/40";
          
          const headerTitle = document.getElementById('page-title');
          if (headerTitle) {
            headerTitle.innerText = `💬 トーク (${state.user.name})`;
          }
        });
      } else {
        liff.login();
      }
    })
    .catch((err) => {
      console.error("LIFF 初期化エラー:", err);
    });
}

// ==========================================
// 3. UIイベント & モード切り替え
// ==========================================
function setupUIEvents() {
  const modeNormalBtn = document.getElementById('mode-normal');
  const modeAnonBtn = document.getElementById('mode-anon');

  if (modeNormalBtn && modeAnonBtn) {
    modeNormalBtn.addEventListener('click', () => setPostMode('normal'));
    modeAnonBtn.addEventListener('click', () => setPostMode('anon'));
  }

  const sendBtn = document.getElementById('send-btn');
  if (sendBtn) {
    sendBtn.addEventListener('click', sendMessage);
  }

  const msgInput = document.getElementById('message-input');
  if (msgInput) {
    msgInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });
  }
}

// 投稿モード切替（※送信後も指定モードを維持します）
function setPostMode(mode) {
  state.postMode = mode;
  const modeNormalBtn = document.getElementById('mode-normal');
  const modeAnonBtn = document.getElementById('mode-anon');
  
  if (modeNormalBtn && modeAnonBtn) {
    modeNormalBtn.classList.toggle('active', mode === 'normal');
    modeAnonBtn.classList.toggle('active', mode === 'anon');
  }
}

// ==========================================
// 4. メッセージ送信 & Firebase リアルタイム受信
// ==========================================
function sendMessage() {
  const input = document.getElementById('message-input');
  const text = input.value.trim();
  if (!text) return;

  const isAnon = state.postMode === 'anon';
  
  const messageData = {
    userId: state.user.id || 'anonymous_user',
    sender: isAnon ? '匿名' : state.user.name,
    avatar: isAnon ? ANON_AVATAR : state.user.avatar,
    text: text,
    isAnon: isAnon,
    timestamp: firebase.database.ServerValue.TIMESTAMP,
    replyTo: state.replyToMessage ? state.replyToMessage : null
  };

  // Firebase Realtime Database へ追加
  db.ref(`messages/${state.currentRoom}`).push(messageData)
    .then(() => {
      input.value = '';
      cancelReply();
    })
    .catch((err) => {
      console.error("メッセージ送信エラー:", err);
    });
}

// リアルタイム受信の監視
function listenToMessages(roomId) {
  const container = document.getElementById('message-container');
  if (!container) return;

  db.ref(`messages/${roomId}`).on('value', (snapshot) => {
    container.innerHTML = '';
    const data = snapshot.val();
    if (!data) return;

    Object.keys(data).forEach((key) => {
      const msg = data[key];
      msg.id = key;
      renderMessage(msg, container);
    });

    container.scrollTop = container.scrollHeight;
  });
}

// メッセージDOMの描画
function renderMessage(msg, container) {
  const isSelf = msg.userId === state.user.id;
  const bubble = document.createElement('div');
  bubble.className = `message-bubble ${isSelf ? 'self' : 'other'}`;
  bubble.dataset.msgId = msg.id;

  let replyHtml = '';
  if (msg.replyTo) {
    replyHtml = `<div class="reply-preview">↩️ ${msg.replyTo.sender}: ${msg.replyTo.text}</div>`;
  }

  bubble.innerHTML = `
    <img src="${msg.avatar}" class="avatar">
    <div class="msg-content">
      <div class="msg-header">${msg.sender}</div>
      ${replyHtml}
      <div class="msg-text">${escapeHtml(msg.text)}</div>
    </div>
  `;

  // 長押しメニュー登録
  addLongPressEvent(bubble, msg);

  container.appendChild(bubble);
}

// HTMLエスケープ処理
function escapeHtml(str) {
  return str.replace(/[&<>"']/g, (m) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
  })[m]);
}

// ==========================================
// 5. 長押しメニュー (送信取り消し / リプライ / コピー)
// ==========================================
function addLongPressEvent(element, msg) {
  let timer = null;

  const start = (e) => {
    timer = setTimeout(() => {
      showContextMenu(e, msg);
    }, 500);
  };

  const cancel = () => {
    if (timer) clearTimeout(timer);
  };

  element.addEventListener('touchstart', start, { passive: true });
  element.addEventListener('touchend', cancel);
  element.addEventListener('touchmove', cancel);
  element.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    showContextMenu(e, msg);
  });
}

function showContextMenu(e, msg) {
  const isSelf = msg.userId === state.user.id;
  
  const existing = document.getElementById('custom-context-menu');
  if (existing) existing.remove();

  const menu = document.createElement('div');
  menu.id = 'custom-context-menu';
  menu.className = 'context-menu';

  let menuItems = `
    <div onclick="replyToMsg('${msg.id}', '${msg.sender}', '${escapeHtml(msg.text)}')">↩️ 返信（リプライ）</div>
    <div onclick="copyMsgText('${escapeHtml(msg.text)}')">📋 テキストをコピー</div>
  `;

  if (isSelf) {
    menuItems += `<div class="danger" onclick="deleteMsg('${msg.id}')">🗑️ 送信取り消し</div>`;
  }

  menu.innerHTML = menuItems;

  const touch = e.touches ? e.touches[0] : e;
  menu.style.top = `${touch.clientY}px`;
  menu.style.left = `${touch.clientX}px`;

  document.body.appendChild(menu);

  setTimeout(() => {
    document.addEventListener('click', function closeMenu() {
      menu.remove();
      document.removeEventListener('click', closeMenu);
    });
  }, 10);
}

// 送信取り消し
function deleteMsg(msgId) {
  if (confirm("このメッセージを取り消しますか？")) {
    db.ref(`messages/${state.currentRoom}/${msgId}`).remove();
  }
}

// コピー
function copyMsgText(text) {
  navigator.clipboard.writeText(text).then(() => {
    alert("コピーしました");
  });
}

// リプライ
function replyToMsg(msgId, sender, text) {
  state.replyToMessage = { id: msgId, sender: sender, text: text };
  let replyBar = document.getElementById('reply-bar');
  if (!replyBar) {
    replyBar = document.createElement('div');
    replyBar.id = 'reply-bar';
    document.getElementById('input-area').prepend(replyBar);
  }
  replyBar.innerHTML = `
    <span>↩️ ${sender} への返信: ${text}</span>
    <button onclick="cancelReply()">✕</button>
  `;
}

function cancelReply() {
  state.replyToMessage = null;
  const replyBar = document.getElementById('reply-bar');
  if (replyBar) replyBar.remove();
}

// ==========================================
// 6. 国土地理院地図 (白黒 / 衛星写真 切り替え)
// ==========================================
let map = null;

function initMap() {
  const mapElement = document.getElementById('map');
  if (!mapElement || typeof L === 'undefined') return;

  // 初期位置：東京周辺
  map = L.map('map').setView([35.681236, 139.767125], 13);

  // 国土地理院タイル URL
  const stdUrl = 'https://cyberjapandata.gsi.go.jp/xyz/pale/{z}/{x}/{y}.png'; // 淡色（白黒風）
  const photoUrl = 'https://cyberjapandata.gsi.go.jp/xyz/seamlessphoto/{z}/{x}/{y}.jpg'; // 航空写真

  const stdLayer = L.tileLayer(stdUrl, {
    attribution: '&copy; <a href="https://maps.gsi.go.jp/development/ichiran.html">国土地理院</a>',
    maxZoom: 18
  }).addTo(map);

  const photoLayer = L.tileLayer(photoUrl, {
    attribution: '&copy; <a href="https://maps.gsi.go.jp/development/ichiran.html">国土地理院</a>',
    maxZoom: 18
  });

  // レイヤー切り替えコントロールを追加（右上）
  const baseMaps = {
    "標準（白黒風）": stdLayer,
    "航空写真": photoLayer
  };
  
  L.control.layers(baseMaps).addTo(map);
}
