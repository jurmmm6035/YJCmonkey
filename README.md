# 反應計算器 — Android App 建置說明

這個資料夾是從 Claude Artifact 的計算器程式碼轉出來的 Capacitor 專案骨架。
`window.storage`（Claude Artifacts 專屬的雲端儲存）已經換成 `src/storage.js`，
改用手機本地的 `localStorage`，所以打包出來的 App 完全不需要 Claude 帳號、
不需要網路，資料留在你自己的手機裝置上。

## 事前準備（在你自己的電腦上安裝，一次性）

1. **Node.js**（建議 LTS 版本）：https://nodejs.org
2. **Android Studio**：https://developer.android.com/studio
   - 安裝時記得勾選 Android SDK、Android SDK Platform-Tools、一個 Android 模擬器（可選）

Windows / Mac / Linux 都可以，Android 這條路不需要 Mac。

## 建置步驟

在這個資料夾（`reaction-calculator-app/`）打開終端機，依序執行：

```bash
# 1. 安裝相依套件
npm install

# 2. 打包成靜態網頁（產生 dist/ 資料夾）
npm run build

# 3. 加入 Android 平台（第一次執行才需要，會產生 android/ 資料夾）
npx cap add android

# 4. 把打包好的網頁內容同步進 Android 專案
npx cap sync

# 5. 用 Android Studio 打開專案
npx cap open android
```

## 在 Android Studio 裡產生 .apk

1. 上一步指令會自動開啟 Android Studio（第一次開啟可能需要等它下載 Gradle，耐心等一下）
2. 選單列：**Build → Build Bundle(s) / APK(s) → Build APK(s)**
3. 建置完成後，右下角會跳出通知，點選 **locate** 可以直接開啟 `.apk` 所在資料夾
   - 通常在 `android/app/build/outputs/apk/debug/app-debug.apk`
4. 把這個 `.apk` 檔傳到手機（例如透過雲端硬碟、傳輸線、通訊軟體），在手機上點開安裝
   - 手機需要先在「設定」裡允許「安裝未知來源的 App」

## 之後要更新內容怎麼辦？

如果之後請 Claude 修改了 `reaction-calculator.jsx`（在原本的 Artifacts 對話裡），
更新流程是：

1. 把新版的 `reaction-calculator.jsx` 內容複製，覆蓋掉這個專案裡的 `src/App.jsx`
   - `import` 那三行請保留原本 `storage.js` 那行，不要被新版覆蓋掉
2. 重新執行 `npm run build` → `npx cap sync` → `npx cap open android`
3. 在 Android Studio 重新 Build APK，覆蓋安裝到手機上即可（資料不會被清掉）

## 檔案說明

- `src/App.jsx` — 計算器主程式（跟 Claude Artifact 裡的內容相同）
- `src/storage.js` — 本地儲存的替代方案，取代 Claude Artifacts 專屬的 `window.storage`
- `src/main.jsx` — 程式進入點
- `src/default-reagent-db.json` — 內建的藥冊資料快照，App 第一次啟動、且本機還沒有任何試劑資料時會自動載入
- `capacitor.config.json` — App 名稱、ID 等設定，`appName` 可以自己改

## 關於內建藥冊資料庫

`src/default-reagent-db.json` 是目前藥冊的一份快照，會在 App **第一次啟動、且該手機上還沒有任何試劑資料**時自動匯入，讓每個人裝好 App 就有完整資料庫可用，不用自己再手動匯入一次。

**藥冊之後更新時，不需要重新打包整個 App**：只要把新的 JSON 檔傳給大家，各自在 App 的「試劑資料庫」頁籤點「匯入 CSV / JSON」，用 CAS 比對合併更新即可（跟平常匯入藥冊的流程一樣）。

如果想要把最新的藥冊資料**直接內建進下一版 App**（例如給新加入的實驗室同學安裝時就是最新版），把新的 JSON 檔案覆蓋掉 `src/default-reagent-db.json`，重新走一次建置流程（`npm run build` → `npx cap sync` → Build APK）即可。


---

# 部署成 PWA（GitHub Pages）— 不需要 Android Studio 這條路

這是比打包 APK 簡單很多的做法：不需要 Android Studio、不需要 Xcode，iOS 和 Android
都能用瀏覽器「加入主畫面」變成全螢幕 App，而且已經解決了之前 Claude 網頁分享連結
「加入主畫面顯示成 Claude」的問題（這次是你自己的網頁，標題、圖示都是計算器本身的）。

## 這個專案已經內建好的 PWA 設定

- `public/manifest.json` — App 名稱、圖示、顏色設定
- `public/icons/` — 已經幫你產生好的 App 圖示（藍色燒瓶圖案）
- `public/sw.js` — 離線快取用的 service worker
- `.github/workflows/deploy.yml` — 推上 GitHub 後**自動建置、自動部署**，不用手動操作

## 部署步驟

### 1. 建立 GitHub 帳號和 Repository（如果還沒有）

1. 到 https://github.com 註冊帳號（如果還沒有）
2. 右上角 **+** → **New repository**
3. Repository name 隨便取，例如 `reaction-calculator`
4. 選 **Public**（免費帳號的 GitHub Pages 需要 Public repo 才能用）
5. 其他選項不用動，直接 **Create repository**

### 2. 把這個專案推上 GitHub

在專案資料夾（`reaction-calculator-app`）打開命令提示字元，依序執行：

```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/你的帳號/reaction-calculator.git
git push -u origin main
```

（如果沒裝過 Git，先到 https://git-scm.com 下載安裝；第一次 push 可能會要你登入 GitHub 帳號授權）

### 3. 開啟 GitHub Pages

1. 到你 GitHub 上這個 repository 的頁面
2. 點 **Settings** → 左側選單 **Pages**
3. 「Build and deployment」的 Source 選 **GitHub Actions**（不是 "Deploy from a branch"）
4. 存檔後回到 repository 首頁，點上面的 **Actions** 分頁，應該會看到一個工作流程正在跑（或剛跑完），跑綠色勾勾就是成功了

第一次 push 之後，Actions 會自動建置、自動部署，**之後每次你把新程式碼 push 上去，都會自動重新部署**，不用再手動操作。

### 4. 拿到網址、安裝到手機

部署成功後，網址會是：
```
https://你的帳號.github.io/reaction-calculator/
```
（在 Settings → Pages 頁面上也看得到這個網址）

用手機瀏覽器（iOS 用 Safari、Android 用 Chrome）打開這個網址，會看到跟平常一樣的計算器畫面：

- **iOS**：分享按鈕 → 加入主畫面
- **Android**：瀏覽器選單 → 加到主畫面 / 安裝應用程式

安裝完成後主畫面上就會有計算器的專屬圖示（不是 Claude 圖示），點開全螢幕顯示，沒有網址列。

## 之後要更新內容怎麼辦？

跟 Android 版一樣，把新版 `reaction-calculator.jsx` 內容覆蓋 `src/App.jsx` 後：

```bash
git add .
git commit -m "更新內容"
git push
```

push 上去後 GitHub Actions 會自動重新建置部署，等個一兩分鐘，重新整理手機上的 App（或重新打開）就會是新版本。

## 重要提醒：資料不會跨平台同步

PWA 版本用的也是手機本地 `localStorage`，**跟 Android APK 版本、跟 Claude 網頁版都是各自獨立的資料**，不會互通。如果同時裝了 PWA 版和 APK 版，兩邊的試劑資料庫、歷史紀錄是分開的兩份。
