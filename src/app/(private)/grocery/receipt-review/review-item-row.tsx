"use client";

import {
  ChevronRight,
  Link2,
  Link2Off,
  Loader2,
  Search,
  ShoppingCart,
  Trash2,
  Undo2,
} from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CATEGORIES, PURCHASE_UNITS } from "@/lib/grocery/constants";
import type { ReviewItem } from "@/lib/grocery/receipt-review-schema";
import type { ProductSearchResult } from "@/lib/grocery/types";
import { cn } from "@/lib/utils";
import { searchProducts } from "../actions";
import type { ReviewAction } from "./review-reducer";
import { statusConfig } from "./review-reducer";

// ── Per-item row — mirrors StockRow style ────────────────

export function ReviewItemRow({
  item,
  isExpanded,
  onToggle,
  dispatch,
}: {
  item: ReviewItem;
  isExpanded: boolean;
  onToggle: () => void;
  dispatch: React.Dispatch<ReviewAction>;
}) {
  const isRemoved = item.status === "removed";
  const conf = statusConfig[item.confidence];

  return (
    <li className={cn(isRemoved && "opacity-40")}>
      {/* Row — same structure as stock-view StockRow */}
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-accent"
      >
        {/* Status dot — same pattern as stock-view */}
        <span
          className={cn(
            "flex size-7 shrink-0 items-center justify-center rounded-full ring-4",
            isRemoved
              ? "ring-muted-foreground/10"
              : item.status === "confirmed"
                ? "ring-green-500/20"
                : conf.ring,
          )}
        >
          <span
            className={cn(
              "size-2.5 rounded-full",
              isRemoved
                ? "bg-muted-foreground/30"
                : item.status === "confirmed"
                  ? "bg-green-500"
                  : conf.dot,
            )}
          />
        </span>

        {/* Product info */}
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-center gap-1.5">
            <span
              className={cn(
                "truncate text-sm font-medium",
                isRemoved && "line-through",
              )}
            >
              {item.matchedProductName ?? item.humanName}
            </span>
            {item.matchedProductId && !isRemoved && (
              <Link2 className="size-3 shrink-0 text-green-600" />
            )}
          </div>
          {item.rawName !== item.humanName && !isRemoved && (
            <span className="truncate text-xs text-muted-foreground">
              {item.rawName}
            </span>
          )}
        </div>

        {/* List badge — like restock indicator in stock-view */}
        {item.matchedListItemName && !isRemoved && (
          <span className="flex shrink-0 items-center gap-0.5 rounded-full bg-blue-100 px-1.5 py-0.5 text-[10px] font-medium text-blue-700 dark:bg-blue-950 dark:text-blue-400">
            <ShoppingCart className="size-2.5" />
            Liste
          </span>
        )}

        {/* Price — same as stock-view */}
        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
          {item.totalPrice != null
            ? `${item.totalPrice.toFixed(2)}\u00A0\u20AC`
            : item.unitPrice != null
              ? `${item.unitPrice.toFixed(2)}\u00A0\u20AC`
              : ""}
        </span>

        {/* Chevron */}
        <ChevronRight
          className={cn(
            "size-4 shrink-0 text-muted-foreground/40 transition-transform duration-200",
            isExpanded && "rotate-90",
          )}
        />
      </button>

      {/* Expanded section — product-drawer style */}
      {isExpanded && !isRemoved && (
        <ReviewItemExpanded item={item} dispatch={dispatch} />
      )}

      {/* Removed state — restore action */}
      {isExpanded && isRemoved && (
        <div className="flex justify-end px-3 pb-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => dispatch({ type: "restore_item", index: item.index })}
            className="h-7 gap-1 text-xs"
          >
            <Undo2 className="size-3" />
            Restaurer
          </Button>
        </div>
      )}
    </li>
  );
}

// ── Expanded edit — product-drawer grid style ────────────

