/**
 * APP01 THE FINAL DISCOVERY：回答の保存・確定・状態遷移・権限
 */
import { describe, it, expect, beforeAll } from "vitest";
import { as, expectFail, invitedUser, rpc, selectAs, sql, superAdmin } from "./helpers";

type U = { id: string; email: string };
let root: U;
beforeAll(async () => {
  root = await superAdmin();
});

const save = (uid: string, stage: number, answers: Record<string, unknown>) => rpc<{ changed: boolean; status: string }>(uid, "app01_save_draft", [stage, answers]);
const confirm = (uid: string, stage: number) => rpc<{ version: number; first_time: boolean; changed: boolean }>(uid, "app01_confirm_stage", [stage]);
const yes6 = { q1: "yes", q2: "yes", q3: "yes", q4: "yes", q5: "yes", q6: "yes" };

async function completeTo(uid: string, n: number) {
  for (let s = 1; s <= n; s++) {
    await save(uid, s, s === 10 ? yes6 : { q1: `stage ${s}` });
    await confirm(uid, s);
  }
}

describe("APP01 回答の保存と確定", () => {
  it("LEVEL01 から順に解放され、未確定の次 LEVEL はロック", async () => {
    const u = await invitedUser(root.id, ["APP01"]);
    await expectFail(save(u.id, 2, { q1: "x" }), "STAGE_LOCKED");
    expect((await save(u.id, 1, { q1: "家族旅行" })).changed).toBe(true);
    expect((await save(u.id, 1, { q1: "家族旅行" })).changed).toBe(false); // 同じ内容は更新しない
    await expectFail(save(u.id, 2, { q1: "x" }), "STAGE_LOCKED");
    const c = await confirm(u.id, 1);
    expect(c).toMatchObject({ version: 1, first_time: true, changed: true });
    expect((await save(u.id, 2, { q1: "200000" })).changed).toBe(true);
  });

  it("確定後に編集すると draft に戻り、確定済みの後続 LEVEL は要再確認。再確定で版が増え履歴を保持", async () => {
    const u = await invitedUser(root.id, ["APP01"]);
    await completeTo(u.id, 3);
    await save(u.id, 1, { q1: "変更後" });
    const rows = await selectAs<{ stage_no: number; status: string; needs_recheck: boolean; version: number }>(
      u.id, "select stage_no, status, needs_recheck, version from public.app01_stage_answers order by stage_no");
    expect(rows).toEqual([
      { stage_no: 1, status: "draft", needs_recheck: false, version: 1 },
      { stage_no: 2, status: "confirmed", needs_recheck: true, version: 1 },
      { stage_no: 3, status: "confirmed", needs_recheck: true, version: 1 },
    ]);
    expect(await confirm(u.id, 1)).toMatchObject({ version: 2, first_time: false });
    expect(await confirm(u.id, 2)).toMatchObject({ version: 2, changed: true }); // 要再確認の解消
    const hist = await selectAs<{ stage_no: number; version: number; answers: { q1: string } }>(
      u.id, "select stage_no, version, answers from public.app01_stage_history where stage_no = 1 order by version");
    expect(hist.map((h) => h.answers.q1)).toEqual(["stage 1", "変更後"]);
    // 履歴は改ざん不可
    await expectFail(sql("update public.app01_stage_history set answers = '{}' where user_id = $1", [u.id]), "HISTORY_IMMUTABLE");
  });

  it("LEVEL10 は全9LEVELの最新確定と確認チェックリスト6項目が必要", async () => {
    const u = await invitedUser(root.id, ["APP01"]);
    await completeTo(u.id, 9);
    await save(u.id, 10, { ...yes6, q6: "no" });
    await expectFail(confirm(u.id, 10), "CHECKLIST_INCOMPLETE");
    await save(u.id, 10, yes6);
    // LEVEL05 を編集すると前提が崩れる
    await save(u.id, 5, { q1: "見直し" });
    await expectFail(confirm(u.id, 10), "PREREQUISITE_NOT_CONFIRMED");
    await confirm(u.id, 5);
    for (const s of [6, 7, 8, 9]) await confirm(u.id, s);
    expect((await confirm(u.id, 10)).changed).toBe(true);
    const logs = await sql("select * from public.audit_logs where actor_id = $1 and action = 'app01.stage.confirm'", [u.id]);
    expect(logs.length).toBeGreaterThanOrEqual(10);
  });

  it("入力検証：範囲外 LEVEL・オブジェクト以外・巨大データ", async () => {
    const u = await invitedUser(root.id, ["APP01"]);
    await expectFail(save(u.id, 11, {}), "INVALID_STAGE");
    await expectFail(as(u.id, (c) => c.query("select public.app01_save_draft(1, '[1,2]'::jsonb)")), "INVALID_REQUEST");
    await expectFail(save(u.id, 1, { q1: "x".repeat(70000) }), "PAYLOAD_TOO_LARGE");
  });
});

