# 安定化監査・実装計画（2026-09-24）

監査元: nridaz-beep/spec-v、main/developとも `8fd9dc0b05a2825c248e0523dd6fef98c2f04f71`。
機能追加は行わない。診断・採点・分析仕様は維持する。

## 現状監査

- `.github/workflows/specv-check.yml`: main/developのpush/PRでNode 24の静的チェックのみ。直近run 35994644134等はsuccessだがE2E成功を意味しない。
- `check-syntax.js`/`check-release.js`: 構文と文字列の存在検査。クリック、コメント復元、APIの実行結果、used_at、PDF物理ページを検査していない。
- `main.html`のLATEST=v55、最高番号=v56。既存検査はv56を対象にし、v55の動作を保証していない。
- lockfile、Playwright、実行可能なAPI回帰テスト、必須テスト集約ジョブがない。
- GitHub branches API: main/developともprotected=false。rulesets=[]。保護詳細APIは連携権限不足403。
- Vercel buildCommandはnpm run checkのみ。Actions成功に依存する公開workflowはない。接続済みVercelのlist_teamsは空であり、実プロジェクト設定は未確認。
- v55以前のHTMLは残っているが、検証済みdeploymentへのロールバック手順・識別子はリポジトリにない。
- token APIはused_atを更新する。notifyのフォールバックはused状態を含め再更新するため時刻を上書きする。
- 管理token APIはADMIN_PASSWORD未設定で許可する（fail-open）。これは安全側に修正し回帰テスト化する。

## 実装計画

1. 依存を固定し、既存APIハンドラをそのまま動かすローカルHTTPテストサーバーを用意する。Supabase REST/AI/メール境界のみ隔離し、本番データ・課金・メール送信に接続しない。
2. Playwrightで通常の81問を操作する。コメント入力/戻る/進む、一次AI、短文二次AI、token更新、管理画面、印刷を通す。test=1だけでは認証されないことも検証。
3. 実APIに無効claim、AI障害、DB更新障害を注入。tokenのused/used_atと通知フォールバックを確認する。
4. Chromium実印刷PDFのページ数/A4寸法、印刷DOMのはみ出しと画像を検査し、失敗時trace/画像/PDFを保存する。
5. CIは静的/API/E2Eの全結果を集約する必須ゲートを設ける。Git自動本番公開を無効化し、同一SHAで全検査が成功した場合だけ公開するworkflowを用意する。
6. v55の元ファイルを保持。通常昇格と旧deploymentへの緊急rollbackを分離し手順化する。

## 検証範囲の区別

隔離E2Eは実ブラウザ＋実アプリ/API＋Supabase REST互換fixtureであり、実SupabaseのRLS・本番secret・実AIサービスの稼働確認ではない。これらは専用staging環境での追加受入検証が必要。
GitHub保護/Vercel権限の実設定が未確認のまま「本番昇格禁止を適用済み」とは扱わない。
