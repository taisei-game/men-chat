// ==========================================
// 設定 (Firebase / LINE LIFF / 利用制限)
// ※ Firebase・LIFF の値は従来の script.js から移しただけで、変更していません
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

// 利用できるメンバー数の上限（先着でメンバー登録されます）
const MAX_MEMBERS = 8;

// 特定のLINEユーザーだけに固定したい場合のみ、userId を並べてください。
// 空のままなら「先着 MAX_MEMBERS 人」で自動登録されます。
// 例: const ALLOWED_USER_IDS = ["Uxxxxxxxx...", "Uyyyyyyyy..."];
const ALLOWED_USER_IDS = [];
