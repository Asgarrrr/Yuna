import "server-only";

import { desc, eq, ilike, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { inventoryItem, product } from "@/lib/db/schema";
import { escapeLike } from "./shared";

export async function searchProductsCatalog(query: string) {
  if (!query || query.length < 2) return [];

  return db
    .select({
      id: product.id,
      name: product.name,
      category: product.category,
      unit: product.unit,
      icon: product.icon,
      imageUrl: product.imageUrl,
    })
    .from(product)
    .where(ilike(product.name, `%${escapeLike(query)}%`))
    .orderBy(desc(product.usageCount))
    .limit(8);
}

export async function incrementProductUsage(productId: string) {
  await db
    .update(product)
    .set({ usageCount: sql`${product.usageCount} + 1` })
    .where(eq(product.id, productId));
}

export async function findProductByName(name: string) {
  if (!name) return null;

  const [result] = await db
    .select({ id: product.id, name: product.name })
    .from(product)
    .where(ilike(product.name, name.trim()))
    .limit(1);

  return result ?? null;
}

export type BulkUpsertResult = {
  /** All product mappings (index matches input items) */
  productIds: string[];
  /** Only newly created products (for OFF enrichment) */
  newProducts: { productId: string; productName: string }[];
};

export async function bulkUpsertFromReceipt(
  items: {
    rawName: string;
    humanName: string;
    category: string;
    quantity: number;
    unit: string;
    unitPrice: number | null;
    totalPrice: number | null;
  }[],
  userId: string,
): Promise<BulkUpsertResult> {
  return db.transaction(async (tx) => {
    const now = new Date();
    const newProducts: { productId: string; productName: string }[] = [];
    const productIds: string[] = [];
    const nameLookupCache = new Map<
      string,
      { id: string; name: string } | null
    >();
    const inventoryLookupCache = new Map<string, string | null>();

    async function findProductByNameInTx(name: string) {
      if (!name) return null;
      const key = name.trim().toLocaleLowerCase("fr-FR");
      if (nameLookupCache.has(key)) {
        return nameLookupCache.get(key) ?? null;
      }

      const [result] = await tx
        .select({ id: product.id, name: product.name })
        .from(product)
        .where(ilike(product.name, name.trim()))
        .limit(1);
      const resolved = result ?? null;
      nameLookupCache.set(key, resolved);
      return resolved;
    }

    for (const item of items) {
      let existing = await findProductByNameInTx(item.humanName);

      if (!existing) {
        existing = await findProductByNameInTx(item.rawName);
      }

      let productId: string;

      if (existing) {
        productId = existing.id;
      } else {
        productId = crypto.randomUUID();
        await tx.insert(product).values({
          id: productId,
          name: item.humanName,
          category: item.category,
          unit: item.unit,
          createdBy: userId,
        });
        newProducts.push({
          productId,
          productName: item.humanName,
        });

        const normalizedHumanName = item.humanName
          .trim()
          .toLocaleLowerCase("fr-FR");
        if (normalizedHumanName) {
          nameLookupCache.set(normalizedHumanName, {
            id: productId,
            name: item.humanName,
          });
        }
        const normalizedRawName = item.rawName
          .trim()
          .toLocaleLowerCase("fr-FR");
        if (normalizedRawName) {
          nameLookupCache.set(normalizedRawName, {
            id: productId,
            name: item.humanName,
          });
        }
      }

      productIds.push(productId);

      const price = item.unitPrice ?? item.totalPrice;
      if (price != null) {
        await tx
          .update(product)
          .set({ lastPrice: String(price) })
          .where(eq(product.id, productId));
      }

      let existingInventoryId: string | null | undefined =
        inventoryLookupCache.get(productId);
      if (existingInventoryId === undefined) {
        const [existingInventory] = await tx
          .select({ id: inventoryItem.id })
          .from(inventoryItem)
          .where(eq(inventoryItem.productId, productId))
          .limit(1);
        existingInventoryId = existingInventory?.id ?? null;
        inventoryLookupCache.set(productId, existingInventoryId);
      }

      if (existingInventoryId) {
        await tx
          .update(inventoryItem)
          .set({ status: "in_stock", lastPurchasedAt: now, depletedAt: null })
          .where(eq(inventoryItem.id, existingInventoryId));
      } else {
        const inventoryId = crypto.randomUUID();
        await tx.insert(inventoryItem).values({
          id: inventoryId,
          productId,
          status: "in_stock",
          lastPurchasedAt: now,
          depletedAt: null,
          addedBy: userId,
        });
        inventoryLookupCache.set(productId, inventoryId);
      }

      await tx
        .update(product)
        .set({
          usageCount: sql`${product.usageCount} + 1`,
          lastPurchasedAt: now,
        })
        .where(eq(product.id, productId));
    }

    return { productIds, newProducts };
  });
}

export async function updateProductOFF(
  productId: string,
  data: {
    brand: string | null;
    genericName: string | null;
    nutriscoreGrade: string | null;
    offId: string | null;
    imageSmallUrl: string | null;
  },
) {
  await db
    .update(product)
    .set({
      brand: data.brand,
      genericName: data.genericName,
      nutriscoreGrade: data.nutriscoreGrade,
      offId: data.offId,
      imageSmallUrl: data.imageSmallUrl,
    })
    .where(eq(product.id, productId));
}
