import { Suspense } from "react";
import { getStock } from "@/lib/grocery/queries";
import { StockView } from "./stock-view";

export default function StockPage() {
  return (
    <Suspense
      fallback={
        <div className="flex flex-col gap-1">
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="h-12 animate-pulse rounded-lg bg-muted"
              style={{ animationDelay: `${i * 100}ms` }}
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
  const items = await getStock();
  return <StockView initialItems={items} />;
}
