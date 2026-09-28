# men-chat

8人専用のトーク＋掲示板アプリ（男性パート）。LINE LIFF でログインし、Firebase Realtime Database でリアルタイム同期します。
ビルド不要の静的Webアプリ（HTML / CSS / JavaScript）で、iPhone・Android・iPad のホーム画面にアプリとして追加できます（PWA）。

## 機能

- **トーク**: 通常 / 匿名投稿、返信、自分の投稿の取り消し、新着通知ドット、オフライン表示
- **掲示板**: スレッド作成・一覧、投稿番号、`>>1`（`1>>` も可）でのレス参照と被参照表示、通常 / 匿名、自分の投稿の削除（番号は残る）、自分だけが書き込んだスレッドの削除、新着バッジ、iPad では2ペイン表示
- **利用制限**: LINEログイン後、先着 `MAX_MEMBERS`（8）人まで自動でメンバー登録。9人目以降は利用不可
- **PWA**: manifest / Service Worker / アイコン / standalone表示 / Safe Area / キーボード対応 / ダークモード

地図・位置情報の機能は削除済みです（Leaflet・国土地理院タイル・位置情報の取得は使っていません）。

## ファイル構成

| ファイル | 内容 |
| --- | --- |
| `index.html` | 画面 |
| `style.css` | スタイル |
| `config.js` | Firebase / LIFF ID / メンバー上限の設定 |
| `script.js` | 共通処理・LIFFログイン・メンバー確認・トーク |
| `board.js` | 掲示板 |
| `sw.js` / `manifest.json` / `icons/` | PWA |
| `database.rules.json` | Firebase セキュリティルール案（下記） |

## Firebase のデータ

- `messages/main/...` … 従来のトーク（変更なし）
- `members/<LINE userId>` … メンバー登録（新規）
- `board/threads/<id>` , `board/posts/<id>/<6桁番号>` … 掲示板（新規）

## デプロイ後にやること

1. **LIFF のエンドポイントURL** が、このアプリを公開しているURLと一致していることを確認（LINE Developers）。
2. **Firebase のルール**を確認・更新（Firebase Console → Realtime Database → ルール）。`members` と `board` を読み書きできる必要があります。`database.rules.json` は入力サイズの制限つきの案です。現在のルールを控えてから適用してください。
3. メンバーが決まっていて固定したい場合は、`config.js` の `ALLOWED_USER_IDS` に LINE の userId を並べます（アプリ情報 ⓘ で自分のIDを確認できます）。
4. 枠を空けたいとき（機種変更・退会など）は、Firebase Console の `members/<userId>` を削除します。

### 8人限定について

この制限はブラウザ側の確認です。LINEの userId をFirebaseが検証しているわけではないため、悪意のある人がFirebaseへ直接アクセスすることまでは防げません（Firebase Auth と LINE の ID トークン検証が必要になり、認証方式の変更になるため今回は行っていません）。身内8人の利用を想定した「必要十分」の設計です。

## ホーム画面に追加する

- **iPhone / iPad**: Safari で開く → 共有ボタン → 「ホーム画面に追加」
- **Android**: Chrome で開く → メニュー → 「アプリをインストール」または「ホーム画面に追加」

> LINE内（LIFF）で開くのがいちばん確実です。ホーム画面から起動したときにLINEログインが求められた場合は、画面の「LINEでログイン」を押してください。iOS のホーム画面アプリは Safari とログイン状態が共有されないため、ログイン後にSafariで開くことがあります。その場合はSafari側で使うか、LINEのLIFFリンクから開いてください。

## 更新のしかた

ファイルを差し替えて公開するだけです。Service Worker は「通信できれば常に最新」で動くため、アプリは次回起動時に更新されます。`sw.js` の `CACHE_VERSION` を上げると古いキャッシュも削除されます。
