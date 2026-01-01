# 💣 マインスイーパー マルチプレイ

みかと2人で遊べるマインスイーパー！Firebaseでリアルタイム同期。

## セットアップ手順

### 1. Firebaseプロジェクトを作成

1. [Firebase Console](https://console.firebase.google.com/) にアクセス
2. 「プロジェクトを追加」をクリック
3. プロジェクト名を入力（例: `minesweeper-multiplayer`）
4. Google Analyticsはオフでも良い → プロジェクト作成

### 2. Realtime Databaseを有効化

1. 左メニューから「構築」→「Realtime Database」を選択
2. 「データベースを作成」をクリック
3. ロケーションは `asia-northeast1`（東京）を選択
4. **「テストモードで開始」を選択**（後でセキュリティルールを設定）
5. 「有効にする」をクリック

### 3. ウェブアプリを追加

1. プロジェクトの概要画面で「ウェブ」アイコン（`</>`）をクリック
2. アプリのニックネームを入力（例: `minesweeper-web`）
3. 「Firebase Hosting」はチェックしなくてOK
4. 「アプリを登録」をクリック
5. 表示される `firebaseConfig` をコピー

### 4. 設定ファイルを更新

`src/firebase.js` を開いて、`firebaseConfig` の中身を自分のものに置き換える：

```javascript
const firebaseConfig = {
  apiKey: "AIzaSy...",
  authDomain: "your-project.firebaseapp.com",
  databaseURL: "https://your-project-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "your-project",
  storageBucket: "your-project.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abc123"
};
```

⚠️ **重要**: `databaseURL` が含まれていることを確認！

### 5. ローカルで動作確認

```bash
npm run dev
```

ブラウザで http://localhost:5173 を開く。

### 6. GitHub Pagesにデプロイ

#### vite.config.js を編集

```javascript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/minesweeper-multiplayer/'  // ← リポジトリ名に合わせる
})
```

#### ビルド＆デプロイ

```bash
npm run build
```

`dist` フォルダをGitHubリポジトリにプッシュして、GitHub Pagesを有効化。

または、gh-pagesパッケージを使う：

```bash
npm install -D gh-pages
```

package.jsonに追加：
```json
"scripts": {
  "deploy": "gh-pages -d dist"
}
```

```bash
npm run build
npm run deploy
```

## 遊び方

1. **ルーム作成**: 名前を入力して「ルームを作成」
2. **ルームID共有**: みかにルームIDを教える
3. **参加**: みかが名前とルームIDを入力して「ルームに参加」
4. **ゲーム開始**: ホストが難易度を選んで「ゲーム開始！」
5. **協力プレイ**: 2人で同じボードを開いていく。地雷踏んだら2人とも負け！

## 機能

- 🎮 リアルタイム同期
- 👥 2人協力プレイ
- 🎨 誰がどのセルを開けたか色で分かる
- 🚩 フラグ機能
- 🔄 ゲームリセット（ホストのみ）
- 📱 スマホ対応

## セキュリティルール（本番運用時）

テストモードのままだと誰でもDBを読み書きできるので、本番では以下のルールを設定：

```json
{
  "rules": {
    "rooms": {
      "$roomId": {
        ".read": true,
        ".write": true
      }
    }
  }
}
```

（とりあえずこれでも動く。認証つけたい場合はFirebase Authを追加）

---

楽しんでね！🎉
