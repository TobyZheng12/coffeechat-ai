import { z } from "zod";
import { isISODate } from "@/lib/domain/dates";
import type { AppContext } from "./context";

const optionalDate = z
  .string()
  .trim()
  .default("")
  .refine((v) => v === "" || isISODate(v), "Use YYYY-MM-DD")
  .transform((v) => (v === "" ? null : v));

const list = z
  .union([z.array(z.string()), z.string()])
  .default([])
  .transform((v) =>
    (Array.isArray(v) ? v : v.split(/[,\n]/))
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 40),
  );

export const ProfileSchema = z
  .object({
    full_name: z.string().trim().max(200).default(""),
    preferred_name: z.string().trim().max(100).default(""),
    hometown: z.string().trim().max(200).default(""),
    school: z.string().trim().max(200).default(""),
    major: z.string().trim().max(200).default(""),
    background: z.string().trim().max(4000).default(""),
    interests: list,
    target_companies: list,
    career_goals: z.string().trim().max(2000).default(""),
    intro_pitch: z.string().trim().max(2000).default(""),
    native_language: z.string().trim().max(100).default(""),
    english_second_language: z.boolean().default(false),
    timezone: z
      .string()
      .trim()
      .default("America/Denver")
      .refine((tz) => {
        try {
          new Intl.DateTimeFormat("en-US", { timeZone: tz });
          return true;
        } catch {
          return false;
        }
      }, "Unknown time zone"),
    mission_start: optionalDate,
    mission_end: optionalDate,
    mission_location: z.string().trim().max(200).default(""),
    mission_disclosure: z.enum(["when_relevant", "never"]).default("when_relevant"),
  })
  .refine((p) => !p.mission_start || !p.mission_end || p.mission_end > p.mission_start, {
    message: "Return date must be after the start date",
    path: ["mission_end"],
  });

export async function saveProfile(ctx: AppContext, raw: z.input<typeof ProfileSchema>) {
  return ctx.repo.saveProfile(ProfileSchema.parse(raw));
}
