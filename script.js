/* 全体基本スタイル */
* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
  -webkit-tap-highlight-color: transparent;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  background-color: #f2f2f7;
  color: #000;
  display: flex;
  flex-direction: column;
  height: 100vh;
  overflow: hidden;
}

/* ヘッダー */
#app-header {
  background-color: #ffffff;
  border-bottom: 1px solid #d1d1d6;
  padding: 12px 16px;
  text-align: center;
  z-index: 100;
}

#page-title {
  font-size: 17px;
  font-weight: 600;
}

/* メインコンテンツ (スクロール可) */
#app-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  padding: 12px;
  gap: 12px;
}

/* メッセージ表示部 */
#message-container {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

/* メッセージバブル */
.message-bubble {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  max-width: 80%;
}

.message-bubble.self {
  align-self: flex-end;
  flex-direction: row-reverse;
}

.message-bubble.other {
  align-self: flex-start;
}

.avatar {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  object-fit: cover;
}

.msg-content {
  background: #ffffff;
  padding: 8px 12px;
  border-radius: 16px;
  box-shadow: 0 1px 2px rgba(0,0,0,0.1);
  font-size: 15px;
  line-height: 1.4;
}

.message-bubble.self .msg-content {
  background-color: #007aff;
  color: #ffffff;
}

.msg-header {
  font-size: 11px;
  color: #8e8e93;
  margin-bottom: 2px;
}

.message-bubble.self .msg-header {
  color: rgba(255, 255, 255, 0.8);
  text-align: right;
}

/* リプライ表示 */
.reply-preview {
  font-size: 12px;
  background: rgba(0, 0, 0, 0.05);
  padding: 4px 8px;
  border-radius: 8px;
  margin-bottom: 4px;
}

.message-bubble.self .reply-preview {
  background: rgba(255, 255, 255, 0.2);
}

/* 地図エリア */
#map-container {
  width: 100%;
  height: 200px;
  border-radius: 12px;
  overflow: hidden;
  box-shadow: 0 1px 3px rgba(0,0,0,0.1);
  margin-top: 10px;
}

#map {
  width: 100%;
  height: 100%;
}

/* 入力エリア・フッター */
#input-area {
  background: #ffffff;
  border-top: 1px solid #d1d1d6;
  padding: 8px 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

/* モード切り替えボタン */
.mode-selector {
  display: flex;
  gap: 8px;
}

.mode-btn {
  flex: 1;
  padding: 6px;
  border: 1px solid #c7c7cc;
  background: #f2f2f7;
  border-radius: 8px;
  font-size: 13px;
  cursor: pointer;
}

.mode-btn.active {
  background: #007aff;
  color: #fff;
  border-color: #007aff;
  font-weight: bold;
}

/* 入力フォーム & 送信ボタン */
.input-composer {
  display: flex;
  gap: 8px;
}

#message-input {
  flex: 1;
  padding: 8px 12px;
  border: 1px solid #c7c7cc;
  border-radius: 20px;
  font-size: 15px;
  outline: none;
}

#send-btn {
  padding: 8px 16px;
  background-color: #007aff;
  color: #ffffff;
  border: none;
  border-radius: 20px;
  font-weight: 600;
  cursor: pointer;
}

/* リプライバー */
#reply-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: #e5e5ea;
  padding: 6px 12px;
  border-radius: 8px;
  font-size: 13px;
}

#reply-bar button {
  background: none;
  border: none;
  font-size: 14px;
  cursor: pointer;
}

/* 長押しカスタムポップアップメニュー */
.context-menu {
  position: fixed;
  background: #ffffff;
  border-radius: 12px;
  box-shadow: 0 4px 12px rgba(0,0,0,0.15);
  z-index: 1000;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  min-width: 140px;
}

.context-menu div {
  padding: 10px 16px;
  font-size: 14px;
  cursor: pointer;
  border-bottom: 1px solid #f2f2f7;
}

.context-menu div:last-child {
  border-bottom: none;
}

.context-menu div.danger {
  color: #ff3b30;
}
