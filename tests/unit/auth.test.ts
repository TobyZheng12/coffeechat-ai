import { describe, expect, it, vi } from "vitest";
import { createToken, safeEqual, verifyToken } from "@/lib/auth/signed-cookie";

const SECRET = "x".repeat(40);
const USER = "10ca1000-0000-4000-8000-000000000001";

describe("local session tokens", () => {
  it("round-trips a valid token", () => {
    expect(verifyToken(createToken(USER, SECRET), SECRET)).toBe(USER);
  });

  it("rejects tampered tokens", () => {
    const t = createToken(USER, SECRET);
    const [, exp, sig] = t.split(".");
    expect(verifyToken(`aaaaaaaa-0000-4000-8000-000000000001.${exp}.${sig}`, SECRET)).toBeNull();
    expect(verifyToken(`${USER}.${Number(exp) + 999999}.${sig}`, SECRET)).toBeNull();
    expect(verifyToken(t, "y".repeat(40))).toBeNull();
    expect(verifyToken("garbage", SECRET)).toBeNull();
    expect(verifyToken(undefined, SECRET)).toBeNull();
  });

  it("rejects expired tokens", () => {
    const t = createToken(USER, SECRET, 1000);
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + 5000);
    expect(verifyToken(t, SECRET)).toBeNull();
    vi.useRealTimers();
  });

  it("compares passcodes safely", () => {
    expect(safeEqual("abc", "abc")).toBe(true);
    expect(safeEqual("abc", "abd")).toBe(false);
    expect(safeEqual("abc", "abcd")).toBe(false);
  });
});
