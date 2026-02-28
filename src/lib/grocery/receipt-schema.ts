import { z } from "zod";
import { CATEGORIES, PURCHASE_UNITS } from "./constants";

const CATEGORY_VALUES = CATEGORIES.map((c) => c.value);
const UNIT_VALUES = PURCHASE_UNITS.map((u) => u.value);

const refinedItemSchema = z.object({
  rawName: z
    .string()
    .describe(
      "Nom brut tel qu'affiché sur le ticket, ex: 'PET 1.25L COCA CO'",
    ),
  humanName: z
    .string()
    .describe("Nom naturel du produit, ex: 'Coca-Cola 1.25L'"),
  confidence: z
    .enum(["high", "medium", "low"])
    .describe(
      "Confiance dans le décodage: high=évident, medium=raisonnable, low=cryptique/inconnu",
    ),
  category: z.enum(CATEGORY_VALUES as [string, ...string[]]),
  quantity: z.number(),
  unit: z.enum(UNIT_VALUES as [string, ...string[]]),
  unitPrice: z.number().nullable(),
  totalPrice: z.number().nullable(),
});

export const streamingReceiptSchema = z.object({
  storeName: z.string().nullable(),
  date: z.string().nullable().describe("YYYY-MM-DD"),
  items: z.array(refinedItemSchema),
});
