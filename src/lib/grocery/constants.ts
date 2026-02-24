export const CATEGORIES = [
  { value: "fruits-vegetables", label: "Fruits & Légumes" },
  { value: "meat-fish", label: "Viandes & Poissons" },
  { value: "dairy", label: "Produits laitiers" },
  { value: "bakery", label: "Boulangerie" },
  { value: "grocery", label: "Épicerie" },
  { value: "beverages", label: "Boissons" },
  { value: "frozen", label: "Surgelés" },
  { value: "household", label: "Hygiène & Entretien" },
  { value: "other", label: "Autre" },
] as const;

export const CATEGORY_VALUES = CATEGORIES.map((c) => c.value);
export type Category = (typeof CATEGORIES)[number]["value"];

export const PURCHASE_UNITS = [
  { value: "piece", label: "pièce(s)" },
  { value: "bottle", label: "bouteille(s)" },
  { value: "pack", label: "pack(s)" },
  { value: "bag", label: "sachet(s)" },
  { value: "box", label: "boîte(s)" },
  { value: "jar", label: "pot(s)" },
  { value: "tray", label: "barquette(s)" },
  { value: "kg", label: "kg" },
  { value: "g", label: "g" },
  { value: "L", label: "L" },
  { value: "mL", label: "mL" },
] as const;

export type PurchaseUnit = (typeof PURCHASE_UNITS)[number]["value"];

export const CONTENT_UNITS = [
  { value: "g", label: "g" },
  { value: "mL", label: "mL" },
  { value: "pcs", label: "pièce(s)" },
] as const;

export type ContentUnit = (typeof CONTENT_UNITS)[number]["value"];

export const LOCATIONS = [
  { value: "fridge", label: "Réfrigérateur" },
  { value: "freezer", label: "Congélateur" },
  { value: "pantry", label: "Placard" },
  { value: "cellar", label: "Cave" },
  { value: "other", label: "Autre" },
] as const;

export type Location = (typeof LOCATIONS)[number]["value"];

export const STOCK_STATUSES = [
  { value: "in_stock", label: "En stock", color: "green" },
  { value: "low", label: "Peu", color: "yellow" },
  { value: "out", label: "Épuisé", color: "red" },
] as const;

export type StockStatus = (typeof STOCK_STATUSES)[number]["value"];

export const NEXT_STATUS: Record<StockStatus, StockStatus> = {
  in_stock: "low",
  low: "out",
  out: "in_stock",
};

export const NUTRISCORE_COLORS: Record<string, string> = {
  a: "bg-green-600",
  b: "bg-lime-500",
  c: "bg-yellow-400",
  d: "bg-orange-500",
  e: "bg-red-600",
};
