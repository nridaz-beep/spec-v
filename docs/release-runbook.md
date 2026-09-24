# Spec-V 安定化・昇格・ロールバック

## 検証

Node 24で `npm ci`、`npx playwright install --with-deps chromium`、`npm test`。
既存の静的検査、ゲート否定テスト、実Chromium/API回帰をすべて実行する。
`test-results`にはPDF/ページ画像/失敗trace、`playwright-report`にはHTML結果を保存する。
外部AI・メール・Supabase RESTは隔離fixture。実サービスの稼働やRLSを保証するテストではない。

## develop / main

作業branch → developへのPR → 全検査成功 → develop → mainへのPR → 全検査成功。
main/developで `Spec-V quality gate` を必須にし、最新baseへの追従、PR経由、管理者にも適用、force-push/削除不可とする。
「再実行で偶然通った」を許さず、失敗・中断・スキップ・expected failure・retryを証跡ゲートで拒否する。

## 通常昇格

1. `release-policy.json` のcandidateを完全なE2E対象にする。v55はLF正規化SHA-256で元ファイル保持を検証する。
2. `main.html`のLATEST変更もPRとして検査する。本タスクではv55を維持。現状のまま通常昇格workflowを実行すると「LATESTが検証対象candidateでない」ため止まる。
3. GitからのVercel自動デプロイは `git.deploymentEnabled: false`。Productionへの唯一の通常公開経路は `Promote verified Spec-V` のmain上の手動実行。
4. workflowは同一SHAで全検査を再実行し、成功したrunの証跡artifactだけを取得。全ソースのSHA-256を照合してからVercel build→prebuilt deployを行う。
5. 証跡欠落、異なるSHA、検査後のファイル変更、secret未設定なら公開を止める。通常のローカル `npm run build` が証跡なしで失敗するのは意図した動作。

必要なGitHub production environment設定:

- secret `VERCEL_TOKEN`（既存のVercel deployment用資格情報。チャットやGitには貼らない）
- variables `VERCEL_ORG_ID` / `VERCEL_PROJECT_ID`
- variable `SPECV_STABLE_DEPLOYMENT`（下記の旧本番URL）
- deployment branchをmainに制限する。

設定不足の状態では公開できない。GitHub/Vercel管理者がworkflowや保護そのものを変更する操作まで暗号学的に禁止するものではない。
既存PreviewをVercel UIで直接Promoteする運用は禁止。公開資格情報はCIに限定する。

## ロールバック

監査時点の本番（Ready、commit `8fd9dc0b05a2825c248e0523dd6fef98c2f04f71`）:

- URL: https://spec-4u6ln9cfe-nridaz-2241s-projects.vercel.app
- Deployment: `2SgPuDoR7EZqZUHuZZv8QEi3QeFV`
- 管理画面: https://vercel.com/nridaz-2241s-projects/spec-v/2SgPuDoR7EZqZUHuZZv8QEi3QeFV
- HTML entry: v55

`Roll back Spec-V to known stable deployment` はこのURLをenvironment変数から読み、再ビルドせず戻す。障害版テストの成功を緊急復旧条件にしない。
CI資格情報が使えない場合はVercelのInstant Rollbackで同じ記録済みdeploymentを指定する。
ロールバック後は `/main.html` の到達先、認証ゲート、管理画面を確認する。本番tokenを検証のために消費しない。
旧HTMLだけの差し戻しではAPI/設定は戻らないので、全体復旧はdeployment単位で行う。
本番切替を伴うrollback演習はこの作業では行わない。
