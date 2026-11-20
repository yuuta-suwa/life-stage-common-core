/**
 * APP02 Phase 2：共有レビュー・RETURN TO PURPOSE・版と復元・全体初期化・競合検出・ラダー・アカウント削除
 */
import { describe, it, expect, beforeAll } from "vitest";
import { expectFail, invitedUser, rpc, selectAs, sql, superAdmin } from "./helpers";

type U = { id: string; email: string };
let root: U;
beforeAll(async () => {
  root = await superAdmin();
});

const ABILITIES = ["attraction", "recruitment", "education", "development", "operations", "management"];
const cells = () => ABILITIES.flatMap((ability) => Array.from({ length: 10 }, (_, i) => ({
  ability, year_index: String(i + 1), text: `rec ${ability} ${i + 1}`, level: String(Math.min(5, Math.floor(i / 2))), experiences: "x", criteria: "y",
})));
async function owner() {
  const u = await invitedUser(root.id, ["APP02"]);
  await rpc(u.id, "app02_set_mode", ["CONVICTION"], "aal1");
  await rpc(u.id, "app02_init_plan", [2028, JSON.stringify(cells()), false], "aal1");
  return u;
}
async function helper(user: U, relation: "mentor" | "trainer" | "leader") {
  const h = await invitedUser(root.id, [], { role: "mentor" });
  await rpc(root.id, "admin_set_mentor_assignment", [h.id, user.id, relation, true]);
  return h;
}
const share = (o: U, h: U, items = [{ key: "roadmap", label: "10ヵ年計画", value: "集客→採用" }]) =>
  rpc<{ share_id: string }>(o.id, "create_share", [h.id, "APP02", "app02_share", null, JSON.stringify({ items }), "comment", null], "aal1");

describe("共有とレビュー（T07・T17）", () => {
  it("担当者だけに共有でき、受信者はコメント・修正案のみ。本人が採用・保留・却下を決める", async () => {
    const o = await owner();
    const trainer = await helper(o, "trainer");
    const stranger = await invitedUser(root.id, ["APP02"]);
    await expectFail(share(o, stranger), "SHARE_TARGET_NOT_ALLOWED");
    const s = await share(o, trainer);
    const sid = (s as unknown as { share_id?: string; id?: string }).share_id ?? (s as unknown as { id: string }).id;
    const r = await rpc<{ review_id: string }>(trainer.id, "app02_add_review", [sid, "proposal", "roadmap", "3年目の教育力は LV3 が妥当"], "aal1");
    await expectFail(rpc(stranger.id, "app02_add_review", [sid, "comment", "", "x"], "aal1"), "NOT_FOUND");
    await expectFail(rpc(trainer.id, "app02_decide_review", [r.review_id, "adopted"], "aal1"), "APP_ACCESS_DENIED");
    expect(await rpc(o.id, "app02_decide_review", [r.review_id, "adopted"], "aal1")).toMatchObject({ status: "adopted" });
    // 受信者は本人の計画・ステップ本体を読めない
    expect(await selectAs(trainer.id, "select * from public.app02_plan_cells where user_id = $1", [o.id], "aal1")).toHaveLength(0);
    // 担当解除で共有は撤回され、レビューも読めなくなる
    await rpc(root.id, "admin_set_mentor_assignment", [trainer.id, o.id, "trainer", false]);
    expect(await selectAs(trainer.id, "select * from public.app02_reviews", [], "aal1")).toHaveLength(0);
    await expectFail(rpc(trainer.id, "app02_add_review", [sid, "comment", "", "x"], "aal1"), "NOT_FOUND");
  });
});

