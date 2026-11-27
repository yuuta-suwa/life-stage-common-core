import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";
import { lineExternalUrl } from "@/lib/in-app-browser";

export async function proxy(request: NextRequest) {
  // LINE のアプリ内ブラウザでは Google ログインが拒否されるため、端末の通常のブラウザで開き直す（D-58）
  const external = lineExternalUrl(request.method, request.nextUrl, request.headers.get("user-agent"));
  if (external) return NextResponse.redirect(external, 307);
  return updateSession(request);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
