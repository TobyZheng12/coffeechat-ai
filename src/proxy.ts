import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { refreshSupabaseSession } from "@/lib/supabase/proxy";

/**
 * Runs before matching requests. Its only job is keeping the Supabase auth
 * cookie fresh. Real authorization happens on the server for every page and
 * action (see src/lib/workspace.ts) — the proxy is not a security boundary.
 */
export async function proxy(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const backend = process.env.DATA_BACKEND ?? (url && key ? "supabase" : "local");
  if (backend !== "supabase" || !url || !key || request.cookies.has("cc_demo")) return NextResponse.next();
  return refreshSupabaseSession(request, url, key);
}

export const config = {
  matcher: ["/app/:path*", "/login", "/auth/:path*"],
};