function ReviewItemExpanded({
  item,
  dispatch,
}: {
  item: ReviewItem;
  dispatch: React.Dispatch<ReviewAction>;
}) {
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<ProductSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const searchTimeout = useRef<ReturnType<typeof setTimeout>>(null);

  const handleSearch = useCallback((query: string) => {
    setSearchQuery(query);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);

    if (query.length < 2) {
      setSearchResults([]);
      return;
    }

    searchTimeout.current = setTimeout(async () => {
      setIsSearching(true);
      try {
        const results = await searchProducts(query);
        setSearchResults(results);
      } catch {
        setSearchResults([]);
      } finally {
        setIsSearching(false);
      }
    }, 300);
  }, []);

  return (
    <div className="flex flex-col gap-3 px-4 pb-3 pt-1">
      {/* Name */}
      <Input
        value={item.humanName}
        onChange={(e) =>
          dispatch({
            type: "update_item",
            index: item.index,
            updates: { humanName: e.target.value },
          })
        }
        className="text-sm"
      />

      {/* Info grid — same as product-drawer */}
      <div className="grid grid-cols-3 gap-2">
        <div className="col-span-1">
          <p className="mb-1 text-xs text-muted-foreground">Catégorie</p>
          <Select
            value={item.category}
            onValueChange={(value) =>
              dispatch({
                type: "update_item",
                index: item.index,
                updates: { category: value },
              })
            }
          >
            <SelectTrigger size="sm" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CATEGORIES.map((c) => (
                <SelectItem key={c.value} value={c.value}>
                  {c.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <p className="mb-1 text-xs text-muted-foreground">Quantité</p>
          <Input
            type="number"
            min={1}
            value={item.quantity}
            onChange={(e) =>
              dispatch({
                type: "update_item",
                index: item.index,
                updates: { quantity: Number(e.target.value) || 1 },
              })
            }
            className="h-8 text-sm"
          />
        </div>

        <div>
          <p className="mb-1 text-xs text-muted-foreground">Unité</p>
          <Select
            value={item.unit}
            onValueChange={(value) =>
              dispatch({
                type: "update_item",
                index: item.index,
                updates: { unit: value },
              })
            }
          >
            <SelectTrigger size="sm" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PURCHASE_UNITS.map((u) => (
                <SelectItem key={u.value} value={u.value}>
                  {u.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Linked product — like status row in product-drawer */}
      {item.matchedProductId && (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm">
            <Link2 className="size-3.5 text-green-600" />
            <span className="truncate font-medium">{item.matchedProductName}</span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() =>
              dispatch({ type: "unlink_product", index: item.index })
            }
            className="h-7 gap-1 text-xs"
          >
            <Link2Off className="size-3" />
            Dissocier
          </Button>
        </div>
      )}

      {/* Product search — simple input */}
      {!item.matchedProductId && (
        <div>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => handleSearch(e.target.value)}
              placeholder="Associer à un produit existant..."
              className="h-8 pl-8 text-sm"
            />
            {isSearching && (
              <Loader2 className="absolute right-2.5 top-1/2 size-3.5 -translate-y-1/2 animate-spin text-muted-foreground" />
            )}
          </div>
          {searchResults.length > 0 && (
            <ul className="mt-1 flex flex-col gap-0.5">
              {searchResults.map((product) => (
                <li key={product.id}>
                  <button
                    type="button"
                    onClick={() => {
                      dispatch({
                        type: "link_product",
                        index: item.index,
                        productId: product.id,
                        productName: product.name,
                      });
                      setSearchQuery("");
                      setSearchResults([]);
                    }}
                    className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors hover:bg-accent"
                  >
                    <Link2 className="size-3.5 shrink-0 text-muted-foreground" />
                    <span className="flex-1 truncate">{product.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {CATEGORIES.find((c) => c.value === product.category)?.label}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Remove action — like stock-view "Liste" button */}
      <div className="flex justify-end">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => dispatch({ type: "remove_item", index: item.index })}
          className="h-7 gap-1 text-xs text-muted-foreground hover:text-destructive"
        >
          <Trash2 className="size-3" />
          Ignorer
        </Button>
      </div>
    </div>
  );
}
