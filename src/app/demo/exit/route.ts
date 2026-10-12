import { type NextRequest, NextResponse } from "next/server";
import { DEMO_COOKIE } from "@/lib/workspace";

export async function POST(request: NextRequest) {
  const res = NextResponse.redirect(new URL("/", request.url), 303);
  res.cookies.delete(DEMO_COOKIE);
  return res;
}
