import { ShoppingCart } from "lucide-react";
import Link from "next/link";

export default function Home() {
  return (
    <div className="mx-auto flex min-h-screen max-w-lg flex-col items-center justify-center gap-6 px-4">
      <h1 className="text-2xl font-bold tracking-tight">Yuna</h1>
      <Link
        href="/grocery"
        className="flex items-center gap-2 rounded-lg border border-border px-4 py-3 transition-colors hover:bg-accent"
      >
        <ShoppingCart className="size-5" />
        <span>Liste de courses</span>
      </Link>
    </div>
  );
}
