export type ListItem = {
  id: string;
  customName: string | null;
  quantity: number;
  unit: string;
  checked: boolean;
  productName: string | null;
  productIcon: string | null;
};

export type Suggestion = {
  id: string;
  name: string;
  icon: string | null;
  category: string;
};

/** Matches the partial shape returned by useObject during streaming */
export type StreamedObject =
  | {
      storeName?: string | null;
      date?: string | null;
      items?: Array<
        | {
            rawName?: string;
            humanName?: string;
            confidence?: "high" | "medium" | "low";
            category?: string;
            quantity?: number;
            unit?: string;
            unitPrice?: number | null;
            totalPrice?: number | null;
          }
        | undefined
      >;
    }
  | undefined;

export type ProductSearchResult = {
  id: string;
  name: string;
  category: string;
  unit: string;
};