describe("RETURN TO PURPOSE（T08）", () => {
  it("報告→理由に応じた自動割当→修正方針→再分析→本人の決定。経過はすべて記録", async () => {
    const o = await owner();
    const mentor = await helper(o, "mentor");
    const trainer = await helper(o, "trainer");
    const rep = await rpc<{ report_id: string; assigned_role: string }>(o.id, "app02_report_purpose",
      [o.id, "analysis", "vision", "AI の提案が私の価値観とずれている", JSON.stringify({ ai: "収入を最優先にすべき" })], "aal1");
    expect(rep.assigned_role).toBe("mentor");
    // 割当外の担当者は扱えない
    await expectFail(rpc(trainer.id, "app02_respond_purpose", [rep.report_id, "proposed", "x", "y"], "aal1"), "NOT_FOUND");
    expect(await selectAs(trainer.id, "select * from public.app02_purpose_reports where id = $1", [rep.report_id], "aal1")).toHaveLength(0);
    await expectFail(rpc(mentor.id, "app02_respond_purpose", [rep.report_id, "proposed", "", ""], "aal1"), "CORRECTION_REQUIRED");
    await rpc(mentor.id, "app02_respond_purpose", [rep.report_id, "reviewing", null, null], "aal1");
    await rpc(mentor.id, "app02_respond_purpose", [rep.report_id, "proposed", "家族との時間を最優先に、収入は条件として扱う", "本人のビジョンに沿う"], "aal1");
    await rpc(o.id, "app02_purpose_reanalysis", [rep.report_id, "再分析：家族時間を軸に…"], "aal1");
    // 担当者は本人の代わりに決定できない
    await expectFail(rpc(mentor.id, "app02_decide_purpose", [rep.report_id, "adopt", null], "aal1"), "NOT_FOUND");
    expect(await rpc(o.id, "app02_decide_purpose", [rep.report_id, "modify", "一部修正して採用"], "aal1")).toMatchObject({ status: "done" });
    const ev = await selectAs<{ action: string }>(o.id, "select action from public.app02_purpose_events where report_id = $1 order by id", [rep.report_id], "aal1");
    expect(ev.map((e) => e.action)).toEqual(["report", "status", "correction", "reanalysis", "decision"]);
    await expectFail(sql("update public.app02_purpose_events set action = 'x' where report_id = $1", [rep.report_id]), "HISTORY_IMMUTABLE");
  });

  it("伴走者も報告でき、担当外は報告できない。運営管理者はエスカレーションされた案件だけを（MFA 済みで）扱える", async () => {
    const o = await owner();
    const leader = await helper(o, "leader");
    const outsider = await invitedUser(root.id, ["APP02"]);
    await expectFail(rpc(outsider.id, "app02_report_purpose", [o.id, "roadmap", "plan", "", "{}"], "aal1"), "FORBIDDEN");
    const rep = await rpc<{ report_id: string; assigned_role: string | null }>(leader.id, "app02_report_purpose", [o.id, "roadmap:education:3", "fact", "前提が事実と違う", "{}"], "aal1");
    expect(rep.assigned_role).toBe("leader");
    expect(await selectAs(root.id, "select * from public.app02_purpose_reports where id = $1", [rep.report_id])).toHaveLength(0); // 未エスカレーション
    await expectFail(rpc(leader.id, "app02_escalate_purpose", [rep.report_id, "mentor", "重大な不一致"], "aal1"), "SHARE_TARGET_NOT_ALLOWED"); // メンター不在
    await rpc(leader.id, "app02_escalate_purpose", [rep.report_id, "admin", "プライバシー懸念"], "aal1");
    expect(await selectAs(root.id, "select * from public.app02_purpose_reports where id = $1", [rep.report_id], "aal1")).toHaveLength(0); // MFA 未完了
    expect(await selectAs(root.id, "select * from public.app02_purpose_reports where id = $1", [rep.report_id])).toHaveLength(1);
    await rpc(root.id, "app02_respond_purpose", [rep.report_id, "proposed", "事実を訂正", "資料で確認"]);
    // 運営管理者も本人の計画本体は読めない
    expect(await selectAs(root.id, "select * from public.app02_plan_cells where user_id = $1", [o.id])).toHaveLength(0);
  });
});

describe("版・復元・全体初期化（S17・§12-4・§12-5）", () => {
  it("開始年変更・推奨再生成の前に自動で版を保存し、任意の版に戻せる。復元前の状態も版として残る", async () => {
    const o = await owner();
    await rpc(o.id, "app02_update_cell", ["attraction", 1, "版1の内容", 2, null, null, null], "aal1");
    await rpc(o.id, "app02_save_version", ["手動保存"], "aal1");
    await rpc(o.id, "app02_update_cell", ["attraction", 1, "その後の内容", 3, null, null, null], "aal1");
    await rpc(o.id, "app02_set_start_year", [2030], "aal1");
    const vs = await selectAs<{ id: string; version_no: number; reason: string; start_year: number }>(o.id,
      "select id, version_no, reason, start_year from public.app02_plan_versions order by version_no", [], "aal1");
    expect(vs.map((v) => v.reason)).toEqual(["manual", "before_start_year"]);
    await rpc(o.id, "app02_restore_version", [vs[0].id], "aal1");
    const [c] = await selectAs<{ edited_text: string }>(o.id, "select edited_text from public.app02_plan_cells where ability='attraction' and year_index=1", [], "aal1");
    expect(c.edited_text).toBe("版1の内容");
    const [p] = await selectAs<{ start_year: number }>(o.id, "select start_year from public.app02_plans", [], "aal1");
    expect(p.start_year).toBe(2028);
    const after = await selectAs<{ reason: string }>(o.id, "select reason from public.app02_plan_versions order by version_no", [], "aal1");
    expect(after.map((v) => v.reason)).toEqual(["manual", "before_start_year", "before_restore"]);
    await expectFail(sql("update public.app02_plan_versions set label = 'x' where user_id = $1", [o.id]), "HISTORY_IMMUTABLE");
  });

  it("履歴の任意の時点の値にセルを戻せる。全体初期化は確認語が一致したときだけ、実行前の版を残して行う", async () => {
    const o = await owner();
    await rpc(o.id, "app02_update_cell", ["education", 2, "A", 2, null, null, null], "aal1");
    await rpc(o.id, "app02_update_cell", ["education", 2, "B", 3, null, null, null], "aal1");
    const [h] = await selectAs<{ id: number }>(o.id, "select id from public.app02_plan_history where kind='cell_edit' order by id limit 1", [], "aal1");
    await rpc(o.id, "app02_restore_from_history", [h.id, "after"], "aal1");
    const [c] = await selectAs<{ edited_text: string }>(o.id, "select edited_text from public.app02_plan_cells where ability='education' and year_index=2", [], "aal1");
    expect(c.edited_text).toBe("A");
    await expectFail(rpc(o.id, "app02_reset_all", ["reset"], "aal1"), "CONFIRM_MISMATCH");
    await rpc(o.id, "app02_set_focus", [1, "{attraction}"], "aal1");
    await rpc(o.id, "app02_reset_all", ["全体初期化"], "aal1");
    const [n] = await selectAs<{ n: number }>(o.id, "select count(*)::int n from public.app02_plan_cells where edited_text is not null", [], "aal1");
    expect(n.n).toBe(0);
    const [v] = await selectAs<{ reason: string }>(o.id, "select reason from public.app02_plan_versions order by version_no desc limit 1", [], "aal1");
    expect(v.reason).toBe("before_reset");
  });
});

