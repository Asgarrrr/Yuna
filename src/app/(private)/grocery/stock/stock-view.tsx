"use client";

import { Clock, Package, ShoppingCart } from "lucide-react";
import Image from "next/image";
import { useMemo, useOptimistic, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  CATEGORIES,
  LOCATIONS,
  NEXT_STATUS,
  NUTRISCORE_COLORS,
} from "@/lib/grocery/constants";
import type { StockItem } from "@/lib/grocery/queries";
import { cn } from "@/lib/utils";
import {
  addOutOfStockToList,
  cycleStockStatus,
  setStockLocation,
} from "../actions";
import { ProductDrawer } from "./product-drawer";

const statusConfig = {
  in_stock: {
    dot: "bg-green-500",
    ring: "ring-green-500/20",
    label: "En stock",
  },
  low: { dot: "bg-yellow-500", ring: "ring-yellow-500/20", label: "Peu" },
  out: { dot: "bg-red-500", ring: "ring-red-500/20", label: "Épuisé" },
} as const;

// Pre-compute lookup maps for O(1) access instead of .find() on every render
const locationMap = new Map<string, string>(
  LOCATIONS.map((l) => [l.value, l.label]),
);
const categoryMap = new Map<string, string>(
  CATEGORIES.map((c) => [c.value, c.label]),
);
const locationOrder: string[] = LOCATIONS.map((l) => l.value);
const locationRankMap = new Map<string, number>(
  locationOrder.map((value, index) => [value, index]),
);

function getLocationLabel(value: string | null) {
  if (!value) return "Non classé";
  return locationMap.get(value) ?? value;
}

function getCategoryLabel(value: string) {
  return categoryMap.get(value) ?? value;
}

const rtf = new Intl.RelativeTimeFormat("fr", { numeric: "auto" });

function formatRelativeDate(date: Date | null) {
  if (!date) return null;
  const diff = Date.now() - new Date(date).getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  if (days === 0) return "Aujourd'hui";
  if (days < 7) return rtf.format(-days, "day");
  if (days < 30) return rtf.format(-Math.floor(days / 7), "week");
  return rtf.format(-Math.floor(days / 30), "month");
}

export function StockView({
  initialItems,
  restockProductIds = new Set(),
}: {
  initialItems: StockItem[];
  restockProductIds?: Set<string>;
}) {
  const [isPending, startTransition] = useTransition();
  const [items, setOptimisticItems] = useOptimistic(initialItems);
  const [selectedProductId, setSelectedProductId] = useState<string | null>(
    null,
  );
  const [drawerOpen, setDrawerOpen] = useState(false);

  const { selectedItem, grouped, sortedLocations } = useMemo(() => {
    // Derive selected item from current items list so it stays in sync after revalidation
    const selected = selectedProductId
      ? (items.find((item) => item.productId === selectedProductId) ?? null)
      : null;

    // Group by location
    const groupedByLocation = new Map<string, StockItem[]>();
    for (const item of items) {
      const loc = item.location ?? "unset";
      const group = groupedByLocation.get(loc) ?? [];
      group.push(item);
      groupedByLocation.set(loc, group);
    }

    // Sort locations: known locations first (in LOCATIONS order), then unset last
    const sorted = [...groupedByLocation.keys()].sort((a, b) => {
      if (a === "unset") return 1;
      if (b === "unset") return -1;
      const ia = locationRankMap.get(a) ?? 999;
      const ib = locationRankMap.get(b) ?? 999;
      return ia - ib;
    });

    return {
      selectedItem: selected,
      grouped: groupedByLocation,
      sortedLocations: sorted,
    };
  }, [items, selectedProductId]);

  function handleCycleStatus(item: StockItem) {
    const next =
      NEXT_STATUS[item.status as keyof typeof NEXT_STATUS] ?? "in_stock";
    startTransition(async () => {
      setOptimisticItems((prev) =>
        prev.map((i) => (i.id === item.id ? { ...i, status: next } : i)),
      );
      await cycleStockStatus(item.productId, item.status);
    });
  }

  function handleAddToList(item: StockItem) {
    startTransition(async () => {
      await addOutOfStockToList(item.productId);
    });
  }

  function handleSetLocation(item: StockItem, location: string) {
    startTransition(async () => {
      setOptimisticItems((prev) =>
        prev.map((i) => (i.id === item.id ? { ...i, location } : i)),
      );
      await setStockLocation(item.productId, location);
    });
  }

  function handleOpenDrawer(item: StockItem) {
    setSelectedProductId(item.productId);
    setDrawerOpen(true);
  }

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-12 text-center">
        <Package className="size-10 text-muted-foreground" />
        <p className="text-muted-foreground">
          Ton stock est vide. Coche des articles sur ta liste pour les ajouter
          au stock.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="flex flex-col gap-6">
        {sortedLocations.map((loc) => {
          const groupItems = grouped.get(loc) ?? [];
          return (
            <div key={loc} className="flex flex-col gap-1">
              <h2 className="px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {loc === "unset" ? "À ranger" : getLocationLabel(loc)}
              </h2>
              <ul className="flex flex-col gap-0.5">
                {groupItems.map((item) => (
                  <StockRow
                    key={item.id}
                    item={item}
                    showLocationPicker={loc === "unset"}
                    needsRestock={restockProductIds.has(item.productId)}
                    isPending={isPending}
                    onCycleStatus={() => handleCycleStatus(item)}
                    onAddToList={() => handleAddToList(item)}
                    onSetLocation={(location) =>
                      handleSetLocation(item, location)
                    }
                    onTap={() => handleOpenDrawer(item)}
                  />
                ))}
              </ul>
            </div>
          );
        })}
      </div>

      <ProductDrawer
        item={selectedItem}
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
      />
    </>
  );
}

