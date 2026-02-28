import type { ListMatch, ReviewItem } from "@/lib/grocery/receipt-review-schema";
import type { StreamedObject } from "@/lib/grocery/types";

// ── Types ────────────────────────────────────────────────

export type ReviewAction =
  | { type: "sync_items"; incoming: ReviewItem[] }
  | { type: "update_item"; index: number; updates: Partial<ReviewItem> }
  | { type: "remove_item"; index: number }
  | { type: "restore_item"; index: number }
  | { type: "set_list_matches"; matches: ListMatch[] }
  | { type: "link_product"; index: number; productId: string; productName: string }
  | { type: "unlink_product"; index: number };

export type ReviewState = {
  items: ReviewItem[];
  listMatches: ListMatch[];
};

// ── Reducer ──────────────────────────────────────────────

export function reviewReducer(state: ReviewState, action: ReviewAction): ReviewState {
  switch (action.type) {
    case "sync_items": {
      // Merge incoming items: keep user edits for existing indices, add new ones
      const existingByIndex = new Map(state.items.map((i) => [i.index, i]));
      const merged = action.incoming.map((incoming) => {
        const existing = existingByIndex.get(incoming.index);
        // If user has edited this item, preserve their changes
        if (existing?.isEdited || existing?.status === "removed" || existing?.status === "confirmed") {
          return existing;
        }
        return incoming;
      });
      return { ...state, items: merged };
    }
    case "update_item":
      return {
        ...state,
        items: state.items.map((item) =>
          item.index === action.index
            ? { ...item, ...action.updates, isEdited: true, status: "confirmed" }
            : item,
        ),
      };
    case "remove_item":
      return {
        ...state,
        items: state.items.map((item) =>
          item.index === action.index ? { ...item, status: "removed" } : item,
        ),
      };
    case "restore_item":
      return {
        ...state,
        items: state.items.map((item) =>
          item.index === action.index
            ? {
                ...item,
                status: item.confidence === "high" ? "auto_matched" : "needs_review",
              }
            : item,
        ),
      };
    case "set_list_matches":
      return {
        ...state,
        listMatches: action.matches,
        items: state.items.map((item) => {
          const match = action.matches.find((m) => m.receiptItemIndex === item.index);
          if (match) {
            return {
              ...item,
              matchedListItemId: match.listItemId,
              matchedListItemName: match.listItemName,
            };
          }
          return item;
        }),
      };
    case "link_product":
      return {
        ...state,
        items: state.items.map((item) =>
          item.index === action.index
            ? {
                ...item,
                matchedProductId: action.productId,
                matchedProductName: action.productName,
                status: "confirmed",
                isEdited: true,
              }
            : item,
        ),
      };
    case "unlink_product":
      return {
        ...state,
        items: state.items.map((item) =>
          item.index === action.index
            ? {
                ...item,
                matchedProductId: null,
                matchedProductName: null,
                status: item.confidence === "high" ? "auto_matched" : "needs_review",
              }
            : item,
        ),
      };
    default:
      return state;
  }
}

// ── Status config ────────────────────────────────────────

export const statusConfig = {
  high: { dot: "bg-green-500", ring: "ring-green-500/20", label: "OK" },
  medium: { dot: "bg-yellow-500", ring: "ring-yellow-500/20", label: "À vérifier" },
  low: { dot: "bg-red-500", ring: "ring-red-500/20", label: "Inconnu" },
} as const;

// ── Convert streamed items → ReviewItems ─────────────────

export function toReviewItems(
  streamedItems: NonNullable<NonNullable<StreamedObject>["items"]>,
): ReviewItem[] {
  return streamedItems
    .filter(
      (
        item,
      ): item is NonNullable<typeof item> & {
        rawName: string;
        humanName: string;
        confidence: "high" | "medium" | "low";
        category: string;
        quantity: number;
        unit: string;
      } =>
        !!item?.humanName &&
        !!item?.category &&
        item?.quantity != null &&
        !!item?.unit,
    )
    .map((item, index) => ({
      index,
      rawName: item.rawName ?? item.humanName,
      humanName: item.humanName,
      confidence: item.confidence ?? "medium",
      category: item.category,
      quantity: item.quantity,
      unit: item.unit,
      unitPrice: item.unitPrice ?? null,
      totalPrice: item.totalPrice ?? null,
      status:
        (item.confidence ?? "medium") === "high"
          ? ("auto_matched" as const)
          : ("needs_review" as const),
      matchedProductId: null,
      matchedProductName: null,
      isEdited: false,
      matchedListItemId: null,
      matchedListItemName: null,
    }));
}
