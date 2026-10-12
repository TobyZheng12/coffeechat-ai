import { Coffee } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { config } from "@/lib/config";
import { getWorkspace } from "@/lib/workspace";
import { EmailLoginForm, LocalLoginForm } from "./login-forms";

// Per-user page: reads the session on every request (see docs/ARCHITECTURE.md).
export const instant = false;

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const ws = await getWorkspace();
  if (ws && ws.mode !== "demo") redirect("/app");
  const cfg = config();
  const { error } = await searchParams;
  return (
    <div className="grid min-h-screen place-items-center px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="space-y-2 text-center">
          <span className="mx-auto grid size-10 place-items-center rounded-xl bg-brand text-brand-foreground">
            <Coffee className="size-5" />
          </span>
          <h1 className="text-xl font-semibold tracking-tight">Sign in to CoffeeChat AI</h1>
          <p className="text-sm text-muted-foreground">Your private networking workspace.</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-5">
          {error ? (
            <p className="mb-4 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
              That sign-in link was invalid or expired. Request a new one.
            </p>
          ) : null}
          {cfg.backend === "supabase" ? (
            <EmailLoginForm />
          ) : cfg.isProduction ? (
            <p className="text-sm text-muted-foreground">Sign-in isn&apos;t configured on this deployment.</p>
          ) : (
            <LocalLoginForm passcodeRequired={!!cfg.local.passcode} />
          )}
        </div>
        {cfg.demo.enabled ? (
          <p className="text-center text-sm text-muted-foreground">
            Just looking?{" "}
            <a href="/demo" className="font-medium text-brand underline-offset-4 hover:underline">
              Explore the demo
            </a>{" "}
            with fictional data.
          </p>
        ) : null}
        <p className="text-center text-xs text-muted-foreground">
          <Link href="/" className="hover:underline">
            ← Back to home
          </Link>
        </p>
      </div>
    </div>
  );
}
