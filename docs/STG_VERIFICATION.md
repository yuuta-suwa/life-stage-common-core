# STG VERIFICATION｜検証環境での実ログイン検証

検証環境：`https://life-stage-common-core.vercel.app`（Vercel・東京）／ Supabase 開発プロジェクト（東京・Free）
本書の項目は、実在の Google アカウントと実機が必要なため、発注者・テスト担当者が操作する。
各操作の結果は、実施後に開発側が DB（監査ログ・セッション・MFA 登録）で照合する（§5）。

## 0. 事前に自動で確認済みの項目（2026-11-18）
| 項目 | 結果 |
|---|---|
| Supabase Auth：Google 有効・クライアントID/シークレット登録 | ✅ |
| Supabase Auth：メール（パスワード/メールリンク）認証を無効化 | ✅（2026-11-18 設定） |
| Supabase Auth：Site URL＝`https://life-stage-common-core.vercel.app`、Redirect URLs＝`/auth/callback`（STG とローカル） | ✅（2026-11-18 設定） |
| Supabase Auth：TOTP の登録・検証が有効 | ✅ |
| ログインボタン → Supabase 認可（PKCE S256）→ Google ログイン画面（エラーなし） | ✅ iPhone 15・iPad Pro 11（縦横）・PC 1440px の各プロファイル（Chromium） |
| Google に渡るリダイレクトURI | ✅ Supabase のコールバックURL |
| 未ログイン：保護ページ→`/login`、保護API→401、セキュリティヘッダー | ✅ |
| ログイン画面・招待画面の横はみ出し | ✅ なし（上記4プロファイル） |
| セッション Cookie の Secure 属性 | 修正済み（2026-11-18） |

## 実施状況（2026-11-19）
| 区分 | 状態 | DB での照合結果 |
|---|---|---|
| 初期 Super Admin の招待リンク発行 | ✅ | 招待（super_admin 付き）を作成、監査ログ `invitation.bootstrap` |
| 3-1 招待リンク → Google ログイン → 受諾 | ✅ | auth ユーザーは Google のみ・メール確認済み。招待は accepted、利用者 active、役割 super_admin、監査ログ `invitation.accept`（aal1） |
| 3-2 / 6-1 管理画面 → 二段階認証画面へ誘導 | ✅（発注者の操作で確認） | — |
| 6-2 TOTP 登録・検証 | ✅ | MFA 要素 totp=verified、セッション aal2 |
| 6-3 誤ったコードの拒否 | 未実施 | 認証チャレンジ記録が1件のみ |
| 6-4 再ログイン時のコード入力 | 未実施 | — |
| 6-5 MFA 検証後の重要操作 | **保留** | 管理操作の監査ログなし |
| 3-3〜3-4、4-1〜4-4、5-1〜5-6、⑦実機 | **保留**（発注者指示 2026-11-19） | テスト用 Google アカウントが必要 |

## 1. 準備（開発側が実施）
1. 初期 Super Admin の招待リンクを発行（`supabase/bootstrap/create_first_super_admin.sql`、24時間有効）。
2. Super Admin 受諾後、Super Admin の操作で検証用アカウントを招待：
   - User A：APP01 のみ
   - 未招待者 X：招待しない（拒否確認用）

## 2. ③ 招待済みユーザーの Google ログイン（PC で実施）
| # | 操作 | 期待結果 | 結果 |
|---|---|---|---|
| 3-1 | Super Admin が招待リンクを開き「Google でログインして受諾する」→ 招待メールの Google アカウントを選択 | 「登録が完了しました」 | |
| 3-2 | 「はじめる」→ 管理画面へ | 二段階認証の登録画面へ誘導される（§4） | |
| 3-3 | User A が自分の招待リンクを開き、自分の Google アカウントで受諾 | 「登録が完了しました」→ ACCOUNT に APP01 のみ「開く」 | |
| 3-4 | User A がもう一度同じ招待リンクを開いて受諾 | 「この招待リンクは既に使用されています」 | |

