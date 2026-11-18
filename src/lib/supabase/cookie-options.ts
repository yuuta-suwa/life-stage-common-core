/**
 * Supabase セッション Cookie の属性。
 * @supabase/ssr の既定値には Secure が含まれないため、本番（HTTPS）では Secure を付与する。
 * httpOnly は false（MFA 画面のブラウザクライアントがセッションを参照するため。@supabase/ssr の既定）。
 */
export const supabaseCookieOptions = {
  path: "/",
  sameSite: "lax" as const,
  httpOnly: false,
  secure: process.env.NODE_ENV === "production",
};
