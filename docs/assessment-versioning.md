# 81問版：結果ID・測定版・採点版の保存と組織集計

2026-10-03。対象ブランチ `codex/fix-81-scoring-audit-130`、前提コミット `f6ccd6c`。
Migration ID: `20261002210843_assessment_versions`（CLI生成、UTC日時）。本番未適用。

## 実装事実と変更

| 経路 | 変更後の扱い |
|---|---|
| v57診断開始 → 完了 | 開始時にUUIDを生成。同じ診断の一次通知・二次通知・再送でIDと完了日時を維持。計算式、設問、抽出、閾値、Lvは変更なし |
| localStorage | `sv_measurement` と版付きBefore/Afterに3項目を保存。旧キーを書き換えない。既存camelCaseの版フィールドも維持 |
| 通知JSON → `/api/notify` | 認証後に版と完全な6軸を検証し、結果を保存してから通知。新結果保存失敗は503、同じトークンで別ID・スコアは409。成功応答に `assessment` を返す |
| `assessment_results`（新規） | `assessment_id` UUID主キー、`token_id` unique、測定版・採点版、完了日時、タイプ、6軸、組織・部署を保存。非組織の受診も組織NULLで保存。回答原文・個人プロフィールは保存しない |
| `organization_assessments`（既存） | 全行をlegacy／版不明として維持。コピー・版推定・再計算なし。旧形式通知はこの表だけにINSERTし、同一トークンの既存行を上書きしない |
| 組織API | 版ペア指定なら新表を完全一致で絞り込む。省略／`cohort=legacy` は旧表のみの互換動作。部分指定は400。人数抑制・部署・認証・集計式は従来どおり |
| 組織画面 | 新81問版を初期選択。旧データは明示選択。新群が5件未満でも切替可能。版と注意書きを表示。切替中の旧表示と遅れて届く別群の応答を除外 |
| 管理深掘りAPI・画面 | JSONのID・版を検証し、AI入力・応答・画面・Markdownへ同じ値を渡す。legacyは明示、部分版は422。トークン管理一覧は受診結果一覧ではないため、そのAPIや列には結果版を誤って付与しない |
| 履歴比較 | 両方に明示された測定版・採点版が一致する場合のみ数値差分・AI比較。同版のID追加以前のローカル履歴も比較可能。異版／版不明は比較せず、前回のサマリーも消す |
| 認証・決済 | claim・管理認証・組織キー・Stripeを変更しない。結果にはDBから取得したトークン所属を使い、通知本文の所属を信用しない |

既存表は組織必須・トークン単位の集計スナップショットであり、非組織受診と版不明の過去行を持つ。このため既存表へ版を一括付与せず、最小限の新結果表を分離した。旧表の構造・行・既存RLSは変更していない。新表にストレス・16項目・Lv等を追加保存する変更は今回は行わない（これらは既存の通知JSON・ローカル保存経路を維持）。

新表はservice_roleにSELECT/INSERTのみ。anon/authenticatedには権限を与えない。token/org/departmentの削除による新結果の連鎖削除も禁止。記録後に所属を変更しても集計所属は当時のスナップショットを維持する。

## データ契約と互換性

- 現行測定版 `81-slots-20261002`、採点版 `81-stress-20261002`。保存形式の追加のみなので測定・採点番号は変更しない。
- 正式なフィールド名は `assessment_id`, `measurement_version`, `scoring_version`。camelCase別名も受理するが、併記して食い違う入力は422。
- 全3項目が欠けている入力だけをlegacy扱い。IDのみ、版のみ、空文字、不正値を「旧データ」として逃がさない。版だけを持つf6ccd6cの古い通知キューも422で残り、IDを捏造しない。必要なら管理者が原記録を確認し、別途移行判断する。
- 正式な新規書込は現在の81問版ペアのみ許可。未対応版は422。SQL/API読取構造は将来の版ペアに対応するが、130問版のスコアや推進力・Lvは接続していない。
- 同じトークンは1つの版付き診断に限定。再送時はINSERTを無視した後、既存ID・版・タイプ・6軸を照合して成功／409を決定する。既存結果の更新・再採点はしない。メール自体の重複配送抑制は従来どおりで、今回保証するのは結果行の重複・上書き防止。
- 現状のフォームはメモリ内の受診IDと通知キューを使う。ページを再読込して別受診を開始し同じトークンを再利用すると、新IDは409となる。新しい中断再開機能は未追加。
- token使用済み更新と結果保存は別処理で、既存フォームは通知より先にtoken更新を試す。結果保存失敗時は通知キューから同一IDで再送できるが、ブラウザ保存領域の消失・claim失効時には自動回復できない。原記録なしの補完は禁止。
- 旧集計の省略互換はlegacyを返す。新しい画面／外部クライアントは版を必ず指定する。旧データ同士も同一尺度とは保証できず注意書きを返す。集計は受診件数単位・直近最大5000件、5件未満抑制を維持。業界基準値は既存の暫定設定のまま（版ごとの妥当性は未検証）。

## 移行前提・本番適用手順（この作業では実施しない）

