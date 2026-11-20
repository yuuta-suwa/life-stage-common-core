/**
 * APP02 SELF-REALIZATION ENGINE：ワークスペース・ステップ・10ヵ年計画（60セル）・権限
 */
import { describe, it, expect, beforeAll } from "vitest";
import { expectFail, invitedUser, rpc, selectAs, sql, superAdmin } from "./helpers";

type U = { id: string; email: string };
let root: U;
beforeAll(async () => {
  root = await superAdmin();
});

const ABILITIES = ["attraction", "recruitment", "education", "development", "operations", "management"];
const cells = (tag = "rec") =>
  ABILITIES.flatMap((ability) => Array.from({ length: 10 }, (_, i) => ({
    ability, year_index: String(i + 1), text: `${tag} ${ability} ${i + 1}`, level: String(Math.min(5, Math.floor(i / 2))),
    experiences: "学ぶ", criteria: "説明できる",
  })));

async function started(apps = ["APP02"]) {
  const u = await invitedUser(root.id, apps);
  await rpc(u.id, "app02_set_mode", ["CONVICTION"], "aal1");
  return u;
}

describe("APP02 権限と開始", () => {
  it("APP02 権限がない利用者は開始・保存・閲覧できない", async () => {
    const u = await invitedUser(root.id, ["APP01"]);
    await expectFail(rpc(u.id, "app02_set_mode", ["CONVICTION"], "aal1"), "APP_ACCESS_DENIED");
    await expectFail(rpc(u.id, "app02_save_step", ["vision", { a: 1 }], "aal1"), "APP_ACCESS_DENIED");
  });

  it("開始前の保存は拒否。LEVEL は不要だが、LEGACY は管理者が付与した資格が必要（本人の希望・メタデータでは不可）", async () => {
    const u = await invitedUser(root.id, ["APP02"]);
    await expectFail(rpc(u.id, "app02_save_step", ["vision", { a: 1 }], "aal1"), "APP02_NOT_STARTED");
    await expectFail(rpc(u.id, "app02_set_mode", ["LEGACY"], "aal1"), "LEGACY_NOT_ELIGIBLE");
    await sql("update auth.users set raw_user_meta_data = '{\"legacy_eligible\":true,\"role\":\"legacy\"}' where id = $1", [u.id]);
    await expectFail(rpc(u.id, "app02_set_mode", ["LEGACY"], "aal1"), "LEGACY_NOT_ELIGIBLE");
    await rpc(root.id, "admin_set_app_role", [u.id, "APP02", "legacy_eligible", true, "", "経営者志望"]);
    expect(await rpc(u.id, "app02_set_mode", ["LEGACY"], "aal1")).toMatchObject({ mode: "LEGACY" });
    await expectFail(rpc(u.id, "app02_set_mode", ["ADMIN"], "aal1"), "INVALID_REQUEST");
  });
});

describe("APP02 ステップ", () => {
  it("保存・完了・取り消し。未知のステップや巨大データは拒否", async () => {
    const u = await started();
    await expectFail(rpc(u.id, "app02_complete_step", ["sales", true], "aal1"), "ANSWER_REQUIRED");
    await rpc(u.id, "app02_save_step", ["sales", { own_words: "相手の願望を理解し支援する力" }], "aal1");
    expect(await rpc(u.id, "app02_complete_step", ["sales", true], "aal1")).toMatchObject({ status: "done" });
    expect(await rpc(u.id, "app02_complete_step", ["sales", false], "aal1")).toMatchObject({ status: "draft" });
    await expectFail(rpc(u.id, "app02_save_step", ["kpi_daily", { a: 1 }], "aal1"), "INVALID_REQUEST");
    await expectFail(rpc(u.id, "app02_save_step", ["sales", { big: "x".repeat(140000) }], "aal1"), /PAYLOAD_TOO_LARGE|check constraint/);
  });

  it("他の利用者・管理者は本人のステップと計画を閲覧できない（RLS）", async () => {
    const a = await started();
    const b = await started();
    await rpc(a.id, "app02_save_step", ["vision", { secret: "a の願望" }], "aal1");
    await rpc(a.id, "app02_init_plan", [2028, JSON.stringify(cells()), false], "aal1");
    for (const t of ["app02_steps", "app02_plans", "app02_plan_cells", "app02_plan_history", "app02_workspace"]) {
      expect(await selectAs(b.id, `select * from public.${t} where user_id = $1`, [a.id], "aal1")).toHaveLength(0);
      expect(await selectAs(root.id, `select * from public.${t} where user_id = $1`, [a.id])).toHaveLength(0);
    }
    expect(await selectAs(a.id, "select * from public.app02_plan_cells", [], "aal1")).toHaveLength(60);
  });

  it("停止中の利用者は書き込み・閲覧できない", async () => {
    const u = await started();
    await rpc(u.id, "app02_save_step", ["vision", { x: 1 }], "aal1");
    await rpc(root.id, "admin_set_user_status", [u.id, "suspend", "test"]);
    await expectFail(rpc(u.id, "app02_save_step", ["vision", { x: 2 }], "aal1"), "ACCOUNT_NOT_ACTIVE");
    expect(await selectAs(u.id, "select * from public.app02_steps", [], "aal1")).toHaveLength(0);
  });
});

