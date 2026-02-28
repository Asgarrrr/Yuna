export type ReviewItemStatus =
  | "auto_matched"
  | "needs_review"
  | "confirmed"
  | "removed";

export type ReviewItem = {
  index: number;
  rawName: string;
  humanName: string;
  confidence: "high" | "medium" | "low";
  category: string;
  quantity: number;
  unit: string;
  unitPrice: number | null;
  totalPrice: number | null;
  status: ReviewItemStatus;
  matchedProductId: string | null;
  matchedProductName: string | null;
  isEdited: boolean;
  matchedListItemId: string | null;
  matchedListItemName: string | null;
};

export type ListMatch = {
  listItemId: string;
  listItemName: string;
  receiptItemIndex: number;
};
