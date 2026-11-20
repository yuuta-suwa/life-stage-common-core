# PROGRESS｜進捗報告

## 2026-11-20 (8) 外部サイトのアプリへのリンク（D-56）
- migration 0017：APP03・LIFE ACCOUNTING の URL を登録、LIFE ACCOUNTING を公開中に。`admin_set_app_link`（Super Admin・MFA・理由必須・監査）。開発 DB に適用済み。
- 入口 `/apps/<code>`：権限確認後に登録 URL へ移動（権限なしは 403）。アカウント画面に「外部サイトに移動します」、設定画面に表示名・リンクの編集欄。
- テスト：DB 165 件合格（計画中アプリの付与不可は試験用アプリで検証に変更）、E2E app-links 4/4。

## 2026-11-20 (7) 管理者管理画面（D-55）
- `/admin/admins`：Super Admin・Admin・Mentor の人数、任命フォーム、役割ごとの一覧と解任（理由つき）。Super Admin 以外には案内のみ表示。メニューに ADMINS を追加。
- スマホ幅で管理メニューが横にはみ出す不具合を修正（`.shell` の列幅）。
- E2E `tests/e2e/admins.e2e.mjs` 6/6 合格（任命・解任・監査・Admin の拒否・自分は解任不可・最後の Super Admin の案内・スマホではみ出しなし）。

## 2026-11-20 (6) Super Admin の自己設定（D-54）
- migration 0016：`admin_list_users` が Super Admin には自分も返す（is_self）。`admin_set_app_role` は Super Admin に限り自分を対象にできる。
- 管理画面：USERS・PERMISSIONS に自分の行（「あなた」）を表示。自分の詳細画面でアプリ別権限・アプリ固有ロールを設定可（状態・管理ロール・削除は不可の案内を表示）。
- テスト：Super Admin の自己付与成功・自分の停止／ロール変更は拒否・Admin の自己付与と自分の表示は拒否。unit+DB 163 件合格。

## 2026-11-20 (5) APP03 1.0.9 連携表示と本物の Worker での結合試験
- APP03 ソースを改修（表示専用の src/linked.js、ホーム・マップ・マス詳細に APP01／APP02 の内容を表示）し ZIP で納品。APP03 側試験 58/58、verify_restart PASS。
- `tests/e2e/app03-real-worker.e2e.mjs` 追加：APP03 本物の Worker から共通基盤を呼ぶ結合試験 3/3 合格。
- 未検証：本番 Sites からの実接続（トークン登録・本人照合・Sites への反映は発注者の操作）。

## 2026-11-20（4）｜APP01 → APP03
- APP01 最終画面に「APP03 に渡す（任意・同意制）」、共通基盤に `/api/integrations/app03/app01`（必要最小限の項目のみ）。migration 0015 を開発 Supabase に適用。
- テスト：単体・DB 162件、E2E APP01 34・APP02 19・APP02 Phase2 13・APP03 連携 7 件 全件合格。

## 2026-11-20（3）｜APP03 MAKE IT REAL との連携
- APP03（別サイト、ソース v1.0.8）の既存の接続契約に合わせ、`/api/integrations/app03/app02` と連携トークン（管理画面で発行・失効）を実装（docs/INTEGRATION_APP03.md）。migration 0014 を開発 Supabase に適用。
- テスト：単体・DB 159件、E2E APP01 33・APP02 19・APP02 Phase2 13・APP03 連携 6 件 全件合格。実 APP03 からの呼び出しは未実施（トークン登録・本人照合が必要）。

## 2026-11-20（2）｜APP02 Phase 2・不具合修正
- APP01 LEVEL03 の ChatGPT ガイドを iPad 横向き（4:3）に変更。発注者に APP02 権限を付与（監査記録あり）。
- APP02 Phase 2：共有（SHARED VISION）、伴走者レビュー、RETURN TO PURPOSE（報告・割当・修正・再分析・本人の決定・エスカレーション）、経営者志望ラダー、履歴と版の復元・全体初期化、競合検出とオフライン時の端末保持（docs/APP02.md）。
- 不具合修正：①招待を受諾した利用者を削除できない（共通基盤、migration 0013）②APP02 の履歴がアカウント削除を妨げる ③ラダーの入力が保存されない（E2E で発見）。
- テスト：単体・DB 153件、E2E APP01 33・APP02 19・APP02 Phase 2 13 件 全件合格。開発 Supabase に migration 0012・0013 を適用（Advisors ERROR 0）。

## 2026-11-20｜APP02 SELF-REALIZATION ENGINE（Phase 1）＋ APP01 ChatGPT ガイド
- APP01 LEVEL03：ChatGPT 投げ込みガイド（ビジョン画像の作成文・手順・注意）を追加（D-43）。
- APP02：S00〜S10・S12・S13・S18 を実装（詳細 docs/APP02.md）。migration 0011 を開発 Supabase に適用（RLS 全有効、Advisors ERROR 0）。
- テスト：単体・DB 145件、E2E APP01 33件・APP02 19件 全件合格。
- 未実装（Phase 2）：RETURN TO PURPOSE、レビュー、SHARED VISION 共有、経営者志望ラダー、履歴一覧・任意版の復元、競合時の差分確認。AI 本体は導入しない（ChatGPT 相談文で代替）。

