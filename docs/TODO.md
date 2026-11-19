# TODO｜未完了作業・依頼事項・確認事項

## 発注者への依頼（操作・承認が必要）
| ID | 内容 | 理由 |
|---|---|---|
| R-01 | ~~Supabase 開発プロジェクトの作成~~ | **完了**：`life-stage-common-core-dev`（東京・Free）を作成、migration 適用済み |
| R-02 | 休止中の Supabase「LIFE STAGE Apps」を**90日の復旧期限内に**一度だけ再開し、構成記録・バックアップ取得後に再休止してよいか | 期限後はワンクリック復旧不可。再開は外部状態の変更（データは変更しない） |
| R-03 | ~~Vercel STG~~ | **完了**：`https://life-stage-common-core.vercel.app` |
| R-04 | ~~専用リポジトリへ移設~~ | **完了**（public。D-31） |
| R-08 | GitHub に**空の private リポジトリ**を作成（推奨名：`yuuta-suwa/life-stage-common-core`、README 等は作らない）し、このセッションから push できるよう Claude GitHub App の対象に追加 | このセッションは新規リポジトリを作成できないため |
| R-05 | ~~Google OAuth クライアント~~ | **完了**（発注者が登録。設定は自動確認済み） |
| R-06 | ~~初期 Super Admin~~ | **完了**（2026-11-19 登録・MFA 登録済み） |
| R-10 | APP01 の実操作確認（TRIAL_READINESS C-1）：発注者の実機確認＋別の Google アカウント1つで招待→受諾→分離を確認 | 自動検証は合格（E2E 32/32・実DB 20/20）。**実 Google での確認は発注者待ち**（APP01_TEST_CHECKLIST §4） |
| R-11 | Vercel チームのプラン確認と試験段階 A の扱いの決定（TRIAL_READINESS C-2） | 未（API ではプランを取得できず） |
| R-12 | 初回バックアップの取得と復元テスト（BACKUP_RUNBOOK §4。DB パスワードが必要。C-3） | 未 |
| R-13 | 限定試験公開の承認（AI 精査・PNG 共有・下書き共有なし。C-4）と参加者案内の確定（C-5） | 未 |
| R-09 | 実ログイン検証の残り（STG_VERIFICATION「実施状況」の保留項目） | **保留**（発注者指示）。テスト用 Google アカウントと実機が必要 |
| R-07 | 試験運用のテスト利用者5名（Admin1・Mentor1・User2 ＋ Super Admin） | Phase 6 |

## 発注者確認事項（未決）
| ID | 内容 | 暫定対応 |
|---|---|---|
| Q-01 | Super Admin の担当者（人数） | 1名以上。最後の1名は停止不可 |
| Q-02 | Admin の管理範囲の単位（個人割当／組織・チーム単位／事業単位） | 個人割当（D-09） |
| Q-03 | 招待メール送信方式（手動送付 or Resend 等の送信サービス） | 手動送付（D-10） |
| Q-04 | Supabase プラン・バックアップ（日次/PITR）・費用上限 | ✅ 2026-11-19 発注者決定：**Free のまま運用**（D-38）。自動バックアップなしのため週1回 `scripts/backup.sh` で手動取得 |
| Q-05 | データ保持期間・削除期間・監査ログ保持期間・バックアップ残存期間 | 物理削除は手動（D-11） |
| Q-06 | APP02 LEGACY 権限付与者、APP03 認定審査者・事業管理者の権限を共通基盤で持つか | 未実装 |
| Q-07 | APP02 の6能力の英語コード名 | attraction/recruitment/education/development/operations/management（D-13） |
| Q-08 | 本番ドメイン、各APPのドメイン構成（SSO方式に影響） | 未定 |
| Q-09 | LIFE ACCOUNTING を試験運用・公開する時期 | 登録マスターに planned で登録済み。公開段階の変更は承認後 |
| Q-10 | APP02/APP03 PDF の表の正確な内容（テキスト抽出で一部崩れの可能性） | 抽出テキストで判断 |
| Q-11 | 利用期限（招待後のアカウント有効期限）の要否 | 未実装 |
| Q-12 | 既存 LIFE STAGE 2.0（localStorage 版・Supabase 版）利用者の移行方針 | 未着手 |
| Q-13 | ~~LIFE STAGE 3.0 と APP03 の関係~~ | **解決**：別アプリとして扱う（D-28） |
| Q-14 | LEI APP HUB（app-access-system の未マージブランチ）を将来、共通基盤を参照するポータルにするか | 対象外 |
| Q-15 | 既存 LIFE STAGE 2.0 利用者に新 APP02 へのデータ移行を提供するか | 未着手 |
| Q-17 | APP01 原本PDFの欠け字の補完内容 | ✅ 解決（2026-11-19 発注者承認：補完はそのままで可。D-33 確定） |
| Q-18 | APP01 の下書き共有・総復習全体／最終メッセージのアプリ内共有・PNG 画像共有の優先度 | 未実装（D-36） |
| Q-16 | Supabase 組織のプラン（現在 Free。自動休止・バックアップなし）を試験運用前に Pro へ上げるか | ✅ Free のまま（D-38） |
| Q-19 | バックアップの担当者（正・副）。BACKUP_RUNBOOK §2 の案で可か | 未定 |
| Q-20 | バックアップの保管先（推奨：発注者管理の Google ドライブに暗号化して保存）と保持世代 | 未定 |
| Q-21 | ビジョンボード画像本体をバックアップ対象外とする（試験運用中）扱いで可か。正式運用では S3 互換キー＋rclone（要承認） | 未定 |

## 開発 TODO（承認後・次フェーズ）
- [ ] STG に migration 適用、Advisors 確認、AT01〜AT20 手動テスト（TEST_PLAN）
- [ ] ログイン後の管理画面・MFA 画面の実機確認（iPad 横/縦、PC、スマホ）と UI 調整
- [ ] 5名試験運用と TRIAL_LOG の記録
- [ ] Storage の署名付きURL発行 API（各APPの画像共有実装時）
- [ ] CSP の nonce 化（'unsafe-inline' 削減）
- [ ] JWT 有効期限の短縮検討（Supabase Auth 設定）
- [ ] 招待メール送信（Q-03 確定後）
- [ ] 利用者一覧の CSV 出力（要否確認）
- [ ] Phase 7：各APP本体の段階接続（別途承認）
