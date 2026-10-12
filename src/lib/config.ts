/**
 * Central, typed access to environment variables. Read lazily so tests can
 * set `process.env` before use.
 *
 * Nothing here is exposed to the browser except variables prefixed with
 * NEXT_PUBLIC_ (the Supabase URL and publishable key, which are designed to
 * be public; Row Level Security protects the data).
 */

export type DataBackend = "supabase" | "local";

export function config() {
  const env = process.env;
  const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const supabaseKey = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
  const backend: DataBackend =
    (env.DATA_BACKEND as DataBackend | undefined) ?? (supabaseUrl && supabaseKey ? "supabase" : "local");

  return {
    backend,
    isProduction: env.NODE_ENV === "production",
    supabase: { url: supabaseUrl, key: supabaseKey },
    /** Comma-separated list of emails allowed to sign in to the private app. */
    allowedEmails: (env.ALLOWED_EMAILS ?? "")
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),
    local: {
      passcode: env.LOCAL_PASSCODE ?? "",
      dataFile: env.LOCAL_DATA_FILE ?? ".data/local-db.json",
    },
    sessionSecret: env.SESSION_SECRET ?? "",
    ai: {
      apiKey: env.ANTHROPIC_API_KEY ?? "",
      model: env.AI_MODEL ?? "claude-opus-5-5",
      /** "auto" = Claude when a key is set, otherwise offline templates. */
      provider: (env.AI_PROVIDER ?? "auto") as "auto" | "anthropic" | "mock",
      dailyLimit: Number(env.AI_DAILY_LIMIT ?? 60),
    },
    demo: {
      enabled: (env.DEMO_ENABLED ?? "true") !== "false",
      /** The public demo uses offline templates unless explicitly set to "live". */
      ai: (env.DEMO_AI ?? "mock") as "mock" | "live",
      dailyLimit: Number(env.DEMO_AI_DAILY_LIMIT ?? 15),
    },
    siteUrl: env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
  };
}
