// 状態管理
let isAnonymousMode = false;
let isBbsAnonMode = false;
let isModalAnonMode = false;

// --- 🔐 パスワード & LINEログイン フロー ---
function verifyPassword() {
  const inputPass = document.getElementById('app-password-input').value;
  const errorMsg = document.getElementById('password-error');

  if (inputPass === '10595656') {
    errorMsg.style.display = 'none';
    nextAuthStep('login');
  } else {
    errorMsg.style.display = 'block';
  }
}

function handlePassKeyPress(e) {
  if (e.key === 'Enter') verifyPassword();
}

function startLineLogin() {
  nextAuthStep('notification');
}

function nextAuthStep(stepName) {
  document.getElementById('auth-step-password').style.display = 'none';
  document.getElementById('auth-step-login').style.display = 'none';
  document.getElementById('auth-step-notification').style.display = 'none';
  document.getElementById('auth-step-location').style.display = 'none';

  if (stepName === 'login') {
    document.getElementById('auth-step-login').style.display = 'block';
  } else if (stepName === 'notification') {
    document.getElementById('auth-step-notification').style.display = 'block';
  } else if (stepName === 'location') {
    document.getElementById('auth-step-location').style.display = 'block';
  }
}

function requestNotificationPermission() {
  if ("Notification" in window) {
    Notification.requestPermission().then(permission => {
      if (permission === "granted") {
        new Notification("男性パート", { body: "通知が有効になりました！" });
      }
      nextAuthStep('location');
    });
  } else {
    nextAuthStep('location');
  }
}

function requestLocationPermission() {
  if ("geolocation" in navigator) {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const myData = membersLocation.find(m => m.id === 1);
        if (myData) myData.address = "現在地（GPS同期中）";
        completeAuth();
      },
      (error) => {
        completeAuth();
      }
    );
  } else {
    completeAuth();
  }
}

function completeAuth() {
  document.getElementById('auth-overlay').style.display = 'none';
}

function triggerPushNotification(title, body) {
  if ("Notification" in window && Notification.permission === "granted") {
    new Notification(title, { body: body, icon: 'https://via.placeholder.com/48' });
  }
}

// --- ページ切り替え ---
function switchPage(pageId, title, subTitle = '') {
  document.querySelectorAll('.page-content').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
  
  const targetPage = document.getElementById('page-' + pageId);
  if (targetPage) targetPage.classList.add('active');
  
  if (window.event && window.event.currentTarget) {
    window.event.currentTarget.classList.add('active');
  }
  
  document.getElementById('header-title').innerText = title;
  document.getElementById('header-sub').innerText = subTitle;

  if (pageId === 'talk') scrollToUnread();
  if (pageId === 'short') renderShortFeed();
  if (pageId === 'location') renderMapPins();
}