1. 別途承認された保守時間にバックアップを取得。ステージングで実際のDDL、roles、RLS、service keyの権限、PostgREST公開schemaとschema cacheを確認する。既存 `tokens.id text`, `organizations.id uuid`, `departments.id uuid` と旧組織集計表が前提。基礎DDLが全てリポジトリに揃っていないため、今回の最小テストスキーマを本番構築に使わない。
2. 新版通知の受付を開始する前に、新migrationだけをトランザクションで適用する。既存のルート直下SQLは過去の手動migrationであり、Supabase migration履歴のbaselineと差分を確認せず `db push` しない。接続先を人間が確認し、`psql -v ON_ERROR_STOP=1 --single-transaction -f supabase/migrations/20261002210843_assessment_versions.sql` 等で適用し、運用で採用しているmigration履歴にも記録する。
3. `supabase/verification/20261002210843_assessment_versions.sql` の読取SQLを実行。旧行件数・内容が事前スナップショットと一致し、新表は空（初回）であることを確認。公開schemaはpublic等の既存設定のままとし、specv_rollbackは公開しない。
4. API・共通JS・フォーム・組織画面・管理JSを同じリリースで反映。キャッシュ中の旧フォーム／通知キューについて、部分版の422を監視する。通知を捨てたり版を後付けしたりしない。
5. 本番メール送信を伴わないステージングで、完全な同一IDが保存・読込されること、新群／legacy群が別になること、同一版の部署集計・履歴・認証を確認してから受付を再開。今回の作業はここへの実施承認ではない。

## 復旧／ロールバック

新版の受付・通知再送を停止してから、`supabase/rollback/20261002210843_assessment_versions.sql` を同じ `--single-transaction` で実行する。新表を未公開の `specv_rollback` schemaへ移すため、行とインデックスを保持し、DROPや旧表への逆コピーをしない。ロールバックで新結果は一時的にAPIから見えなくなる。

APIとクライアントを整合する版へ戻すまで受付を再開しない。旧APIに新版JSONを送ると旧集計へ誤登録される危険があるため、単独で旧APIを戻さない。既に完了したtokenのused状態は戻さない。再適用はforward migrationを同じトランザクションで実行し、退避表をpublicへ復元する。liveとarchiveが両方ある場合は停止して人間が確認する。手動rollbackとSupabase migration履歴は自動連動しないため、履歴管理手順も担当者が整合させる。

## 検証

ローカルPGlite（PostgreSQL WASM）でforward適用、権限制御、必須項目・範囲・一意制約、旧行不変、rollback退避、再適用復元を確認。E2Eは実際のアプリAPIとSupabase SDKを使い、REST境界をローカルPostgreSQLに接続するテストadapterに置換。AI・メール・トークンAPIの外部境界は模擬で、実送信はない。

コマンド：`npm run check`, `npm run test:unit`, `npm run test:e2e`。テストfixtureは架空の数値・IDのみ（既存テストの人工コメントを除く）、実受診者情報・ZIP設問原文を追加しない。

実施結果は最終節に記録する。Docker/psqlがないため、フルSupabase/PostgRESTスタック、実プロジェクトのDDL差分、DB Advisor、schema cache、実メール、実決済、本番での権限は未検証。PGliteの成功を測定精度・妥当性の証明とは扱わない。

## 残る判断事項と130問版

- 版だけある既存通知キューや元回答のない履歴をどう保管／表示するか。今回の方針は無補完・無上書き。
- 130問版の推進力・逆転・欠測・意図と行動差・Honesty Firewallと尺度の妥当性が確定するまで、書込許可・集計UIに追加しない。新旧を時系列比較しない。
- 同じ回答の複数採点版を保存する場合、現行のtoken uniqueと単一assessment行を拡張し、受診実体と採点結果（assessment_id＋scoring_version）を分ける必要がある。今回は再採点を受け付けない。
- 版ごとの業界比較値、個人単位の重複受診集計、受診結果一覧／ストレス等のサーバー保存、中断再開・通知transaction/outboxは別設計。
- 新しい外部キーは結果のあるtoken・組織・部署の削除を拒否する。削除・保存期間ポリシーは、原記録保護と個人情報の削除手順を合わせて別途決める。

## 変更ファイル一覧

- 共通契約・保存：`assessment-contract.js`, `api/_assessment-result.js`, `api/notify.js`
- 組織集計：`api/organization-map.js`, `organization-map.html`
- 診断・履歴・管理レポート：`specv_form_v6_integrated_57.html`, `api/deep-report.js`, `admin-deep-report.js`
- DB：`supabase/migrations/20261002210843_assessment_versions.sql`, `supabase/rollback/20261002210843_assessment_versions.sql`, `supabase/verification/20261002210843_assessment_versions.sql`
- 検証基盤：`package.json`, `package-lock.json`, `.gitignore`, `scripts/check-syntax.js`, `tests/server.cjs`, `tests/helpers/assessment-db.cjs`, `tests/helpers/assessment-rest.cjs`
- テスト：`tests/unit/assessment-contract.test.cjs`, `tests/unit/assessment-migration.test.cjs`, `tests/unit/assessment-report.test.cjs`, `tests/unit/scoring-81.test.cjs`, `tests/e2e/assessment-versioning.spec.cjs`, `tests/e2e/regressions.spec.cjs`
- レビュー資料：このファイル。

## 最終実行結果（2026-10-03）

- 構文・リリース・公開方針ガード：成功。
- 単体：19件成功。旧blobに対する計算golden確認と1000回の81枠抽出を含む。
- Chromium E2E：全24件成功、失敗・skip・retryなし。実画面の診断→通知→新表読込、一次／二次通知のID・日時一致、同版履歴、異版比較停止、複数集計群分離、legacy保全、保存失敗からの再送、認証、管理トークン表示、PDF回帰を確認。
- Migration：PGliteで適用・権限・制約・旧行不変・非破壊rollback・再適用を成功確認。
- 実Supabaseでの適用、実管理レポートのAI生成、実メール・決済、本番データは未検証／未操作。
- ローカル検証では同梱npmの代わりに一時配置したnpm CLIと `node node_modules/@playwright/test/cli.js test` を使用。依存はlockfileへ固定。CIは既存のnpmスクリプトで同じテストを実行する。
