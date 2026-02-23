import { Suspense } from "react";
import { getSession } from "@/lib/auth/session";
import { getActiveListWithItems, getSuggestions } from "@/lib/grocery/queries";
import { GroceryList } from "./grocery-list";
import { SuggestionChips } from "./list/suggestion-chips";

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
            {Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
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
  const { items } = await getActiveListWithItems(userId);
  return <GroceryList initialItems={items} />;
}

async function SuggestionsLoader({ userId }: { userId: string }) {
  const suggestions = await getSuggestions(userId);
  if (suggestions.length === 0) return null;
  return <SuggestionChips suggestions={suggestions} />;
}
