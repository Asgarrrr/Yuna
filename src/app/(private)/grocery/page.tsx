import { cacheLife, cacheTag } from "next/cache";
import { Suspense } from "react";
import { getSession } from "@/lib/auth/session";
import { getActiveListWithItems, getSuggestions } from "@/lib/grocery/queries";
import { GroceryList } from "./grocery-list";
import { SuggestionChips } from "./suggestion-chips";

const LIST_SKELETON_KEYS = [
  "list-skeleton-1",
  "list-skeleton-2",
  "list-skeleton-3",
] as const;

export default async function GroceryPage() {
  const session = await getSession();

  return (
    <>
      <Suspense fallback={null}>
        <SuggestionsLoader userId={session.user.id} />
      </Suspense>
      <Suspense
        fallback={
          <div className="flex flex-col gap-1">
            {LIST_SKELETON_KEYS.map((key) => (
              <div
                key={key}
                className="h-12 animate-pulse rounded-lg bg-muted"
              />
            ))}
          </div>
        }
      >
        <GroceryListLoader userId={session.user.id} />
      </Suspense>
    </>
  );
}

async function GroceryListLoader({ userId }: { userId: string }) {
  "use cache";
  cacheTag("grocery-list");
  cacheLife("minutes");
  const { items } = await getActiveListWithItems(userId);
  return <GroceryList initialItems={items} />;
}

async function SuggestionsLoader({ userId }: { userId: string }) {
  "use cache";
  cacheTag("grocery-suggestions");
  cacheLife("hours");
  const suggestions = await getSuggestions(userId);
  if (suggestions.length === 0) return null;
  return <SuggestionChips suggestions={suggestions} />;
}
