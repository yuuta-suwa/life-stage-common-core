# APP01｜THE FINAL DISCOVERY 実装状況

正本：APP01_Official_v7.pdf（2026-11-11）。共通基盤と同じ Next.js アプリ・同じ Supabase で動作（`/apps/APP01`）。

## 1. 画面
| 画面 | URL | 内容 |
|---|---|---|
| オンボーディング | `/apps/APP01`（初回） | APP01 の目的・データ利用・共有は任意・AI 未導入の説明 →「人生のクエストを始める」で同意（consent_records `app01_terms`） |
| ホーム | `/apps/APP01` | YOUR LIFE. YOUR QUEST.、XP（初回確定×100／1000）・バッジ・10ステージの状態、「前回の続きから始める」 |
| LEVEL 01〜10 | `/apps/APP01/level/[n]` | 導入・設問（原文順）・自動保存（1秒後）・保存状態表示・AI 精査欄（未導入の案内）・確定。LEVEL02 は自動計算、LEVEL03 は画像（非公開 Storage）、LEVEL07/08 は説明、LEVEL09 はサイドクエスト、LEVEL10 は整合性レポート＋確認チェックリスト |
| STAGE CLEAR | `/apps/APP01/level/[n]?cleared=1` | クリア表示・XP・次へ／一覧へ・共有（任意） |
| MY LIFE DISCOVERY | `/apps/APP01/discovery` | 10項目の総復習（最新確定回答をそのまま表示、未設定／再確認が必要）、編集・文章で共有、MY LIFE BLUEPRINT の保存（印刷・PDF） |
| 最終メッセージ | `/apps/APP01/final` | 承認済み全文（変更禁止）＋ APP02 への引き継ぎ（同意・再試行） |
| 共有と返信 | `/apps/APP01/shares` | 共有履歴（宛先・日時・版・状態）・撤回・受信者からの返信 |
| 受け取った共有 | `/apps/APP01/received` | メンター等：本人が選んだ内容の閲覧・フィードバック送信のみ |

## 2. データ（migration `20261119000300_app01.sql`）
| テーブル | 内容 |
|---|---|
| `app01_stage_answers` | 本人×LEVEL の現在の回答（status draft/confirmed、version、needs_recheck、first_confirmed_at） |
| `app01_stage_history` | 確定のたびの確定スナップショット（追記専用・更新不可） |
| `app01_feedback` | 共有先からのコメント（本人回答を上書きしない） |

RPC：`app01_save_draft`、`app01_confirm_stage`（LEVEL10 は全9LEVELの最新確定＋チェックリスト6項目）、`app01_add_feedback`、`app01_export`。
完成時は共通基盤の `confirm_snapshot`（life_blueprint 1.0）で MY LIFE BLUEPRINT を作成し、`request_transfer` で APP02 へ引き継ぐ。

## 3. 仕様との対応
| 仕様 | 状態 |
|---|---|
| §1 画面マップ・途中再開・過去 LEVEL 再編集 | ✅ |
| §2 共通文言 | ✅（`src/features/app01/copy.ts`。欠け字の補完は §5・承認済） |
| §3 状態遷移（locked/available/draft/confirmed、編集で draft・後続は要再確認、確定履歴保持、LEVEL10 は全確定で利用可能） | ✅（reviewed は AI 未導入のため未使用） |
| §3 XP・バッジ（再確定・共有で加算なし、ランキングなし） | ✅ |
| §4 10 LEVEL の設問・導入・クリア表示 | ✅ |
| §4 LEVEL02 自動計算（未入力≠0、前提表示） | ✅ |
| §4 LEVEL03 画像追加・並び替え・削除・願望紐づけ・キャプション・権利確認 | ✅ |
| §5 6大能力の定義表示 | ✅ |
| §6 AI 精査 | ❌ 未導入（有料 AI API を導入しない方針）。AI なしで手動確定可、LEVEL10 はルールによる整合性レポート＋手動チェックリスト |
| §7 共有：宛先（担当者のみ・複数）・内容の個別選択・センシティブ項目初期 OFF・プレビュー・本人操作のみ・撤回・履歴・返信 | ✅ |
| §7 共有：文章（コピー・アプリ内） | ✅ |
| §7 共有：PDF | 🟡 ブラウザの印刷→PDF 保存（専用 PDF 生成は未実装） |
| §7-3 画像共有（PNG 1080×1350） | ❌ 未実装（ボタンは「準備中」） |
| §7 範囲「選択した項目のみ／総復習全体／最終メッセージ」 | 🟡 LEVEL 単位＋項目選択のみ。総復習全体・最終メッセージのアプリ内共有は未実装（文章コピーは可） |
| §7 下書きの共有 | ❌ 確定版のみ共有可（下書き表示の要否は確認事項） |
| §8 MY LIFE DISCOVERY | ✅（画像で共有は未実装） |
| §9 最終メッセージ（変更禁止・全文） | ✅ 原文どおり |
| §10 APP02 引継ぎ（同一 snapshot で冪等、失敗時は完成状態を維持し再試行） | ✅（APP02 本体は未実装のため、受信箱 transfer_inbox まで） |
| §11 データモデル | ✅ 対応（User=profiles、Assignment=mentor_assignments、StageResponse=answers/history、Blueprint=app_snapshots、Share=data_shares、Feedback=app01_feedback、AuditLog=audit_logs。AIReview・Goal・VisionAsset は回答 JSON 内） |
| §12 権限・安全性（本人のみ、共有範囲のみ、管理者は本文を見ない、画像は認可付きURL） | ✅ DB テストで確認 |
| §13 エラー文言 | ✅ |

## 4. テスト
- DB：`tests/db/app01.test.ts`（9件）＋実 Supabase でロールバック方式の検証（ロック・権限なし拒否・他人／メンターは本体を閲覧不可・選択項目のみ共有・フィードバック・停止で遮断）。
- 単体：`tests/unit/app01-logic.test.ts`（12件：設問数、最終メッセージ原文、状態判定、XP、未来家計簿、ブループリントの契約適合、整合性レポート、共有文面、画像パス）。
- 画面：未ログイン時のリダイレクトを検証環境で確認。**ログイン後の実操作は発注者確認待ち**（2026-11-19 Super Admin に APP01 権限を付与済。TODO R-10）。

## 5. 原本PDFの欠け字の補完（確定：Q-17／D-33）
`src/features/app01/stages.ts` の `TEXT_CORRECTIONS` に原文と実装文言を併記。2026-11-19 発注者承認により補完内容で確定。最終メッセージは原文どおり。
