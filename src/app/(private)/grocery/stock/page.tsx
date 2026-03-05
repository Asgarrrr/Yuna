import { cacheLife, cacheTag } from "next/cache";
import { Suspense } from "react";
import { getSession } from "@/lib/auth/session";
import { getProductsNeedingRestock, getStock } from "@/lib/grocery/queries";
import { StockView } from "./stock-view";

const STOCK_SKELETON_KEYS = [
  "stock-skeleton-1",
  "stock-skeleton-2",
  "stock-skeleton-3",
  "stock-skeleton-4",
  "stock-skeleton-5",
] as const;

export default async function StockPage() {
  await getSession();

  return (
    <Suspense
      fallback={
        <div className="flex flex-col gap-1">
          {STOCK_SKELETON_KEYS.map((key, index) => (
            <div
              key={key}
              className="h-12 animate-pulse rounded-lg bg-muted"
              style={{ animationDelay: `${index * 100}ms` }}
            />
          ))}
        </div>
      }
    >
      <StockLoader />
    </Suspense>
  );
}

async function StockLoader() {
  "use cache";
  cacheTag("grocery-stock");
  cacheLife("minutes");
  const [items, restockIds] = await Promise.all([
    getStock(),
    getProductsNeedingRestock(),
  ]);
  const restockProductIds = new Set(restockIds);
  return (
    <StockView initialItems={items} restockProductIds={restockProductIds} />
  );
}
