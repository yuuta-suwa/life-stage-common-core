# INTEGRATION｜APP03 MAKE IT REAL との連携

最終更新：2026-11-20。APP03（別サイト・別DB。ソース v1.0.8）に用意済みの接続契約（APP03 `docs/INTEGRATION_CONTRACT.md`）に、共通基盤側を合わせた。**APP03 のプログラム変更は不要**で、設定と本人照合だけで連携できる。

## 1. しくみ
```
本人：APP02 で計画を承認 →「APP03 に引き継ぐ」に同意（APP03 の利用権限が必要）
本人：APP03 で「APP02：計画参照・認定反映」を押す
APP03 サーバー → POST https://life-stage-common-core.vercel.app/api/integrations/app03/app02
                 Authorization: Bearer <APP03_INTEGRATION_TOKEN>
                 {"externalUserId": "<共通基盤の連携用ID>", "certifications": [...]}
共通基盤      → {"records": [ { "id": "app02-growth-plan-<承認版ID>", "kind": "APP02_GROWTH_PLAN", ... } ]}
APP03         → external_imports に保存（参照用。認定にはならない）
```
- 返すのは、本人が APP03 への引き継ぎに同意し成功した**最新の承認済み計画1件**だけ。同意なし・停止中・ID 不一致は区別せず空（`records: []`）。
- record の内容：版・承認日時・開始年〜終了年・モード・目標年度、6能力（集客力・採用力・教育力・育成力・運営力・経営力）×10年の到達目標・目標レベル（APP02 の目標。APP03 の認定 LV とは別軸）・必要な経験・到達判断基準・重点。**セールス力の行は含めない**（APP03 側で設定する。発注者合意 2026-11-20）。
- 送られてくる `certifications`（APP03 の認定）は保存しない（APP02 の承認済み計画を APP03 の実績で上書きしない。APP02 仕様 §21）。
- すべての取得を監査ログ（`integration.fetch`）に記録。1トークンあたり1分60回まで。

## 2. 設定手順
1. **共通基盤（Super Admin・MFA）**：管理画面 SETTINGS →「外部アプリ連携（APP03）」→「APP03 連携トークンを発行」。表示は1回だけ。
2. **APP03（ChatGPT Sites の実行時設定）**に2つ登録（チャット・メール・GitHub には貼らない）：
   - `APP03_APP02_ENDPOINT` = `https://life-stage-common-core.vercel.app/api/integrations/app03/app02`
   - `APP03_INTEGRATION_TOKEN` = 発行したトークン
3. **APP03 の管理画面「外部アカウントの本人照合」**：利用者ごとに 接続元＝APP02、照合済み外部ユーザーID＝その人の共通基盤の「連携用ID」（共通基盤のアカウント画面に表示）。
4. 本人が APP02 で計画を承認し「APP03 に引き継ぐ」→ APP03 で「APP02：計画参照・認定反映」。

## 3. 運用
- 漏えいの疑い・担当者交代：SETTINGS の一覧から失効 → 再発行 → APP03 の設定を更新。
- 一覧で最終利用日時を確認できる。
- APP01（理想の人生）の APP03 への提供は未実装（APP01 → APP03 の本人同意の設計が必要）。

## 4. 検証（2026-11-20）
- DB テスト `tests/db/integration-app03.test.ts`：発行は Super Admin（MFA）のみ、平文を保存しない、同意なし・停止中・ID 不一致は空、不正・失効トークンの拒否、回数制限。
- E2E `tests/e2e/app03-integration.e2e.mjs`：APP03 の同期処理（redirect:'error'・15秒・Bearer・1MB 上限・records 最大100件・id 200文字以内）を再現して 6/6 合格。HTTPS 必須の確認のみローカルでは未再現。
- **未実施**：実際の APP03（Sites）からの呼び出し（トークン登録と本人照合が必要）。