describe("競合検出（T16）", () => {
  it("最後に読み込んだ時刻と違えば上書きしない（別端末・別タブでの更新を守る）", async () => {
    const o = await owner();
    const r1 = await rpc<{ updated_at: string }>(o.id, "app02_save_step", ["vision", { why: "端末A" }], "aal1");
    await rpc(o.id, "app02_save_step_checked", ["vision", { why: "端末B" }, r1.updated_at], "aal1"); // 最新を知っている端末Bは保存できる
    await expectFail(rpc(o.id, "app02_save_step_checked", ["vision", { why: "端末A の古い編集" }, r1.updated_at], "aal1"), "CONFLICT");
    const [s] = await selectAs<{ data: { why: string }; updated_at: string }>(o.id, "select data, updated_at::text as updated_at from public.app02_steps where step_code = 'vision'", [], "aal1");
    expect(s.data.why).toBe("端末B");
    await rpc(o.id, "app02_save_step_checked", ["vision", { why: "選び直した内容" }, s.updated_at], "aal1"); // 差分を確認して選び直せば保存できる
    const [c] = await selectAs<{ updated_at: string }>(o.id, "select updated_at::text from public.app02_plan_cells where ability='attraction' and year_index=1", [], "aal1");
    await rpc(o.id, "app02_update_cell_checked", ["attraction", 1, "X", 2, null, null, null, c.updated_at], "aal1");
    await expectFail(rpc(o.id, "app02_update_cell_checked", ["attraction", 1, "Y", 2, null, null, null, c.updated_at], "aal1"), "CONFLICT");
  });
});

describe("経営者志望ラダー（S11）とアカウント削除", () => {
  it("ラダーは LEGACY のみ保存できる", async () => {
    const o = await owner();
    await expectFail(rpc(o.id, "app02_save_step", ["ladder", { rungs: {} }], "aal1"), "LEGACY_ONLY");
    await rpc(root.id, "admin_set_app_role", [o.id, "APP02", "legacy_eligible", true, "", "test"]);
    await rpc(o.id, "app02_set_mode", ["LEGACY"], "aal1");
    expect(await rpc(o.id, "app02_save_step", ["ladder", { rungs: { "1": "doing" } }], "aal1")).toMatchObject({ status: "draft" });
  });

  it("APP02 のデータ（履歴・版・報告を含む）があってもアカウント削除（利用者の削除）ができる", async () => {
    const o = await owner();
    const mentor = await helper(o, "mentor");
    await rpc(o.id, "app02_update_cell", ["attraction", 1, "x", 2, null, null, null], "aal1");
    await rpc(o.id, "app02_save_version", ["v"], "aal1");
    await rpc(o.id, "app02_report_purpose", [o.id, "analysis", "vision", "", "{}"], "aal1");
    // 伴走者が記録した経過がある状態で、伴走者のアカウントを削除しても経過記録は残る（記録者は空欄になる）
    const rep2 = await rpc<{ report_id: string }>(mentor.id, "app02_report_purpose", [o.id, "roadmap", "plan", "", "{}"], "aal1");
    await sql("delete from auth.users where id = $1", [mentor.id]);
    const [ev] = await sql<{ n: number }>("select count(*)::int n from public.app02_purpose_events where report_id = $1 and actor_id is null", [rep2.report_id]);
    expect(Number(ev.n)).toBe(1);
    await sql("delete from auth.users where id = $1", [o.id]);
    const [n] = await sql<{ n: number }>("select (select count(*) from public.app02_plan_history where user_id = $1) + (select count(*) from public.app02_plan_versions where user_id = $1) + (select count(*) from public.app02_purpose_reports where owner_id = $1) as n", [o.id]);
    expect(Number(n.n)).toBe(0);
  });
});