function scrollToUnread() {
  setTimeout(() => {
    const divider = document.getElementById('unread-divider');
    if (divider) divider.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, 100);
}

// --- トーク機能 ---
function toggleAnonymous() {
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
}

function sendChatMessage() {
  const input = document.getElementById('chat-input');
  const text = input.value.trim();
  if (!text) return;

  const chatContainer = document.getElementById('chat-messages');
  const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  const msgRow = document.createElement('div');
  msgRow.className = 'message-row me';
  const bubbleClass = isAnonymousMode ? 'msg-bubble anon-bubble' : 'msg-bubble my-bubble';
  const prefix = isAnonymousMode ? '[匿名] ' : '';

  msgRow.innerHTML = `
    <div class="msg-content">
      <div class="${bubbleClass}">${prefix}${escapeHtml(text)}</div>
      <span class="msg-time">${timeStr}</span>
    </div>
  `;

  chatContainer.appendChild(msgRow);
  input.value = '';
  chatContainer.scrollTop = chatContainer.scrollHeight;

  const authorName = isAnonymousMode ? '名無しさん' : 'ポメラニアン';
  triggerPushNotification(`💬 グルラ: ${authorName}`, text);
}

function handleKeyPress(e) { if (e.key === 'Enter') sendChatMessage(); }

// --- 掲示板機能 ---
let threads = [
  {
    id: 1, title: '明日の部活について', createdAt: '10:30',
    responses: [
      { num: 1, author: 'ポメラニアン', isAnon: false, time: '10:30', id: 'a1b2c3', body: '明日の部活って8時集合で合ってる？' },
      { num: 2, author: '名無しさん', isAnon: true, time: '10:35', id: 'x9y8z7', body: '合ってるよ！体育館前集合ね。' }
    ]
  }
];
let currentThreadId = null;

function renderThreadList() {
  const container = document.getElementById('thread-list-container');
  if (!container) return;
  container.innerHTML = '';

  threads.forEach(t => {
    const item = document.createElement('div');
    item.className = 'thread-item';
    item.onclick = () => openThreadDetail(t.id);
    item.innerHTML = `
      <div class="thread-item-title">${escapeHtml(t.title)}</div>
      <div class="thread-item-meta">
        <span>レス: ${t.responses.length}</span>
        <span>作成: ${t.createdAt}</span>
      </div>
    `;
    container.appendChild(item);
  });
}

function openThreadModal() { document.getElementById('create-thread-modal').style.display = 'flex'; }
function closeThreadModal() {
  document.getElementById('create-thread-modal').style.display = 'none';
  document.getElementById('modal-thread-title').value = '';
  document.getElementById('modal-thread-body').value = '';
}

function selectModalAnon(isAnon) {
  isModalAnonMode = isAnon;
  document.getElementById('radio-label-normal').classList.toggle('active', !isAnon);
  document.getElementById('radio-label-anon').classList.toggle('active', isAnon);
}

function submitNewThread() {
  const title = document.getElementById('modal-thread-title').value.trim();
  const body = document.getElementById('modal-thread-body').value.trim();

  if (!title || !body) {
    alert('タイトルと1>>（本文）の両方を入力してください！');
    return;
  }

  const newId = Date.now();
  const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const authorName = isModalAnonMode ? '名無しさん' : 'ポメラニアン';

  threads.unshift({
    id: newId, title: title, createdAt: timeStr,
    responses: [{ num: 1, author: authorName, isAnon: isModalAnonMode, time: timeStr, id: Math.random().toString(36).substring(2, 8), body: body }]
  });

  renderThreadList();
  closeThreadModal();
  openThreadDetail(newId);

  triggerPushNotification(`📋 新スレ作成: ${title}`, `${authorName}: ${body}`);
}

function openThreadDetail(threadId) {
  currentThreadId = threadId;
  const thread = threads.find(t => t.id === threadId);
  if (!thread) return;

  document.getElementById('thread-list-container').style.display = 'none';
  document.querySelector('.bbs-top-bar').style.display = 'none';
  document.getElementById('thread-detail-container').style.display = 'flex';
  document.getElementById('detail-thread-title').innerText = thread.title;

  renderResponses(thread.responses);
}

function backToThreadList() {
  document.getElementById('thread-detail-container').style.display = 'none';
  document.getElementById('thread-list-container').style.display = 'flex';
  document.querySelector('.bbs-top-bar').style.display = 'block';
  renderThreadList();
}

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

function toggleBbsAnonymous() {
  isBbsAnonMode = !isBbsAnonMode;
  const btn = document.getElementById('bbs-anon-toggle-btn');
  const icon = document.getElementById('bbs-anon-icon');
  const label = document.getElementById('bbs-anon-label');

  if (isBbsAnonMode) {
    btn.classList.add('is-anon'); icon.innerText = '🕵️'; label.innerText = '匿名';
  } else {
    btn.classList.remove('is-anon'); icon.innerText = '👤'; label.innerText = '通常';
  }
}

function sendBbsRes() {
  const input = document.getElementById('bbs-res-input');
  const text = input.value.trim();
  if (!text || !currentThreadId) return;

  const thread = threads.find(t => t.id === currentThreadId);
  if (!thread) return;

  const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const authorName = isBbsAnonMode ? '名無しさん' : 'ポメラニアン';

  thread.responses.push({
    num: thread.responses.length + 1, author: authorName, isAnon: isBbsAnonMode,
    time: timeStr, id: Math.random().toString(36).substring(2, 8), body: text
  });

  renderResponses(thread.responses);
  input.value = '';

  triggerPushNotification(`📋 スレ「${thread.title}」に新着レス`, `${authorName}: ${text}`);
}

function handleBbsKeyPress(e) { if (e.key === 'Enter') sendBbsRes(); }

// --- ショート機能 ---
let shortsFeed = [
  {
    id: 1, author: 'ポメラニアン', caption: '公園でお散歩中！☀️',
    mediaUrl: 'https://images.unsplash.com/photo-1543466835-00a7907e9de1?auto=format&fit=crop&w=600&q=80',
    isVideo: false, likes: 12, isLiked: false, comments: [{ author: '田中', text: 'かわいい！' }]
  }
];
let currentCommentShortId = null;

function renderShortFeed() {
  const container = document.getElementById('short-feed-container');
  if (!container) return;
  container.innerHTML = '';

  shortsFeed.forEach(short => {
    const card = document.createElement('div');
    card.className = 'short-card';
    const mediaHtml = short.isVideo
      ? `<video src="${short.mediaUrl}" class="short-media" autoplay loop muted playsinline></video>`
      : `<img src="${short.mediaUrl}" class="short-media" alt="ショート">`;
    const likeClass = short.isLiked ? 'action-btn liked' : 'action-btn';

    card.innerHTML = `
      ${mediaHtml}
      <div class="short-overlay">
        <div class="short-info">
          <div class="short-author">👤 ${escapeHtml(short.author)}</div>
          <div class="short-caption">${escapeHtml(short.caption)}</div>
        </div>
        <div class="short-actions">
          <button class="${likeClass}" onclick="toggleLike(${short.id})">
            <span class="action-icon">❤️</span><span class="action-count">${short.likes}</span>
          </button>
          <button class="action-btn" onclick="openCommentModal(${short.id})">
            <span class="action-icon">💬</span><span class="action-count">${short.comments.length}</span>
          </button>
        </div>
      </div>
    `;
    container.appendChild(card);
  });
}

function submitShortPost() {
  const text = document.getElementById('short-input').value.trim();
  const fileInput = document.getElementById('short-file');
  const file = fileInput.files[0];

  if (!text && !file) {
    alert('メッセージまたはメディアを選択してください！');
    return;
  }

  let mediaUrl = 'https://images.unsplash.com/photo-1517849845537-4d257902454a?auto=format&fit=crop&w=600&q=80';
  let isVideo = false;

  if (file) {
    mediaUrl = URL.createObjectURL(file);
    isVideo = file.type.startsWith('video/');
  }

  shortsFeed.unshift({
    id: Date.now(), author: 'ポメラニアン', caption: text || '無題の投稿',
    mediaUrl: mediaUrl, isVideo: isVideo, likes: 0, isLiked: false, comments: []
  });

  document.getElementById('short-input').value = '';
  fileInput.value = '';
  alert('⚡ ショートに投稿しました！');
  renderShortFeed();
}

function toggleLike(shortId) {
  const short = shortsFeed.find(s => s.id === shortId);
  if (!short) return;
  short.isLiked ? (short.likes--, short.isLiked = false) : (short.likes++, short.isLiked = true);
  renderShortFeed();
}

function openCommentModal(shortId) {
  currentCommentShortId = shortId;
  const short = shortsFeed.find(s => s.id === shortId);
  if (!short) return;
  document.getElementById('comment-count').innerText = short.comments.length;
  renderCommentList(short.comments);
  document.getElementById('short-comment-modal').style.display = 'flex';
}

function closeCommentModal() { document.getElementById('short-comment-modal').style.display = 'none'; }

function renderCommentList(comments) {
  const listContainer = document.getElementById('short-comment-list');
  listContainer.innerHTML = '';
  comments.forEach(c => {
    const item = document.createElement('div');
    item.className = 'comment-item';
    item.innerHTML = `<span class="comment-author">${escapeHtml(c.author)}:</span><span>${escapeHtml(c.text)}</span>`;
    listContainer.appendChild(item);
  });
}

function sendShortComment() {
  const input = document.getElementById('short-comment-input');
  const text = input.value.trim();
  if (!text || !currentCommentShortId) return;

  const short = shortsFeed.find(s => s.id === currentCommentShortId);
  if (!short) return;

  short.comments.push({ author: 'ポメラニアン', text: text });
  input.value = '';
  document.getElementById('comment-count').innerText = short.comments.length;
  renderCommentList(short.comments);
  renderShortFeed();
}

function handleCommentKeyPress(e) { if (e.key === 'Enter') sendShortComment(); }

// --- 位置情報機能 ---
let membersLocation = [
  { id: 1, name: 'ポメラニアン (自分)', avatar: 'https://via.placeholder.com/48', x: 50, y: 50, battery: 88, address: '現在地', stayTime: '10分' },
  { id: 2, name: '田中', avatar: 'https://via.placeholder.com/48', x: 30, y: 40, battery: 65, address: '新宿区歌舞伎町 付近', stayTime: '45分' },
  { id: 3, name: '鈴木', avatar: 'https://via.placeholder.com/48', x: 70, y: 35, battery: 92, address: '池袋駅前 付近', stayTime: '2時間' },
  { id: 4, name: '佐藤', avatar: 'https://via.placeholder.com/48', x: 25, y: 70, battery: 15, address: '品川区 付近', stayTime: '5分' },
  { id: 5, name: '高橋', avatar: 'https://via.placeholder.com/48', x: 80, y: 75, battery: 40, address: '横浜市 中区 付近', stayTime: '1時間' },
  { id: 6, name: '渡辺', avatar: 'https://via.placeholder.com/48', x: 45, y: 25, battery: 100, address: '上野公園 付近', stayTime: '30分' },
  { id: 7, name: '伊藤', avatar: 'https://via.placeholder.com/48', x: 60, y: 65, battery: 55, address: '秋葉原 付近', stayTime: '20分' },
  { id: 8, name: '山本', avatar: 'https://via.placeholder.com/48', x: 35, y: 80, battery: 78, address: '世田谷区 付近', stayTime: '50分' }
];
let selectedMemberId = null;

function renderMapPins() {
  const container = document.getElementById('map-pins-container');
  if (!container) return;
  container.innerHTML = '';

  membersLocation.forEach(member => {
    const pin = document.createElement('div');
    pin.className = 'map-pin';
    if (selectedMemberId === member.id) pin.classList.add('active');
    pin.style.left = `${member.x}%`;
    pin.style.top = `${member.y}%`;
    pin.onclick = () => selectMemberPin(member.id);

    pin.innerHTML = `
      <div class="pin-avatar-wrapper">
        <img src="${member.avatar}" class="pin-avatar" alt="${member.name}">
        <span class="pin-battery">${member.battery}%</span>
      </div>
      <span class="pin-name">${escapeHtml(member.name)}</span>
    `;
    container.appendChild(pin);
  });
}

function selectMemberPin(memberId) {
  selectedMemberId = memberId;
  const member = membersLocation.find(m => m.id === memberId);
  if (!member) return;

  renderMapPins();

  const card = document.getElementById('user-location-card');
  document.getElementById('card-avatar').src = member.avatar;
  document.getElementById('card-name').innerText = member.name;
  document.getElementById('card-address').innerText = `📍 ${member.address}`;
  document.getElementById('card-battery-level').innerText = `${member.battery}%`;
  document.getElementById('card-time').innerText = `滞在時間: ${member.stayTime}`;
  card.style.display = 'block';
}

function openDirectChat() { switchPage('talk', '男性パート', '8人のグループ'); }

function escapeHtml(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

document.addEventListener('DOMContentLoaded', () => {
  renderThreadList();
});