## 2026-11-19（3）｜APP01 試験公開前の最終検証
- ① 動作確認項目 33件を整理（docs/APP01_TEST_CHECKLIST.md）。
- ② ローカル Supabase 実スタック＋ブラウザ E2E **32/32 合格**。実 Supabase でロールバック検証 **20/20 合格**（残存データ 0）。実 Google での確認は未実施（発注者）。
- ③ 不具合 7件を修正（ログアウト不可視、スマホヘッダー、自動保存の取りこぼし、LEVEL10 の中途半端な確定、エラー表示位置、BLUEPRINT の要再確認漏れ、バックアップ復元の失敗）。自動テスト 119件・E2E 32件・lint・型・ビルド・秘密鍵検査に合格。
- ④ 仕様書 v7 と照合（docs/APP01.md §3）。⑤ docs/BACKUP_RUNBOOK.md。⑥⑦ docs/TRIAL_READINESS.md：**技術面は合格、5名の限定試験は条件付きで可**（C-1〜C-5）。

## 2026-11-19（2）｜APP01 THE FINAL DISCOVERY
- 実装：オンボーディング、ホーム（XP・バッジ・10ステージ）、LEVEL01〜10（自動保存・確定・要再確認・STAGE CLEAR）、未来家計簿の自動計算、ビジョンボード（非公開 Storage）、整合性レポート＋チェックリスト、MY LIFE DISCOVERY、MY LIFE BLUEPRINT 作成（life_blueprint 1.0）、最終メッセージ（原文）、APP02 引き継ぎ・再試行、共有（項目選択・プレビュー・文章・印刷PDF）・撤回・フィードバック。詳細 docs/APP01.md。
- DB：migration 0010（回答・確定履歴・フィードバック、RPC 4本）を開発 Supabase に適用。
- テスト：自動 118件 全件合格（APP01：DB 9件・単体 12件）。実 Supabase でロールバック方式の権限検証に合格。Advisors ERROR 0。
- 未実装：AI 精査（方針により導入しない）、PNG 画像共有、下書き共有、総復習全体・最終メッセージのアプリ内共有。
- 未実施：ログイン後の実操作確認（R-10）。2026-11-19 Super Admin に APP01 権限を付与済（監査記録あり）、発注者の確認待ち。
- 欠け字の補完（Q-17）は発注者承認により確定（D-33）。

## 2026-11-19｜実ログイン検証（一部）
- 初期 Super Admin（発注者アカウント）を招待リンクで登録。Google ログイン・招待受諾・TOTP 登録・二段階認証済みセッション（aal2）を DB で照合し合格。
- 残りの実ログイン検証（一般利用者・未招待者・停止/再開・誤コード・重要操作・iPhone/iPad 実機）は発注者指示により**保留**。

## 2026-11-18（4）｜検証環境の構築と認証設定
- 専用リポジトリ `yuuta-suwa/life-stage-common-core` へ履歴ごと移設（発注者判断で public）。
- Vercel 検証環境 `https://life-stage-common-core.vercel.app`（東京 hnd1、main 自動デプロイ）を作成。
- Supabase Auth：Site URL・Redirect URLs を設定、メール認証を無効化（管理API経由）。Google 有効・TOTP 有効を確認。
- 自動検証：未ログイン時の保護（ページ→/login、API→401）、ログイン→Supabase 認可（PKCE）→Google ログイン画面（エラーなし）を iPhone/iPad/PC プロファイルで確認。横はみ出しなし。
- 修正：セッション Cookie に Secure 属性が付いていなかった（@supabase/ssr の既定）→ 本番で Secure を付与。
- 未実施：実 Google アカウントでのログイン・MFA 登録・実機確認（docs/STG_VERIFICATION.md の手順で発注者・テスト担当者が実施）。

## 2026-11-18（3）｜STEP 01 承認後の開発（案C）

### 実装済み
- 新規 Supabase 開発プロジェクト（東京・Free・$0）を作成し、migration 9本を適用。実 Supabase で権限の静的検査と主要受入シナリオ（ロールバック方式）を実施し合格。
- LEI APP HUB の設計パターンを確認して取り込み（既定権限の取り消し、旧既定再現テスト、配布物の秘密鍵検査）。不採用2件（自動 profile 作成・メール一致のみの自動有効化）。
- アプリ登録マスター方式（公開段階・アプリ固有ロール・スナップショット種別・連携経路）。管理画面：SETTINGS で公開段階の変更、USERS 詳細でアプリ固有ロールの付与・取消。
- 履歴付き切り出しブランチ（ローカル `life-stage-core-export`）を作成。専用 private リポジトリ作成後に push する。