function StockRow({
  item,
  showLocationPicker,
  needsRestock,
  isPending,
  onCycleStatus,
  onAddToList,
  onSetLocation,
  onTap,
}: {
  item: StockItem;
  showLocationPicker: boolean;
  needsRestock: boolean;
  isPending: boolean;
  onCycleStatus: () => void;
  onAddToList: () => void;
  onSetLocation: (location: string) => void;
  onTap: () => void;
}) {
  const config =
    statusConfig[item.status as keyof typeof statusConfig] ??
    statusConfig.in_stock;

  const purchaseDate = formatRelativeDate(item.lastPurchasedAt);

  return (
    <li className="group flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-accent">
      {/* Status dot */}
      <button
        type="button"
        onClick={onCycleStatus}
        className={cn(
          "flex size-7 shrink-0 items-center justify-center rounded-full ring-4 transition-all",
          config.ring,
        )}
        title={`Statut : ${config.label} (cliquer pour changer)`}
      >
        <span
          className={cn("size-2.5 rounded-full transition-colors", config.dot)}
        />
      </button>

      <button
        type="button"
        onClick={onTap}
        className="flex min-w-0 flex-1 items-center gap-3 text-left"
      >
        {/* Product image or category icon */}
        {item.productImageSmallUrl ? (
          <Image
            src={item.productImageSmallUrl}
            alt=""
            width={36}
            height={36}
            className="size-9 shrink-0 rounded-md object-cover"
          />
        ) : (
          item.productIcon && (
            <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted text-lg">
              {item.productIcon}
            </span>
          )
        )}

        {/* Product info */}
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-sm font-medium">
              {item.productName}
            </span>
            {item.productNutriscore && (
              <span
                className={cn(
                  "flex size-4 shrink-0 items-center justify-center rounded text-[10px] font-bold text-white",
                  NUTRISCORE_COLORS[item.productNutriscore] ?? "bg-muted",
                )}
              >
                {item.productNutriscore.toUpperCase()}
              </span>
            )}
          </div>
          <span className="truncate text-xs text-muted-foreground">
            {item.productBrand && `${item.productBrand} · `}
            {getCategoryLabel(item.productCategory)}
            {purchaseDate && ` · ${purchaseDate}`}
          </span>
        </div>

        {/* Restock indicator */}
        {needsRestock && (
          <span className="flex shrink-0 items-center gap-0.5 rounded-full bg-orange-100 px-1.5 py-0.5 text-[10px] font-medium text-orange-700 dark:bg-orange-950 dark:text-orange-400">
            <Clock className="size-2.5" />À racheter
          </span>
        )}

        {/* Price */}
        {item.productLastPrice && (
          <span className="shrink-0 text-xs text-muted-foreground">
            {Number(item.productLastPrice).toFixed(2)}&nbsp;€
          </span>
        )}
      </button>

      {showLocationPicker && (
        <div>
          <Select onValueChange={onSetLocation}>
            <SelectTrigger size="sm" className="h-7 w-24 text-xs">
              <SelectValue placeholder="Où ?" />
            </SelectTrigger>
            <SelectContent>
              {LOCATIONS.map((l) => (
                <SelectItem key={l.value} value={l.value}>
                  {l.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {item.status === "out" && (
        <Button
          variant="ghost"
          size="sm"
          onClick={onAddToList}
          disabled={isPending}
          className="h-7 gap-1 text-xs"
        >
          <ShoppingCart className="size-3" />
          Liste
        </Button>
      )}
    </li>
  );
}
