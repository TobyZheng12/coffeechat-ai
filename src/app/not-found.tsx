import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="grid min-h-[60vh] place-items-center px-4 text-center">
      <div className="space-y-3">
        <p className="eyebrow">404</p>
        <h1 className="text-xl font-semibold">We couldn&apos;t find that</h1>
        <p className="text-sm text-muted-foreground">It may have been deleted, or it belongs to a different account.</p>
        <Link href="/app" className={buttonVariants({ variant: "outline" })}>
          Back to dashboard
        </Link>
      </div>
    </div>
  );
}