### テスト結果
- 自動テスト 97件 全件合格（DB 61、Unit 36）、lint・型・ビルド・配布物検査 合格。
- 実 Supabase：RLS 無効0、anon 権限0、authenticated 書込0、Advisors ERROR 0（WARN 1種は受容）。AT01/02/05/07/08/09/11/17 と MFA 必須を実 auth スキーマで確認。
- 検出・修正：関数の PUBLIC 実行権限がスキーマ単位では取り消せない問題（D-24）。

### 未実装・未実施
- 専用 private リポジトリへの移設（リポジトリ作成待ち）、Vercel STG（リポジトリ待ち）。
- Google OAuth・Auth の URL 設定（発注者側の操作）。
- 実環境の画面テスト（L4）、5名試験運用（L5）。
- 旧「LIFE STAGE Apps」の再開・バックアップ（承認待ち）。

### 問題点
- 作業ブランチへの push のたびに、既存アプリ event-management-system のプレビュービルドが失敗する（本番は無影響）。専用リポジトリ移設後は作業ブランチを使わない。

### 次の作業
専用リポジトリへの push → Vercel STG 作成・環境変数設定 → Google OAuth 設定 → 初期 Super Admin 作成 → 画面での AT01〜AT20 → 5名試験運用。

### 発注者確認事項
docs/TODO.md の R-02、R-05〜R-08、Q-02〜Q-08、Q-11、Q-12、Q-15、Q-16。

## 2026-11-18（2）｜Phase 0 追加調査
- 調査①〜⑤と3案比較を docs/ENVIRONMENT_AUDIT.md に記録（読み取りのみ。既存DB・既存アプリは無変更）。
- 推奨：案C（新規構築・実装済みの共通基盤を継続）＋ LEI APP HUB の設計パターンを取り込む。実装は承認後（ENVIRONMENT_AUDIT §8）。
- 発見：作業ブランチの分岐元が main より56コミット古く、push により既存アプリのプレビューデプロイが ERROR（本番は影響なし）→ 専用リポジトリへの移設で解消予定。
- 発見：「LIFE STAGE Apps」は Free プランの自動休止。復旧期限は休止から90日（期限日はダッシュボードで要確認）。

## 2026-11-18｜Phase 0〜5（ローカル検証まで）

### 実装済み
- **Phase 0**：GitHub / Supabase / Vercel / 既存 LIFE STAGE 実装の読み取り調査（docs/ENVIRONMENT_AUDIT.md）。既存アプリ・データは無変更。
- **Phase 1**：共通DB 16テーブル、制約・インデックス、全テーブル RLS、判定関数、監査ログ不変性、非公開 Storage ポリシー（migration 7本）。
- **Phase 2**：Google OAuth（PKCE）、単回招待（256bit・ハッシュ保存・72時間・取消・再発行）、認証済みメール照合、行ロックによる原子的な受諾＋権限付与、総当たり対策。
- **Phase 3**：APP01/02/03 個別権限、Super Admin / Admin（担当範囲）/ Mentor / User、停止・再開・剥奪、ロール管理、MFA(aal2)必須、権限昇格防止、削除手続き（二段階）。
- **Phase 4**：管理画面8画面（DASHBOARD, USERS(+詳細), INVITATIONS, PERMISSIONS, ASSIGNMENTS, TRANSFERS, AUDIT LOGS, SETTINGS）＋ MFA 画面、利用者向け（ログイン、招待受諾、状態、アカウント、アプリ入口ゲート）。
- **連携 API（契約検証）**：APP01→02、APP02→03、冪等キー、再試行、本人確認、変更時再確認、60セル検証。
- **Phase 5**：自動テスト84件（実DB 48件＋単体 36件）全件合格、lint/型/ビルド成功、未認証スモークテスト合格。

### テスト結果
docs/TEST_PLAN.md 参照。84/84 合格。テスト中に共有の復活不具合を1件検出し修正（D-14）。

### 未実装・未検証
- Supabase 実環境・実 Google アカウントでの動作（STG 未作成のため）。
- ログイン後の管理画面・MFA 画面の実描画確認。
- Phase 6 の5名試験運用。
- 招待メール自動送信、APP固有テーブル、各APP本体接続（対象外または承認待ち）。

### 問題点
- 共通基盤が public リポジトリ内にある（秘密情報は含まないが、仕様は非公開）。
- Supabase ローカルスタックがネットワーク制限で起動できず、Auth/Storage は互換シムでの検証。

### 次の作業
1. R-01〜R-06 の承認・提供を受けて STG（Supabase＋Vercel）を構築。
2. STG で AT01〜AT20 の手動テスト、UI 実機確認・修正。
3. 5名試験運用（Phase 6）と証跡保存。

### 発注者確認事項
docs/TODO.md の R-01〜R-07、Q-01〜Q-12。

### 完成判定
**未完成**。完成条件のうち「Googleログインの正常動作」「管理画面から主要操作が完結（実環境）」「試験運用」が未検証。自動テストで検証可能な範囲（DB・API の権限制御）は全件合格。