## 3. ④ 未招待ユーザーの拒否（PC またはスマホ）
| # | 操作 | 期待結果 | 結果 |
|---|---|---|---|
| 4-1 | 未招待者 X が `/login` から Google でログイン | 「招待が確認できません」画面。ACCOUNT・ADMIN は表示されない | |
| 4-2 | X のまま `/admin`、`/account`、`/apps/APP01` を直接入力 | すべて「招待が確認できません」画面（中身は表示されない） | |
| 4-3 | X が User A の招待リンク（受諾済み）を開いて受諾 | 「既に使用されています」 | |
| 4-4 | 別の未使用の招待リンクを、招待先と異なる Google アカウントで受諾 | 「招待されたメールアドレスと、ログインしたGoogleアカウントが一致しません」 | |

## 4. ⑤ セッション管理と権限 ／ ⑥ 管理者 MFA
| # | 操作 | 期待結果 | 結果 |
|---|---|---|---|
| 5-1 | User A：`/apps/APP01` | 「利用権限を確認しました」 | |
| 5-2 | User A：`/apps/APP02`、`/admin` を直接入力 | 403「アクセス権がありません」 | |
| 5-3 | User A：ブラウザを閉じて再度開く | ログイン状態が維持される | |
| 5-4 | User A：右上「ログアウト」→ `/account` を開く | ログイン画面へ | |
| 5-5 | Super Admin：User A を「一時停止」→ User A のログイン中の画面で再読み込み | 「ご利用を一時停止しています」 | |
| 5-6 | Super Admin：User A を「利用再開」→ User A 再ログイン | APP01 が再び使える（データ保持） | |
| 6-1 | Super Admin：管理画面を開く | 「二段階認証」画面に誘導される（MFA 未検証では管理画面に入れない） | |
| 6-2 | 「認証アプリを登録する」→ Google Authenticator 等で QR を読み取り→6桁コード入力 | 管理画面へ移動。SETTINGS で「MFA 検証済み」 | |
| 6-3 | 間違った6桁コードを入力 | 「コードが正しくないか、有効期限が切れています」 | |
| 6-4 | ログアウト→再ログイン→管理画面 | 6桁コードの入力を求められる（登録済み端末のコード） | |
| 6-5 | MFA 検証後に招待発行・権限変更・停止 | 実行でき、AUDIT LOGS に「MFA」付きで記録 | |

## 5. ⑦ 端末別のログイン動作（各端末で 3-3（または 4-1）・5-1・5-4 を実施）
| 端末 | ブラウザ | ログイン | 画面崩れ | ログアウト | 備考 |
|---|---|---|---|---|---|
| iPhone | Safari | | | | LINE 等のアプリ内ブラウザでは Google がログインを拒否する場合がある → Safari で開き直す |
| iPhone | Chrome | | | | |
| iPad（縦・横） | Safari | | | | 管理画面のサイドメニュー・表の横スクロール |
| PC（Windows / Mac） | Chrome / Edge / Safari | | | | |

## 6. 実施後の照合（開発側・読み取りのみ）
```sql
-- 受諾・失敗・管理操作の記録（実行者の MFA 状態つき）
select occurred_at, action, actor_aal, success, after_state->>'code' as code
from public.audit_logs order by occurred_at desc limit 50;
-- 登録済み利用者と状態
select email, status, created_at from public.profiles order by created_at;
-- 未招待者は profiles に存在しない（auth.users にのみ存在）
select u.email, (p.id is not null) as has_profile from auth.users u left join public.profiles p on p.id = u.id;
-- 管理者の MFA 登録
select u.email, f.factor_type, f.status from auth.mfa_factors f join auth.users u on u.id = f.user_id;
-- 停止中のセッション失効
select u.email, count(s.id) as sessions from auth.users u left join auth.sessions s on s.user_id = u.id group by u.email;
```
