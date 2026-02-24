import { z } from "zod";
import { CATEGORIES, PURCHASE_UNITS } from "./constants";

// ── Step 1 schema: raw OCR extraction ──────────────────────

export const rawLineSchema = z.object({
  text: z.string().describe("La ligne exacte telle qu'elle apparaît sur le ticket"),
  price: z.number().nullable().describe("Prix en euros de cette ligne (le montant à droite)"),
  isProduct: z.boolean().describe("true si c'est un article acheté, false si c'est une remise, un sous-total, un mode de paiement, la TVA, un total, un message promotionnel, ou tout ce qui n'est pas un produit"),
});

export const rawReceiptSchema = z.object({
  storeName: z.string().nullable().describe("Nom de l'enseigne (Carrefour, Leclerc, Lidl, Auchan, Intermarché, U, etc.)"),
  date: z.string().nullable().describe("Date du ticket au format YYYY-MM-DD"),
  rawLines: z.array(rawLineSchema).describe("Toutes les lignes du ticket, dans l'ordre"),
});

// ── Step 2 schema: refined products ────────────────────────

const CATEGORY_VALUES = CATEGORIES.map((c) => c.value);
const UNIT_VALUES = PURCHASE_UNITS.map((u) => u.value);

export const refinedItemSchema = z.object({
  humanName: z.string().describe("Nom complet et lisible du produit, comme on le dirait à l'oral. Ex: 'Tagliatelles 500g', 'Coca-Cola 1.25L', 'Jambon supérieur Herta 4 tranches'"),
  category: z.enum(CATEGORY_VALUES as [string, ...string[]]).describe("Catégorie du produit"),
  quantity: z.number().describe("Nombre d'unités achetées (souvent 1, sauf si explicitement indiqué)"),
  unit: z.enum(UNIT_VALUES as [string, ...string[]]).describe("Unité d'achat"),
  unitPrice: z.number().nullable().describe("Prix unitaire en euros, null si identique au prix total"),
  totalPrice: z.number().nullable().describe("Prix total payé pour cette ligne"),
});

// ── Streaming schema (used by API route + useObject) ───────

export const streamingReceiptSchema = z.object({
  storeName: z.string().nullable().describe("Nom de l'enseigne"),
  date: z.string().nullable().describe("Date du ticket au format YYYY-MM-DD"),
  items: z.array(refinedItemSchema).describe("Produits extraits du ticket"),
});
