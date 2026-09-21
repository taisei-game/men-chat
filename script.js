import { initializeApp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";
import { getDatabase, ref, push, onChildAdded, set, get, child } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-database.js";

// Firebase 実環境設定
const firebaseConfig = {
  apiKey: "AIzaSyBeOjoG6sXFBdAFkBl2lgQ2yt7LXMoqz5Q",
  authDomain: "men-line-9e545.firebaseapp.com",
  databaseURL: "https://men-line-9e545-default-rtdb.firebaseio.com",
  projectId: "men-line-9e545",
  storageBucket: "men-line-9e545.firebasestorage.app",
  messagingSenderId: "1026870493148",
  appId: "1:1026870493148:web:144f169c0210816d229919"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

// 2011678992-Jyti5NM1
const MY_LIFF_ID = "YOUR_LIFF_ID_HERE";

// ログインユーザー情報
let currentUser = {
  uid: null,
  name: "読み込み中...",
  avatar: ""
};

// ★デフォルトをすべて「匿名モード (true)」に設定★
let isAnonymousMode = true;
let isBbsAnonMode = true;
let isModalAnonMode = true;

let selectedBase64Image = null;
let isLocationSharing = true;
let currentThreadId = null;

// --- LINE LIFF ログイン・プロファイル取得 ---
async function initLiff() {
  try {
    await liff.init({ liffId: MY_LIFF_ID });

    if (!liff.isLoggedIn()) {
      liff.login();
      return;
    }

    const profile = await liff.getProfile();
    currentUser.uid = profile.userId;
    currentUser.name = profile.displayName;
    currentUser.avatar = profile.pictureUrl || "https://via.placeholder.com/64";

    // Firebaseへユーザープロフィール同期
    await set(ref(db, 'users/' + currentUser.uid), {
      name: currentUser.name,
      avatar: currentUser.avatar,
      lastSeen: Date.now()
    });

    // UIの反映
    document.getElementById('user-name').innerText = currentUser.name;
    document.getElementById('user-avatar').src = currentUser.avatar;

  } catch (err) {
    console.error("LIFFログインエラー:", err);
    alert("LINEログインの初期化に失敗しました。LIFF IDの設定を確認してください。");
  }
}

// --- ページ切替 ---
window.switchPage = function(pageId, title, subTitle = '') {
  document.querySelectorAll('.page-content').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
  
  document.getElementById('page-' + pageId).classList.add('active');
  if (window.event && window.event.currentTarget) {
    window.event.currentTarget.classList.add('active');
  }
  
  document.getElementById('header-title').innerText = title;
  document.getElementById('header-sub').innerText = subTitle;

  if (pageId === 'location') updateUserLocation();
};

// --- Web Push 通知機能 ---
window.requestNotificationPermission = function() {
  if ("Notification" in window) {
    Notification.requestPermission().then(permission => {
      if (permission === "granted") {
        alert("🔔 プッシュ通知が有効になりました！");
      } else {
        alert("通知の許可が得られませんでした。");
      }
    });
  }
};

function sendLocalNotification(title, body) {
  if ("Notification" in window && Notification.permission === "granted" && document.hidden) {
    new Notification(title, { body: body, icon: currentUser.avatar });
  }
}

// --- 1. トーク機能（デフォルト匿名） ---
window.toggleAnonymous = function() {
  isAnonymousMode = !isAnonymousMode;
  const btn = document.getElementById('anon-toggle-btn');
  const icon = document.getElementById('anon-icon');
  const label = document.getElementById('anon-label');

  if (isAnonymousMode) {
    btn.classList.add('is-anon');
    icon.innerText = '🕵️'; label.innerText = '匿名';
  } else {
    btn.classList.remove('is-anon');
    icon.innerText = '👤'; label.innerText = '通常';
  }
};

window.sendChatMessage = function() {
  const input = document.getElementById('chat-input');
  const text = input.value.trim();
  if (!text || !currentUser.uid) return;

  const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  push(ref(db, 'chats'), {
    senderUid: currentUser.uid,
    senderName: isAnonymousMode ? '名無しさん' : currentUser.name,
    senderAvatar: isAnonymousMode ? '' : currentUser.avatar,
    text: text,
    isAnon: isAnonymousMode,
    time: timeStr,
    timestamp: Date.now()
  });

  input.value = '';
};

window.handleKeyPress = function(e) { if (e.key === 'Enter') sendChatMessage(); };

onChildAdded(ref(db, 'chats'), (snapshot) => {
  const data = snapshot.val();
  const chatContainer = document.getElementById('chat-messages');

  const isMe = data.senderUid === currentUser.uid && !data.isAnon;
  const msgRow = document.createElement('div');
  msgRow.className = isMe ? 'message-row me' : 'message-row other';

  const avatarSrc = data.isAnon || !data.senderAvatar ? 'https://via.placeholder.com/36/334155/fff?text=🕵️' : data.senderAvatar;
  const bubbleClass = isMe ? 'msg-bubble my-bubble' : (data.isAnon ? 'msg-bubble anon-bubble' : 'msg-bubble');

  msgRow.innerHTML = `
    ${!isMe ? `<img src="${avatarSrc}" class="msg-avatar">` : ''}
    <div class="msg-content">
      ${!isMe ? `<span class="msg-author">${escapeHtml(data.senderName)}</span>` : ''}
      <div class="${bubbleClass}">${escapeHtml(data.text)}</div>
      <span class="msg-time">${data.time}</span>
    </div>
  `;

  chatContainer.appendChild(msgRow);
  chatContainer.scrollTop = chatContainer.scrollHeight;

  if (!isMe) sendLocalNotification(data.senderName, data.text);
});

// --- 2. 画像添付 ✕ ショート機能 ---
window.previewImage = function(e) {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(event) {
    const img = new Image();
    img.src = event.target.result;
    img.onload = function() {
      const canvas = document.createElement('canvas');
      const MAX_WIDTH = 600;
      const scale = MAX_WIDTH / img.width;
      canvas.width = (img.width > MAX_WIDTH) ? MAX_WIDTH : img.width;
      canvas.height = (img.width > MAX_WIDTH) ? img.height * scale : img.height;

      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      selectedBase64Image = canvas.toDataURL('image/jpeg', 0.6);
      document.getElementById('image-preview').src = selectedBase64Image;
      document.getElementById('image-preview-container').style.display = 'block';
    };
  };
  reader.readAsDataURL(file);
};

window.submitShortPost = function() {
  const text = document.getElementById('short-input').value.trim();
  if (!text && !selectedBase64Image) {
    alert('文字または画像を入力してください！');
    return;
  }

  const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  push(ref(db, 'shorts'), {
    senderUid: currentUser.uid,
    senderName: currentUser.name,
    senderAvatar: currentUser.avatar,
    text: text,
    image: selectedBase64Image || null,
    time: timeStr,
    timestamp: Date.now()
  });

  document.getElementById('short-input').value = '';
  document.getElementById('image-preview-container').style.display = 'none';
  selectedBase64Image = null;
  alert('⚡ ショートに投稿しました！');
};

onChildAdded(ref(db, 'shorts'), (snapshot) => {
  const data = snapshot.val();
  const timeline = document.getElementById('short-timeline');

  const card = document.createElement('div');
  card.className = 'card';
  let imgTag = data.image ? `<img src="${data.image}" style="width:100%; border-radius:12px; margin-top:8px;">` : '';

  card.innerHTML = `
    <div style="display:flex; align-items:center; gap:8px; margin-bottom:8px;">
      <img src="${data.senderAvatar}" style="width:32px; height:32px; border-radius:50%;">
      <div style="flex:1;"><b style="font-size:13px;">${escapeHtml(data.senderName)}</b></div>
      <span style="font-size:11px; color:#64748b;">${data.time}</span>
    </div>
    <div style="font-size:14px;">${escapeHtml(data.text)}</div>
    ${imgTag}
  `;

  timeline.prepend(card);
});

// --- 3. 掲示板機能（デフォルト匿名） ---
window.openThreadModal = () => {
  document.getElementById('create-thread-modal').style.display = 'flex';
  selectModalAnon(true);
};

window.closeThreadModal = () => {
  document.getElementById('create-thread-modal').style.display = 'none';
  document.getElementById('modal-thread-title').value = '';
  document.getElementById('modal-thread-body').value = '';
};

window.selectModalAnon = (isAnon) => {
  isModalAnonMode = isAnon;
  document.getElementById('radio-label-normal').classList.toggle('active', !isAnon);
  document.getElementById('radio-label-anon').classList.toggle('active', isAnon);
};

window.submitNewThread = function() {
  const title = document.getElementById('modal-thread-title').value.trim();
  const body = document.getElementById('modal-thread-body').value.trim();
  if (!title || !body) return alert('タイトルと本文を入力してください！');

  const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const authorName = isModalAnonMode ? '名無しさん' : currentUser.name;

  const newThreadRef = push(ref(db, 'bbs/threads'));
  
  const initialResponse = {
    num: 1,
    author: authorName,
    isAnon: isModalAnonMode,
    time: timeStr,
    id: currentUser.uid ? currentUser.uid.substring(0, 6) : 'guest',
    body: body
  };

  set(newThreadRef, {
    title: title,
    createdAt: timeStr,
    responses: [initialResponse]
  });

  window.closeThreadModal();
};

onChildAdded(ref(db, 'bbs/threads'), (snapshot) => {
  const threadId = snapshot.key;
  const data = snapshot.val();
  const container = document.getElementById('thread-list-container');

  const item = document.createElement('div');
  item.className = 'thread-item';
  item.onclick = () => window.openThreadDetail(threadId);
  item.innerHTML = `
    <div class="thread-item-title">${escapeHtml(data.title)}</div>
    <div class="thread-item-meta">
      <span>レス: ${data.responses ? data.responses.length : 1}</span>
      <span>作成: ${data.createdAt}</span>
    </div>
  `;
  container.prepend(item);
});

window.openThreadDetail = async function(threadId) {
  currentThreadId = threadId;
  document.getElementById('thread-list-container').style.display = 'none';
  document.querySelector('.bbs-top-bar').style.display = 'none';
  document.getElementById('thread-detail-container').style.display = 'flex';

  const snapshot = await get(child(ref(db), `bbs/threads/${threadId}`));
  if (snapshot.exists()) {
    const threadData = snapshot.val();
    document.getElementById('detail-thread-title').innerText = threadData.title;
    renderResponses(threadData.responses || []);
  }
};

window.backToThreadList = function() {
  document.getElementById('thread-detail-container').style.display = 'none';
  document.getElementById('thread-list-container').style.display = 'flex';
  document.querySelector('.bbs-top-bar').style.display = 'block';
  currentThreadId = null;
};

function renderResponses(responses) {
  const resContainer = document.getElementById('res-list');
  resContainer.innerHTML = '';

  responses.forEach(r => {
    const resCard = document.createElement('div');
    resCard.className = 'res-card';
    const authorClass = r.isAnon ? 'res-author anon' : 'res-author';

    resCard.innerHTML = `
      <div class="res-header">
        <span class="res-num">${r.num}</span>
        <span class="${authorClass}">${escapeHtml(r.author)}</span>
        <span>${r.time}</span>
        <span>ID:${r.id}</span>
      </div>
      <div class="res-body">${escapeHtml(r.body)}</div>
    `;
    resContainer.appendChild(resCard);
  });
  resContainer.scrollTop = resContainer.scrollHeight;
}

window.toggleBbsAnonymous = function() {
  isBbsAnonMode = !isBbsAnonMode;
  const btn = document.getElementById('bbs-anon-toggle-btn');
  btn.classList.toggle('is-anon', isBbsAnonMode);
  document.getElementById('bbs-anon-icon').innerText = isBbsAnonMode ? '🕵️' : '👤';
  document.getElementById('bbs-anon-label').innerText = isBbsAnonMode ? '匿名' : '通常';
};

window.sendBbsRes = async function() {
  const input = document.getElementById('bbs-res-input');
  const text = input.value.trim();
  if (!text || !currentThreadId) return;

  const snapshot = await get(child(ref(db), `bbs/threads/${currentThreadId}`));
  if (snapshot.exists()) {
    const threadData = snapshot.val();
    const responses = threadData.responses || [];

    const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const newRes = {
      num: responses.length + 1,
      author: isBbsAnonMode ? '名無しさん' : currentUser.name,
      isAnon: isBbsAnonMode,
      time: timeStr,
      id: currentUser.uid ? currentUser.uid.substring(0, 6) : 'guest',
      body: text
    };

    responses.push(newRes);
    await set(ref(db, `bbs/threads/${currentThreadId}/responses`), responses);

    renderResponses(responses);
    input.value = '';
  }
};

window.handleBbsKeyPress = function(e) { if (e.key === 'Enter') sendBbsRes(); };

// --- 4. 位置情報機能（端末GPS・実データ連動） ---
window.toggleLocationSharing = function() {
  isLocationSharing = !isLocationSharing;
  const btn = document.getElementById('btn-loc-toggle');
  btn.innerText = isLocationSharing ? "共有: ON" : "共有: OFF";
  btn.style.background = isLocationSharing ? "var(--line-green)" : "#64748b";

  if (isLocationSharing) {
    updateUserLocation();
  } else {
    document.getElementById('map-pins-container').innerHTML = '';
  }
};

function updateUserLocation() {
  if (!isLocationSharing || !navigator.geolocation) return;

  navigator.geolocation.getCurrentPosition(
    (position) => {
      const lat = position.coords.latitude;
      const lng = position.coords.longitude;

      if (currentUser.uid) {
        set(ref(db, 'locations/' + currentUser.uid), {
          name: currentUser.name,
          avatar: currentUser.avatar,
          lat: lat,
          lng: lng,
          updatedAt: Date.now()
        });
      }

      renderMapPin(lat, lng);
    },
    (error) => {
      console.warn("位置情報の取得許可が得られませんでした:", error);
    }
  );
}

function renderMapPin(lat, lng) {
  const container = document.getElementById('map-pins-container');
  if (!container) return;
  container.innerHTML = '';

  const pin = document.createElement('div');
  pin.className = 'map-pin';
  pin.style.left = '50%';
  pin.style.top = '50%';
  
  pin.innerHTML = `
    <div class="pin-avatar-wrapper">
      <img src="${currentUser.avatar}" class="pin-avatar">
    </div>
    <span class="pin-name">${escapeHtml(currentUser.name)}</span>
  `;

  pin.onclick = () => {
    const card = document.getElementById('user-location-card');
    document.getElementById('card-avatar').src = currentUser.avatar;
    document.getElementById('card-name').innerText = currentUser.name;
    document.getElementById('card-address').innerText = `📍 緯度:${lat.toFixed(2)} 経度:${lng.toFixed(2)}`;
    card.style.display = 'block';
  };

  container.appendChild(pin);
}

function escapeHtml(str) {
  return str ? String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') : '';
}

// 初期化実行
document.addEventListener('DOMContentLoaded', () => {
  initLiff();
});
