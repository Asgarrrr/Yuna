"use client";

import {
  Check,
  Loader2,
  ShoppingCart,
} from "lucide-react";
import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import type { StreamedObject } from "@/lib/grocery/types";
import { pluralize } from "@/lib/utils";
import { commitReceiptItems, matchReceiptToList } from "../actions";
import { ReviewItemRow } from "./review-item-row";
import { reviewReducer, toReviewItems } from "./review-reducer";

// ── Types ────────────────────────────────────────────────

type ReceiptReviewProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The raw streamed object from useObject */
  streamedObject: StreamedObject;
  /** Whether the AI stream is still running */
  isStreaming: boolean;
  /** Stream or parse error message */
  error: string | null;
  /** Called when user wants to retry (re-open file picker) */
  onRetry: () => void;
  onCommitComplete: (count: number) => void;
};

// ── Main component ───────────────────────────────────────

export function ReceiptReviewDrawer({
  open,
  onOpenChange,
  streamedObject,
  isStreaming,
  error,
  onRetry,
  onCommitComplete,
}: ReceiptReviewProps) {
  const [{ items, listMatches }, dispatch] = useReducer(reviewReducer, {
    items: [],
    listMatches: [],
  });
  const [isCommitting, setIsCommitting] = useState(false);
  const [isMatchingList, setIsMatchingList] = useState(false);
  const [commitError, setCommitError] = useState<string | null>(null);
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);

  const storeName = streamedObject?.storeName ?? null;
  const date = streamedObject?.date ?? null;
  const rawStreamedItems = streamedObject?.items ?? [];

  // Convert streamed items to ReviewItems and sync into reducer
  const reviewItems = useMemo(() => toReviewItems(rawStreamedItems), [rawStreamedItems]);

  useEffect(() => {
    if (reviewItems.length > 0) {
      dispatch({ type: "sync_items", incoming: reviewItems });
    }
  }, [reviewItems]);

  const activeItems = useMemo(() => items.filter((i) => i.status !== "removed"), [items]);
  const needsReviewCount = useMemo(
    () => items.filter((i) => i.status === "needs_review").length,
    [items],
  );

  // Auto-scroll as items arrive
  const scrollRef = useRef<HTMLDivElement>(null);
  const prevCountRef = useRef(0);
  useEffect(() => {
    if (items.length > prevCountRef.current && scrollRef.current) {
      scrollRef.current.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: "smooth",
      });
    }
    prevCountRef.current = items.length;
  }, [items.length]);

  // Run list matching when stream completes
  const listMatchTriggeredRef = useRef(false);
  useEffect(() => {
    if (isStreaming || items.length === 0 || listMatchTriggeredRef.current) return;
    listMatchTriggeredRef.current = true;

    let cancelled = false;
    setIsMatchingList(true);
    matchReceiptToList(items.map((i) => ({ humanName: i.humanName })))
      .then((matches) => {
        if (!cancelled) {
          dispatch({ type: "set_list_matches", matches });
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setIsMatchingList(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isStreaming, items]);

  const commitCalledRef = useRef(false);

  async function handleCommit() {
    if (commitCalledRef.current || isCommitting) return;
    commitCalledRef.current = true;
    setIsCommitting(true);
    setCommitError(null);

    try {
      const commitItems = activeItems.map((item) => ({
        rawName: item.rawName,
        humanName: item.humanName,
        category: item.category,
        quantity: item.quantity,
        unit: item.unit,
        unitPrice: item.unitPrice,
        totalPrice: item.totalPrice,
        matchedProductId: item.matchedProductId,
        isCodeMapping:
          (item.isEdited || !!item.matchedProductId) &&
          item.rawName !== item.humanName,
      }));

      const matchedListItemIds = activeItems
        .map((i) => i.matchedListItemId)
        .filter(Boolean) as string[];

      const result = await commitReceiptItems(
        commitItems,
        storeName,
        matchedListItemIds,
      );

      onCommitComplete(result.count);
    } catch {
      setCommitError("Erreur lors de la confirmation");
      commitCalledRef.current = false;
      setTimeout(() => setCommitError(null), 3000);
    } finally {
      setIsCommitting(false);
    }
  }

  const streamDone = !isStreaming && items.length > 0 && !error;

  const subtitle = [
    storeName,
    date,
    isStreaming
      ? `${items.length} produit${items.length > 1 ? "s" : ""} en cours...`
      : `${pluralize(activeItems.length, "article")}`,
  ]
    .filter(Boolean)
    .join(" \u00B7 ");

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle className="flex items-center gap-2">
            {isStreaming
              ? "Lecture du ticket..."
              : "Vérification du ticket"}
            {isStreaming && (
              <Loader2 className="size-4 animate-spin text-muted-foreground" />
            )}
            {!isStreaming && needsReviewCount > 0 && (
              <Badge variant="outline" className="text-xs font-normal">
                {needsReviewCount} à vérifier
              </Badge>
            )}
          </DrawerTitle>
          <DrawerDescription>{subtitle}</DrawerDescription>
        </DrawerHeader>

        {/* Item list */}
        <div
          ref={scrollRef}
          className="flex max-h-[55vh] flex-col overflow-y-auto px-4 pb-3"
        >
          {/* Empty streaming state */}
          {items.length === 0 && isStreaming && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="flex flex-col gap-2 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
              <p>{error}</p>
              <Button
                variant="outline"
                size="sm"
                onClick={onRetry}
                className="self-start"
              >
                Réessayer
              </Button>
            </div>
          )}

          <ul className="flex flex-col gap-0.5">
            {items.map((item) => (
              <ReviewItemRow
                key={item.index}
                item={item}
                isExpanded={expandedIndex === item.index}
                onToggle={() =>
                  setExpandedIndex((prev) =>
                    prev === item.index ? null : item.index,
                  )
                }
                dispatch={dispatch}
              />
            ))}
          </ul>

          {/* Streaming indicator at bottom of list */}
          {isStreaming && items.length > 0 && (
            <div className="flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground">
              <Loader2 className="size-3 animate-spin" />
              Extraction en cours...
            </div>
          )}

          {/* List matching */}
          {(listMatches.length > 0 || isMatchingList) && (
            <div className="mt-4 flex flex-col gap-1">
              <h2 className="flex items-center gap-2 px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <ShoppingCart className="size-3" />
                Liste de courses
                {isMatchingList && <Loader2 className="size-3 animate-spin" />}
              </h2>
              <ul className="flex flex-col gap-0.5">
                {listMatches.map((match) => (
                  <li
                    key={`${match.listItemId}-${match.receiptItemIndex}`}
                    className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm"
                  >
                    <span className="flex size-5 shrink-0 items-center justify-center rounded border border-green-500/40 bg-green-500/10">
                      <Check className="size-3 text-green-600" />
                    </span>
                    <span className="text-muted-foreground">{match.listItemName}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Footer */}
        <DrawerFooter>
          {commitError && (
            <p className="text-center text-sm text-destructive">{commitError}</p>
          )}
          <Button
            onClick={handleCommit}
            disabled={!streamDone || activeItems.length === 0 || isCommitting}
            className="w-full gap-2"
          >
            {isCommitting ? (
              <Loader2 className="size-4 animate-spin" />
            ) : isStreaming ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Check className="size-4" />
            )}
            {isStreaming
              ? `Extraction... (${pluralize(items.length, "article")})`
              : `Confirmer ${pluralize(activeItems.length, "article")}`}
          </Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
