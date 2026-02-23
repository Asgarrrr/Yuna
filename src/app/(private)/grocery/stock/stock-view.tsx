"use client";

import { Package, Plus, ShoppingCart } from "lucide-react";
import { useOptimistic, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { CATEGORIES, LOCATIONS } from "@/lib/grocery/constants";
import { cn } from "@/lib/utils";
import {
  addOutOfStockToList,
  cycleStockStatus,
  setStockLocation,
} from "../actions";

type StockItem = {
  id: string;
  productId: string;
  status: string;
  location: string | null;
  expiresAt: Date | null;
  depletedAt: Date | null;
  lastPurchasedAt: Date | null;
  productName: string;
  productIcon: string | null;
  productCategory: string;
};

const statusConfig = {
  in_stock: { dot: "bg-green-500", ring: "ring-green-500/20", label: "En stock" },
  low: { dot: "bg-yellow-500", ring: "ring-yellow-500/20", label: "Peu" },
  out: { dot: "bg-red-500", ring: "ring-red-500/20", label: "Épuisé" },
} as const;

const nextStatusMap: Record<string, string> = {
  in_stock: "low",
  low: "out",
  out: "in_stock",
};

function getLocationLabel(value: string | null) {
  if (!value) return "Non classé";
  return LOCATIONS.find((l) => l.value === value)?.label ?? value;
}

function getCategoryLabel(value: string) {
  return CATEGORIES.find((c) => c.value === value)?.label ?? value;
}

function formatRelativeDate(date: Date | null) {
  if (!date) return null;
  const now = new Date();
  const diff = now.getTime() - new Date(date).getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  if (days === 0) return "Aujourd'hui";
  if (days === 1) return "Hier";
  if (days < 7) return `Il y a ${days}j`;
  if (days < 30) return `Il y a ${Math.floor(days / 7)} sem.`;
  return `Il y a ${Math.floor(days / 30)} mois`;
}

export function StockView({ initialItems }: { initialItems: StockItem[] }) {
  const [isPending, startTransition] = useTransition();
  const [items, setOptimisticItems] = useOptimistic(initialItems);

  // Group by location
  const grouped = new Map<string, StockItem[]>();
  for (const item of items) {
    const loc = item.location ?? "unset";
    const group = grouped.get(loc) ?? [];
    group.push(item);
    grouped.set(loc, group);
  }

  // Sort locations: known locations first (in LOCATIONS order), then unset last
  const locationOrder: string[] = LOCATIONS.map((l) => l.value);
  const sortedLocations = [...grouped.keys()].sort((a, b) => {
    if (a === "unset") return 1;
    if (b === "unset") return -1;
    const ia = locationOrder.indexOf(a);
    const ib = locationOrder.indexOf(b);
    return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
  });

  function handleCycleStatus(item: StockItem) {
    const next = nextStatusMap[item.status] ?? "in_stock";
    startTransition(async () => {
      setOptimisticItems((prev) =>
        prev.map((i) =>
          i.id === item.id ? { ...i, status: next } : i,
        ),
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
        prev.map((i) =>
          i.id === item.id ? { ...i, location } : i,
        ),
      );
      await setStockLocation(item.productId, location);
    });
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
                  isPending={isPending}
                  onCycleStatus={() => handleCycleStatus(item)}
                  onAddToList={() => handleAddToList(item)}
                  onSetLocation={(location) => handleSetLocation(item, location)}
                />
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

function StockRow({
  item,
  showLocationPicker,
  isPending,
  onCycleStatus,
  onAddToList,
  onSetLocation,
}: {
  item: StockItem;
  showLocationPicker: boolean;
  isPending: boolean;
  onCycleStatus: () => void;
  onAddToList: () => void;
  onSetLocation: (location: string) => void;
}) {
  const config =
    statusConfig[item.status as keyof typeof statusConfig] ??
    statusConfig.in_stock;

  const purchaseDate = formatRelativeDate(item.lastPurchasedAt);

  return (
    <li className="group flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-accent">
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
          className={cn(
            "size-2.5 rounded-full transition-colors",
            config.dot,
          )}
        />
      </button>

      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm font-medium">
          {item.productName}
        </span>
        <span className="text-xs text-muted-foreground">
          {getCategoryLabel(item.productCategory)}
          {purchaseDate && ` · ${purchaseDate}`}
        </span>
      </div>

      {showLocationPicker && (
        <select
          className="h-7 rounded-md border border-input bg-background px-2 text-xs"
          defaultValue=""
          onChange={(e) => {
            if (e.target.value) onSetLocation(e.target.value);
          }}
        >
          <option value="" disabled>
            Où ?
          </option>
          {LOCATIONS.map((l) => (
            <option key={l.value} value={l.value}>
              {l.label}
            </option>
          ))}
        </select>
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
