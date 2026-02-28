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

export const STOCK_STATUS_VALUES = ["in_stock", "low", "out"] as const;
export type StockStatus = (typeof STOCK_STATUS_VALUES)[number];

export const STOCK_STATUSES = [
  { value: "in_stock", label: "En stock", color: "green" },
  { value: "low", label: "Peu", color: "yellow" },
  { value: "out", label: "Épuisé", color: "red" },
] as const;

export const NEXT_STATUS: Record<StockStatus, StockStatus> = {
  in_stock: "low",
  low: "out",
  out: "in_stock",
};

export const PURCHASE_SOURCE_VALUES = [
  "receipt",
  "list_check",
  "barcode",
  "manual",
] as const;
export type PurchaseSource = (typeof PURCHASE_SOURCE_VALUES)[number];

export const TAG_SOURCE_VALUES = ["system", "ai", "user"] as const;
export type TagSource = (typeof TAG_SOURCE_VALUES)[number];

// ── Pre-built lookup maps ────────────────────────────────

export const CATEGORY_MAP = new Map<string, string>(
  CATEGORIES.map((c) => [c.value, c.label]),
);

export const LOCATION_MAP = new Map<string, string>(
  LOCATIONS.map((l) => [l.value, l.label]),
);

export const STATUS_MAP = new Map<string, string>(
  STOCK_STATUSES.map((s) => [s.value, s.label]),
);

export const NUTRISCORE_COLORS: Record<string, string> = {
  a: "bg-green-600",
  b: "bg-lime-500",
  c: "bg-yellow-400",
  d: "bg-orange-500",
  e: "bg-red-600",
};

/** Default tags per category, used for deterministic auto-tagging */
export const CATEGORY_TAGS: Record<Category, string[]> = {
  "fruits-vegetables": ["légume", "fruit", "frais", "végétal"],
  "meat-fish": ["viande", "poisson", "protéine", "animal"],
  dairy: ["laitier", "fromage", "yaourt", "crème"],
  bakery: ["pain", "boulangerie", "viennoiserie", "pâtisserie"],
  grocery: ["épicerie", "sec", "conserve", "pâtes", "riz", "céréales"],
  beverages: ["boisson", "eau", "jus", "soda", "alcool"],
  frozen: ["surgelé", "congelé", "glacé"],
  household: ["hygiène", "entretien", "ménage", "nettoyant"],
  other: [],
};

/** Keyword-to-tag mappings for deterministic name-based tagging */
export const NAME_TAG_RULES: [RegExp, string[]][] = [
  [/\b(tagliatelle|spaghetti|penne|fusilli|macaroni|farfalle|linguine|coquillette|rigatoni)\b/i, ["pâtes", "féculent"]],
  [/\b(riz|risotto)\b/i, ["riz", "féculent"]],
  [/\b(pomme de terre|patate|purée)\b/i, ["pomme de terre", "féculent"]],
  [/\b(coca|pepsi|fanta|orangina|schweppes|sprite|7up)\b/i, ["soda", "boisson gazeuse"]],
  [/\b(bière|beer|ale|ipa|lager)\b/i, ["bière", "alcool"]],
  [/\b(vin|wine|bordeaux|bourgogne|côtes)\b/i, ["vin", "alcool"]],
  [/\b(lait)\b/i, ["lait", "laitier"]],
  [/\b(beurre)\b/i, ["beurre", "laitier", "matière grasse"]],
  [/\b(crème)\b/i, ["crème", "laitier"]],
  [/\b(fromage|camembert|gruyère|comté|emmental|mozzarella|parmesan|chèvre|roquefort|brie)\b/i, ["fromage", "laitier"]],
  [/\b(yaourt|yogourt|danone|activia)\b/i, ["yaourt", "laitier"]],
  [/\b(poulet|dinde|canard|volaille)\b/i, ["volaille", "viande", "protéine"]],
  [/\b(boeuf|steak|haché|entrecôte|bifteck)\b/i, ["boeuf", "viande", "protéine"]],
  [/\b(porc|jambon|lardons|saucisse|bacon|chorizo)\b/i, ["porc", "viande", "protéine"]],
  [/\b(saumon|thon|cabillaud|crevette|moule|sardine|truite)\b/i, ["poisson", "fruits de mer", "protéine"]],
  [/\b(oeuf|œuf)\b/i, ["oeuf", "protéine"]],
  [/\b(tomate)\b/i, ["tomate", "légume"]],
  [/\b(salade|laitue|roquette|mâche)\b/i, ["salade", "légume", "frais"]],
  [/\b(pain|baguette|brioche|croissant)\b/i, ["pain", "boulangerie"]],
  [/\b(pizza)\b/i, ["pizza", "plat préparé"]],
  [/\b(café|nespresso|expresso)\b/i, ["café", "boisson chaude"]],
  [/\b(thé|infusion)\b/i, ["thé", "boisson chaude"]],
  [/\b(chocolat)\b/i, ["chocolat", "sucré"]],
  [/\b(chips|apéritif)\b/i, ["chips", "apéritif", "snack"]],
  [/\b(eau|evian|vittel|volvic|cristaline)\b/i, ["eau", "boisson"]],
  [/\b(jus|nectar|tropicana)\b/i, ["jus", "boisson"]],
  [/\b(huile|olive)\b/i, ["huile", "condiment", "matière grasse"]],
  [/\b(sel|poivre|épice|paprika|cumin|curry)\b/i, ["épice", "condiment"]],
  [/\b(sucre)\b/i, ["sucre", "ingrédient de base"]],
  [/\b(farine)\b/i, ["farine", "ingrédient de base"]],
  [/\b(conserve|boîte)\b/i, ["conserve"]],
  [/\b(surgelé|congelé)\b/i, ["surgelé"]],
  [/\b(bio|biologique)\b/i, ["bio"]],
  [/\b(dentifrice|brosse à dents|shampoing|savon|gel douche|déodorant)\b/i, ["hygiène"]],
  [/\b(lessive|javel|éponge|liquide vaisselle)\b/i, ["entretien", "ménage"]],
];