describe("APP02 10ヵ年計画（60セル）", () => {
  it("60セルちょうど・6能力×10年・LV0〜5 以外は作成できない。二重作成は PLAN_EXISTS", async () => {
    const u = await started();
    await expectFail(rpc(u.id, "app02_init_plan", [2028, JSON.stringify(cells().slice(0, 59)), false], "aal1"), "INVALID_CELLS");
    const dup = cells(); dup[59] = { ...dup[0] };
    await expectFail(rpc(u.id, "app02_init_plan", [2028, JSON.stringify(dup), false], "aal1"), "INVALID_CELLS");
    const bad = cells(); bad[0].level = "6";
    await expectFail(rpc(u.id, "app02_init_plan", [2028, JSON.stringify(bad), false], "aal1"), "INVALID_CELLS");
    await expectFail(rpc(u.id, "app02_init_plan", [99, JSON.stringify(cells()), false], "aal1"), "INVALID_START_YEAR");
    await rpc(u.id, "app02_init_plan", [2028, JSON.stringify(cells()), false], "aal1");
    await expectFail(rpc(u.id, "app02_init_plan", [2028, JSON.stringify(cells()), false], "aal1"), "PLAN_EXISTS");
  });

  it("編集・推奨に戻す・ひとつ戻す。推奨と本人編集値は別に保持し、履歴に変更前後を記録", async () => {
    const u = await started();
    await rpc(u.id, "app02_init_plan", [2028, JSON.stringify(cells()), false], "aal1");
    await rpc(u.id, "app02_update_cell", ["attraction", 1, "SNS で月10人と出会う", 2, "発信を週3回", "月10人と面談", "具体化"], "aal1");
    const cell = async () => (await selectAs<{ recommended_text: string; edited_text: string | null; target_level: number | null }>(
      u.id, "select recommended_text, edited_text, target_level from public.app02_plan_cells where ability = 'attraction' and year_index = 1", [], "aal1"))[0];
    expect(await cell()).toEqual({ recommended_text: "rec attraction 1", edited_text: "SNS で月10人と出会う", target_level: 2 });
    await rpc(u.id, "app02_reset_cell", ["attraction", 1], "aal1");
    expect((await cell()).edited_text).toBeNull();
    const undo = await rpc<{ kind: string }>(u.id, "app02_undo", [], "aal1"); // 推奨に戻す を取り消す
    expect(undo.kind).toBe("cell_reset");
    expect((await cell()).edited_text).toBe("SNS で月10人と出会う");
    await rpc(u.id, "app02_undo", [], "aal1"); // 編集そのものを取り消す
    expect((await cell()).edited_text).toBeNull();
    await expectFail(rpc(u.id, "app02_undo", [], "aal1"), "NOTHING_TO_UNDO");
    const hist = await selectAs<{ kind: string; reason: string | null }>(u.id, "select kind, reason from public.app02_plan_history order by id", [], "aal1");
    expect(hist.map((h) => h.kind)).toEqual(["cell_edit", "cell_reset", "undo", "undo"]);
    expect(hist[0].reason).toBe("具体化");
    // 履歴は改ざんできない
    await expectFail(sql("update public.app02_plan_history set reason = 'x' where user_id = $1", [u.id]), "HISTORY_IMMUTABLE");
    // 本人は削除できない（DELETE 権限なし）。利用者そのものの削除（アカウント削除）では連鎖して消える
    await expectFail(selectAs(u.id, "delete from public.app02_plan_history", [], "aal1"), /permission denied/);
  });

  it("推奨の再生成は本人の編集値を保持する", async () => {
    const u = await started();
    await rpc(u.id, "app02_init_plan", [2028, JSON.stringify(cells()), false], "aal1");
    await rpc(u.id, "app02_update_cell", ["education", 3, "後輩2人に教える", 3, null, null, null], "aal1");
    await rpc(u.id, "app02_init_plan", [2028, JSON.stringify(cells("new")), true], "aal1");
    const [c] = await selectAs<{ recommended_text: string; edited_text: string }>(u.id,
      "select recommended_text, edited_text from public.app02_plan_cells where ability = 'education' and year_index = 3", [], "aal1");
    expect(c).toEqual({ recommended_text: "new education 3", edited_text: "後輩2人に教える" });
  });

  it("開始年を変えても年次の入力は保持され、暦年コミットは再確認になる。コミット年は10年の範囲内、変更には理由が必要", async () => {
    const u = await started();
    await rpc(u.id, "app02_init_plan", [2028, JSON.stringify(cells()), false], "aal1");
    await expectFail(rpc(u.id, "app02_set_commit_year", [2040, null], "aal1"), "COMMIT_YEAR_OUT_OF_RANGE");
    await rpc(u.id, "app02_set_commit_year", [2035, null], "aal1");
    await expectFail(rpc(u.id, "app02_set_commit_year", [2036, ""], "aal1"), "REASON_REQUIRED");
    await rpc(u.id, "app02_update_cell", ["management", 8, "子会社の経営体制を構築", 4, null, null, null], "aal1");
    expect(await rpc(u.id, "app02_set_start_year", [2030], "aal1")).toMatchObject({ changed: true, commit_needs_recheck: true });
    const [p] = await selectAs<{ start_year: number; commit_year: number; commit_needs_recheck: boolean }>(u.id,
      "select start_year, commit_year, commit_needs_recheck from public.app02_plans", [], "aal1");
    expect(p).toEqual({ start_year: 2030, commit_year: 2035, commit_needs_recheck: true });
    const [c] = await selectAs<{ edited_text: string }>(u.id, "select edited_text from public.app02_plan_cells where ability = 'management' and year_index = 8", [], "aal1");
    expect(c.edited_text).toBe("子会社の経営体制を構築");
    await rpc(u.id, "app02_set_commit_year", [2037, "開始年変更に合わせて再設定"], "aal1");
    const [p2] = await selectAs<{ commit_needs_recheck: boolean }>(u.id, "select commit_needs_recheck from public.app02_plans", [], "aal1");
    expect(p2.commit_needs_recheck).toBe(false);
  });

  it("重点能力の設定とひとつ戻す。不正な能力名は拒否", async () => {
    const u = await started();
    await rpc(u.id, "app02_init_plan", [2028, JSON.stringify(cells()), false], "aal1");
    await rpc(u.id, "app02_set_focus", [1, "{attraction,recruitment}"], "aal1");
    await expectFail(rpc(u.id, "app02_set_focus", [1, "{sales_kpi}"], "aal1"), "INVALID_REQUEST");
    await rpc(u.id, "app02_set_focus", [1, "{education}"], "aal1");
    await rpc(u.id, "app02_undo", [], "aal1");
    const [p] = await selectAs<{ focus: Record<string, string[]> }>(u.id, "select focus from public.app02_plans", [], "aal1");
    expect(p.focus["1"].sort()).toEqual(["attraction", "recruitment"]);
  });

  it("テーブルへの直接書き込みはできない（RPC のみ）", async () => {
    const u = await started();
    await rpc(u.id, "app02_init_plan", [2028, JSON.stringify(cells()), false], "aal1");
    await expectFail(selectAs(u.id, "update public.app02_plan_cells set edited_text = 'x'", [], "aal1"), /permission denied/);
    await expectFail(selectAs(u.id, "insert into public.app02_steps(user_id, step_code) values ($1, 'sales')", [u.id], "aal1"), /permission denied/);
  });
});