describe("APP01 アクセス制御", () => {
  it("APP01 の権限がない利用者・停止中の利用者は保存も閲覧もできない", async () => {
    const noApp = await invitedUser(root.id, ["APP02"]);
    await expectFail(save(noApp.id, 1, { q1: "x" }), "APP_ACCESS_DENIED");
    const u = await invitedUser(root.id, ["APP01"]);
    await save(u.id, 1, { q1: "秘密" });
    await rpc(root.id, "admin_set_entitlement", [u.id, "APP01", false, "test"]);
    expect(await selectAs(u.id, "select * from public.app01_stage_answers")).toHaveLength(0);
    await expectFail(save(u.id, 1, { q1: "x" }), "APP_ACCESS_DENIED");
    await rpc(root.id, "admin_set_entitlement", [u.id, "APP01", true, "test"]);
    await rpc(root.id, "admin_set_user_status", [u.id, "suspend", "test"]);
    expect(await selectAs(u.id, "select * from public.app01_stage_answers")).toHaveLength(0);
    await expectFail(save(u.id, 1, { q1: "x" }), "ACCOUNT_NOT_ACTIVE");
    await rpc(root.id, "admin_set_user_status", [u.id, "resume", "test"]);
    const rows = await selectAs<{ answers: { q1: string } }>(u.id, "select answers from public.app01_stage_answers");
    expect(rows[0].answers.q1).toBe("秘密");
  });

  it("他人・管理者・メンターは回答と履歴を閲覧できず、直接書き込みもできない", async () => {
    const a = await invitedUser(root.id, ["APP01"]);
    const b = await invitedUser(root.id, ["APP01"]);
    const mentor = await invitedUser(root.id, ["APP01"], { role: "mentor" });
    await rpc(root.id, "admin_set_mentor_assignment", [mentor.id, a.id, "mentor", true]);
    await completeTo(a.id, 1);
    for (const viewer of [b.id, root.id, mentor.id]) {
      expect(await selectAs(viewer, "select * from public.app01_stage_answers where user_id = $1", [a.id])).toHaveLength(0);
      expect(await selectAs(viewer, "select * from public.app01_stage_history where user_id = $1", [a.id])).toHaveLength(0);
    }
    await expectFail(as(a.id, (c) => c.query("insert into public.app01_stage_answers(user_id, stage_no) values ($1, 5)", [a.id])), /permission denied/);
    await expectFail(as(a.id, (c) => c.query("update public.app01_stage_answers set status = 'confirmed' where user_id = $1", [a.id])), /permission denied/);
  });
});

describe("APP01 共有とフィードバック", () => {
  it("本人が選んだ内容だけが共有先に届き、コメントは別保存。撤回・担当解除で閲覧・返信不可", async () => {
    const owner = await invitedUser(root.id, ["APP01"]);
    const mentor = await invitedUser(root.id, ["APP01"], { role: "mentor" });
    const other = await invitedUser(root.id, ["APP01"], { role: "mentor" });
    await rpc(root.id, "admin_set_mentor_assignment", [mentor.id, owner.id, "mentor", true]);
    await save(owner.id, 1, { q1: "共有する回答", q2: "共有しない回答" });
    await confirm(owner.id, 1);
    const [h] = await selectAs<{ id: string }>(owner.id, "select id from public.app01_stage_history where stage_no = 1");

    const share = await rpc<{ share_id: string }>(owner.id, "create_share", [
      mentor.id, "APP01", "app01_stage", h.id,
      { stage: 1, version: 1, state: "confirmed", items: [{ key: "q1", label: "何を手に入れたい？", value: "共有する回答" }] },
      "comment", null,
    ]);
    const seen = await selectAs<{ scope: { items: { value: string }[] } }>(mentor.id, "select scope from public.data_shares where id = $1", [share.share_id]);
    expect(JSON.stringify(seen)).toContain("共有する回答");
    expect(JSON.stringify(seen)).not.toContain("共有しない回答");
    // 共有先も回答テーブルそのものは読めない
    expect(await selectAs(mentor.id, "select * from public.app01_stage_history where id = $1", [h.id])).toHaveLength(0);

    await rpc(mentor.id, "app01_add_feedback", [share.share_id, "良い目標です"]);
    await expectFail(rpc(other.id, "app01_add_feedback", [share.share_id, "なりすまし"]), "NOT_FOUND");
    await expectFail(rpc(owner.id, "app01_add_feedback", [share.share_id, "自分"]), "NOT_FOUND");
    expect(await selectAs(owner.id, "select comment from public.app01_feedback")).toEqual([{ comment: "良い目標です" }]);
    expect(await selectAs(other.id, "select * from public.app01_feedback")).toHaveLength(0);
    // 本人回答は変わらない
    const [ans] = await selectAs<{ answers: { q1: string } }>(owner.id, "select answers from public.app01_stage_answers where stage_no = 1");
    expect(ans.answers.q1).toBe("共有する回答");

    await rpc(owner.id, "revoke_share", [share.share_id]);
    expect(await selectAs(mentor.id, "select * from public.data_shares where id = $1", [share.share_id])).toHaveLength(0);
    await expectFail(rpc(mentor.id, "app01_add_feedback", [share.share_id, "撤回後"]), "NOT_FOUND");
  });

  it("閲覧のみ（read）の共有にはコメントできない", async () => {
    const owner = await invitedUser(root.id, ["APP01"]);
    const mentor = await invitedUser(root.id, ["APP01"], { role: "mentor" });
    await rpc(root.id, "admin_set_mentor_assignment", [mentor.id, owner.id, "trainer", true]);
    const share = await rpc<{ share_id: string }>(owner.id, "create_share", [mentor.id, "APP01", "app01_stage", null, { stage: 1 }, "read", null]);
    await expectFail(rpc(mentor.id, "app01_add_feedback", [share.share_id, "x"]), "FORBIDDEN");
  });

  it("本人データ出力に APP01 の回答・確定履歴が含まれる", async () => {
    const u = await invitedUser(root.id, ["APP01"]);
    await completeTo(u.id, 2);
    const out = await rpc<{ answers: unknown[]; history: unknown[] }>(u.id, "app01_export");
    expect(out.answers).toHaveLength(2);
    expect(out.history).toHaveLength(2);
  });
});
