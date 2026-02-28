import "server-only";

import { and, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { product, receiptCodeMapping } from "@/lib/db/schema";

export async function findMappingsByRawCodes(
  rawCodes: string[],
  storeName: string | null,
) {
  if (rawCodes.length === 0) return new Map<string, { productId: string; productName: string }>();

  const rows = await db
    .select({
      rawCode: receiptCodeMapping.rawCode,
      productId: receiptCodeMapping.productId,
      productName: product.name,
    })
    .from(receiptCodeMapping)
    .innerJoin(product, eq(product.id, receiptCodeMapping.productId))
    .where(
      and(
        inArray(receiptCodeMapping.rawCode, rawCodes),
        storeName
          ? or(
              eq(receiptCodeMapping.storeName, storeName),
              isNull(receiptCodeMapping.storeName),
            )
          : isNull(receiptCodeMapping.storeName),
      ),
    );

  // Prefer store-specific mappings over global ones
  const result = new Map<string, { productId: string; productName: string }>();
  for (const row of rows) {
    const existing = result.get(row.rawCode);
    if (!existing) {
      result.set(row.rawCode, {
        productId: row.productId,
        productName: row.productName,
      });
    }
  }
  return result;
}

export async function upsertCodeMapping(
  rawCode: string,
  storeName: string | null,
  productId: string,
  userId: string,
) {
  const id = crypto.randomUUID();
  await db
    .insert(receiptCodeMapping)
    .values({ id, rawCode, storeName, productId, createdBy: userId })
    .onConflictDoUpdate({
      target: [receiptCodeMapping.rawCode, receiptCodeMapping.storeName],
      set: { productId: sql`excluded.product_id` },
    });
}

export async function bulkUpsertCodeMappings(
  mappings: { rawCode: string; storeName: string | null; productId: string }[],
  userId: string,
) {
  if (mappings.length === 0) return;

  const values = mappings.map((m) => ({
    id: crypto.randomUUID(),
    rawCode: m.rawCode,
    storeName: m.storeName,
    productId: m.productId,
    createdBy: userId,
  }));

  await db
    .insert(receiptCodeMapping)
    .values(values)
    .onConflictDoUpdate({
      target: [receiptCodeMapping.rawCode, receiptCodeMapping.storeName],
      set: { productId: sql`excluded.product_id` },
    });
}
