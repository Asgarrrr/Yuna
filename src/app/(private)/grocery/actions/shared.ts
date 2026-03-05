import { updateTag } from "next/cache";
import { z } from "zod";
import { CATEGORIES, LOCATIONS, PURCHASE_UNITS } from "@/lib/grocery/constants";

// ── Validation schemas ───────────────────────────────────

export const uuidSchema = z.string().uuid();
export const barcodeSchema = z.string().trim().min(3).max(128);
export const tagSchema = z
  .string()
  .trim()
  .min(1)
  .max(50)
  .regex(/^[\p{L}\p{N}\s\-']+$/u, "Tag contient des caractères non autorisés");
export const stockStatusSchema = z.enum(["in_stock", "low", "out"]);
export const locationSchema = z.enum(
  LOCATIONS.map((location) => location.value) as [string, ...string[]],
);
export const listItemIdSchema = uuidSchema;
export const quantitySchema = z.number().int().min(1).max(999);

export const barcodePayloadSchema = z.object({
  barcode: barcodeSchema,
  productName: z.string().trim().max(200).nullable(),
  brand: z.string().trim().max(120).nullable(),
  genericName: z.string().trim().max(200).nullable(),
  nutriscoreGrade: z.string().trim().max(4).nullable(),
  imageSmallUrl: z.string().url().max(1000).nullish().transform((v) => v || null),
  existingProductId: uuidSchema.nullable(),
  target: z.enum(["stock", "list"]),
});

export const commitReceiptItemSchema = z.object({
  rawName: z.string().trim().min(1).max(500),
  humanName: z.string().trim().min(1).max(200),
  category: z.enum(
    CATEGORIES.map((category) => category.value) as [string, ...string[]],
  ),
  quantity: z.number().positive().max(999),
  unit: z.enum(
    PURCHASE_UNITS.map((unit) => unit.value) as [string, ...string[]],
  ),
  unitPrice: z.number().nonnegative().max(10000).nullable(),
  totalPrice: z.number().nonnegative().max(10000).nullable(),
  matchedProductId: uuidSchema.nullable().optional(),
  isCodeMapping: z.boolean().optional(),
});

export const commitReceiptPayloadSchema = z.object({
  items: z.array(commitReceiptItemSchema).min(1).max(500),
  storeName: z.string().trim().max(120).nullable(),
  matchedListItemIds: z.array(uuidSchema).optional(),
});

// ── Cache revalidation ───────────────────────────────────

export function revalidateGrocery(...tags: string[]) {
  for (const tag of tags) updateTag(tag);
}
