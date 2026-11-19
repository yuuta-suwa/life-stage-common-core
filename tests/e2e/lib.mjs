/**
 * E2E 用ヘルパー（ローカル Supabase スタック専用）。
 * - SB_SECRET はローカル CLI が出力するデモ用キーのみを想定。本番・検証環境のキーは絶対に使わない。
 * - Google ログインはローカルでは再現できないため、パスワードでセッションを作り、
 *   auth.identities に provider=google の行を追加して「Google で認証済み」の状態を模擬する。
 */
import { createRequire } from "node:module";
import crypto from "node:crypto";
import pg from "pg";
import { createServerClient } from "@supabase/ssr";

const require = createRequire(import.meta.url);
export const { chromium } = require("playwright");

export const env = {
  base: process.env.E2E_BASE_URL ?? "http://localhost:3100",
  sbUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321",
  sbPub: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  sbSecret: process.env.E2E_LOCAL_SECRET_KEY,
  dbUrl: process.env.E2E_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
};
if (!/^(http:\/\/)(127\.0\.0\.1|localhost)/.test(env.sbUrl)) throw new Error("E2E はローカル Supabase でのみ実行できます");
if (!env.sbPub || !env.sbSecret) throw new Error("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY / E2E_LOCAL_SECRET_KEY（ローカル）を設定してください");

export const PASSWORD = "e2e-Local-Only-Pass-1!";
export const db = new pg.Client({ connectionString: env.dbUrl });

export async function sql(text, params = []) {
  return (await db.query(text, params)).rows;
}

/** ローカル Auth にユーザーを作り、Google 認証済みの状態を模擬する */
export async function createUser(email) {
  const res = await fetch(`${env.sbUrl}/auth/v1/admin/users`, {
    method: "POST",
    headers: { apikey: env.sbSecret, Authorization: `Bearer ${env.sbSecret}`, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: PASSWORD, email_confirm: true, user_metadata: { full_name: email.split("@")[0] } }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`createUser ${email}: ${JSON.stringify(body)}`);
  await sql(
    `insert into auth.identities(provider_id, user_id, identity_data, provider, created_at, updated_at, last_sign_in_at)
     values ($1, $2, jsonb_build_object('sub', $1::text, 'email', $3::text, 'email_verified', true), 'google', now(), now(), now())`,
    [`g-${body.id}`, body.id, email],
  );
  return body.id;
}

function totp(secretBase32, t = Date.now()) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const c of secretBase32.replace(/=+$/, "").toUpperCase()) bits += alphabet.indexOf(c).toString(2).padStart(5, "0");
  const key = Buffer.from(bits.match(/.{8}/g).map((b) => parseInt(b, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(t / 1000 / 30)));
  const h = crypto.createHmac("sha1", key).update(counter).digest();
  const o = h[h.length - 1] & 0xf;
  return String(((h.readUInt32BE(o) & 0x7fffffff) % 1e6)).padStart(6, "0");
}

const totpSecrets = new Map();

/** パスワードでサインインし（必要なら TOTP で aal2 に昇格し）、ブラウザ用の Cookie を返す */
export async function sessionCookies(email, { mfa = false } = {}) {
  const jar = new Map();
  const client = createServerClient(env.sbUrl, env.sbPub, {
    cookies: {
      getAll: () => [...jar].map(([name, value]) => ({ name, value })),
      setAll: (list) => list.forEach(({ name, value }) => (value ? jar.set(name, value) : jar.delete(name))),
    },
  });
  const { error } = await client.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw error;
  if (mfa) {
    let secret = totpSecrets.get(email);
    let factorId;
    if (!secret) {
      const { data, error: e } = await client.auth.mfa.enroll({ factorType: "totp", friendlyName: "e2e" });
      if (e) throw e;
      secret = data.totp.secret;
      factorId = data.id;
      totpSecrets.set(email, { secret, factorId });
    } else ({ secret, factorId } = secret);
    const { error: e2 } = await client.auth.mfa.challengeAndVerify({ factorId, code: totp(secret) });
    if (e2) throw e2;
  }
  const host = new URL(env.base).hostname;
  return [...jar].map(([name, value]) => ({ name, value, domain: host, path: "/", httpOnly: false, secure: false, sameSite: "Lax" }));
}

/** 指定ユーザーとしてログイン済みのブラウザコンテキストを作る */
export async function loginContext(browser, email, opts = {}) {
  const ctx = await browser.newContext({ baseURL: env.base, viewport: opts.viewport ?? { width: 1280, height: 900 }, locale: "ja-JP" });
  await ctx.addCookies(await sessionCookies(email, opts));
  return ctx;
}

const results = [];
export async function step(name, fn) {
  const t = Date.now();
  try {
    await fn();
    results.push({ name, ok: true, ms: Date.now() - t });
    console.log(`  ✓ ${name}`);
  } catch (e) {
    results.push({ name, ok: false, ms: Date.now() - t, error: String(e?.message ?? e).split("\n")[0] });
    console.log(`  ✗ ${name}\n      ${String(e?.message ?? e).split("\n").slice(0, 3).join("\n      ")}`);
  }
}
export function summary() {
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  return { results, failed };
}
export function expect(cond, msg) {
  if (!cond) throw new Error(msg);
}
