import { type NextRequest, NextResponse } from "next/server";
import { config } from "@/lib/config";
import { DEMO_ID_PATTERN, newDemoId } from "@/lib/demo/registry";
import { DEMO_COOKIE } from "@/lib/workspace";

/** Starts (or resumes) an isolated demo workspace filled with fictional data. */
export async function GET(request: NextRequest) {
  const cfg = config();
  if (!cfg.demo.enabled) return NextResponse.redirect(new URL("/", request.url));
  const existing = request.cookies.get(DEMO_COOKIE)?.value;
  const id = existing && DEMO_ID_PATTERN.test(existing) ? existing : newDemoId();
  const res = NextResponse.redirect(new URL("/app", request.url));
  res.cookies.set(DEMO_COOKIE, id, {
    httpOnly: true,
    sameSite: "lax",
    secure: cfg.isProduction,
    path: "/",
    maxAge: 60 * 60 * 6,
  });
  return res;
}
