import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { refreshSupabaseSession } from "@/lib/supabase/proxy";

/**
 * Runs before matching requests:
 *  1. An optimistic redirect to /login when a request for /app has no session
 *     cookie at all (a fast, proper HTTP redirect).
 *  2. Keeping the Supabase auth cookie fresh.
 * This is NOT the security boundary: every page and action re-checks the
 * session on the server (src/lib/workspace.ts).
 */
export async function proxy(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const backend = process.env.DATA_BACKEND ?? (url && key ? "supabase" : "local");
  const cookies = request.cookies;
  const hasSession =
    cookies.has("cc_demo") ||
    cookies.has("cc_session") ||
    cookies.getAll().some((c) => c.name.startsWith("sb-") && c.name.includes("auth-token"));

  if (request.nextUrl.pathname.startsWith("/app") && !hasSession) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  if (backend !== "supabase" || !url || !key || cookies.has("cc_demo")) return NextResponse.next();
  return refreshSupabaseSession(request, url, key);
}

export const config = {
  matcher: ["/app/:path*", "/login", "/auth/:path*"],
};
