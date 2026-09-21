
## 2026-09-22 利用状況の名前取得を維持する
公開対象フォルダで node verify-usage-names.cjs を実行し成功してから公開する。古いreleaseコピーからの再公開は避け、usage-tracker.js、usage-settings.*、api/usage-identity.js、api/usage-summary.jsとHTMLの計測読込を含める。summaryのpeople=1は認証必須で表示名と旧日本語IDのaliasesを返す。yg-usage-excludedの端末除外を維持する。
