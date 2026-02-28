import { cacheLife, cacheTag } from "next/cache";
import { Suspense } from "react";
import { getSession } from "@/lib/auth/session";
import { getActiveListWithItems, getSuggestions } from "@/lib/grocery/queries";
import { GroceryList } from "./grocery-list";

const LIST_SKELETON_KEYS = [
  "list-skeleton-1",
  "list-skeleton-2",
  "list-skeleton-3",
] as const;

export default async function GroceryPage() {
  const session = await getSession();

  return (
    <Suspense
      fallback={
        <div className="flex flex-col gap-1">
          {LIST_SKELETON_KEYS.map((key) => (
            <div key={key} className="h-12 animate-pulse rounded-lg bg-muted" />
          ))}
        </div>
      }
    >
      <GroceryListLoader userId={session.user.id} />
    </Suspense>
  );
}

async function GroceryListLoader({ userId }: { userId: string }) {
  "use cache";
  cacheTag("grocery-list", "grocery-suggestions");
  cacheLife("minutes");
  const [{ items }, suggestions] = await Promise.all([
    getActiveListWithItems(userId),
    getSuggestions(userId),
  ]);
  return <GroceryList initialItems={items} suggestions={suggestions} />;
}
