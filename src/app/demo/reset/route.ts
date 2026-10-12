import { type NextRequest, NextResponse } from "next/server";
import { DEMO_ID_PATTERN, resetDemoWorkspace } from "@/lib/demo/registry";
import { DEMO_COOKIE } from "@/lib/workspace";

/** Throws away the visitor's demo changes and reseeds the fictional data. */
export async function POST(request: NextRequest) {
  const id = request.cookies.get(DEMO_COOKIE)?.value;
  if (id && DEMO_ID_PATTERN.test(id)) resetDemoWorkspace(id);
  return NextResponse.redirect(new URL("/app", request.url), 303);
}
