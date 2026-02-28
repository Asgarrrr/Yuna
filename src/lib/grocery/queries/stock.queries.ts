import "server-only";

import { and, eq, ilike, sql } from "drizzle-orm";
import { db, type DbExecutor } from "@/lib/db";
import {
  inventoryItem,
  product,
  productTag,
} from "@/lib/db/schema";
import type { StockStatus } from "../constants";
import { escapeLike } from "./shared";

export type StockItem = Awaited<ReturnType<typeof getStock>>[number];

export async function getStock(userId: string) {
  return db
    .select({
      id: inventoryItem.id,
      productId: inventoryItem.productId,
      status: inventoryItem.status,
      location: inventoryItem.location,
      quantity: inventoryItem.quantity,
      expiresAt: inventoryItem.expiresAt,
      depletedAt: inventoryItem.depletedAt,
      lastPurchasedAt: inventoryItem.lastPurchasedAt,
      productName: product.name,
      productIcon: product.icon,
      productCategory: product.category,
      productBrand: product.brand,
      productGenericName: product.genericName,
      productNutriscore: product.nutriscoreGrade,
      productImageSmallUrl: product.imageSmallUrl,
      productLastPrice: product.lastPrice,
      productUnit: product.unit,
      productContentAmount: product.contentAmount,
      productContentUnit: product.contentUnit,
    })
    .from(inventoryItem)
    .innerJoin(product, eq(inventoryItem.productId, product.id))
    .where(eq(inventoryItem.addedBy, userId))
    .orderBy(inventoryItem.location, product.name);
}

/**
 * Shared inventory upsert utility — single INSERT...ON CONFLICT.
 * Used by toggleItem, addBarcodeToStock, bulkUpsertFromReceipt, upsertStockItem.
 */
export async function upsertInventory(
  tx: DbExecutor,
  productId: string,
  status: StockStatus,
  userId: string,
  quantity?: number | null,
) {
  const now = new Date();

  await tx
    .insert(inventoryItem)
    .values({
      id: crypto.randomUUID(),
      productId,
      status,
      quantity: quantity ?? null,
      lastPurchasedAt: status === "in_stock" ? now : null,
      depletedAt: status === "out" ? now : null,
      addedBy: userId,
    })
    .onConflictDoUpdate({
      target: [inventoryItem.productId, inventoryItem.addedBy],
      set: {
        status,
        quantity: quantity !== undefined ? quantity : sql`excluded.quantity`,
        lastPurchasedAt:
          status === "in_stock" ? now : sql`inventory_item.last_purchased_at`,
        depletedAt: status === "out" ? now : null,
      },
    });

  if (status === "in_stock") {
    await tx
      .update(product)
      .set({ lastPurchasedAt: now })
      .where(eq(product.id, productId));
  }
}

/**
 * Legacy wrapper that uses the shared utility.
 */
export async function upsertStockItem(
  productId: string,
  status: StockStatus,
  userId: string,
) {
  await upsertInventory(db, productId, status, userId);
}

export async function updateStockStatus(
  productId: string,
  status: StockStatus,
  userId: string,
) {
  const now = new Date();
  await db
    .update(inventoryItem)
    .set({
      status,
      quantity: null, // reset quantity on manual cycle
      depletedAt: status === "out" ? now : null,
      lastPurchasedAt: status === "in_stock" ? now : undefined,
    })
    .where(
      and(
        eq(inventoryItem.productId, productId),
        eq(inventoryItem.addedBy, userId),
      ),
    );
}

/**
 * Search stock by product names OR tags (for AI recipe check).
 */
export async function getStockByNamesOrTags(names: string[]) {
  if (names.length === 0) return [];

  // Search by name
  const nameConditions = names.map((n) =>
    ilike(product.name, `%${escapeLike(n)}%`),
  );

  // Search by tag
  const tagConditions = names.map((n) =>
    ilike(productTag.tag, `%${escapeLike(n.toLowerCase())}%`),
  );

  const byName = db
    .select({
      productId: product.id,
      productName: product.name,
      status: inventoryItem.status,
    })
    .from(product)
    .leftJoin(inventoryItem, eq(inventoryItem.productId, product.id))
    .where(
      nameConditions.length === 1
        ? nameConditions[0]
        : sql`(${sql.join(nameConditions, sql` OR `)})`,
    )
    .limit(50);

  const byTag = db
    .selectDistinct({
      productId: product.id,
      productName: product.name,
      status: inventoryItem.status,
    })
    .from(productTag)
    .innerJoin(product, eq(productTag.productId, product.id))
    .leftJoin(inventoryItem, eq(inventoryItem.productId, product.id))
    .where(
      tagConditions.length === 1
        ? tagConditions[0]
        : sql`(${sql.join(tagConditions, sql` OR `)})`,
    )
    .limit(50);

  const [nameResults, tagResults] = await Promise.all([byName, byTag]);

  // Deduplicate
  const seen = new Set<string>();
  const results: typeof nameResults = [];
  for (const r of nameResults) {
    if (!seen.has(r.productId)) {
      seen.add(r.productId);
      results.push(r);
    }
  }
  for (const r of tagResults) {
    if (!seen.has(r.productId)) {
      seen.add(r.productId);
      results.push(r);
    }
  }

  return results;
}

export async function getStockSummary(userId: string) {
  return db
    .select({
      productId: product.id,
      productName: product.name,
      status: inventoryItem.status,
      category: product.category,
    })
    .from(inventoryItem)
    .innerJoin(product, eq(inventoryItem.productId, product.id))
    .where(eq(inventoryItem.addedBy, userId))
    .orderBy(product.category, product.name);
}

