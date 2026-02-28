import "server-only";

import { and, desc, eq } from "drizzle-orm";
import { db, type DbExecutor } from "@/lib/db";
import { inventoryItem, purchaseHistory } from "@/lib/db/schema";

/**
 * Shared utility: compute average frequency from a list of dates.
 * Deduplicates same-day entries and returns avg days + predicted next date.
 */
export function computeFrequencyFromDates(dates: Date[]) {
  if (dates.length < 2) return null;

  // Deduplicate same-day entries
  const unique = dates.filter(
    (d, i) => i === 0 || d.toDateString() !== dates[i - 1].toDateString(),
  );
  if (unique.length < 2) return null;

  let totalMs = 0;
  for (let i = 0; i < unique.length - 1; i++) {
    totalMs += unique[i].getTime() - unique[i + 1].getTime();
  }

  const avgMs = totalMs / (unique.length - 1);
  const avgDays = Math.round(avgMs / (1000 * 60 * 60 * 24));
  const predictedNext = new Date(unique[0].getTime() + avgMs);
  const isOverdue = predictedNext.getTime() < Date.now();

  return { avgDays, predictedNext, isOverdue };
}

export async function getPurchaseFrequency(productId: string, userId?: string) {
  const conditions = [eq(purchaseHistory.productId, productId)];
  if (userId) conditions.push(eq(purchaseHistory.recordedBy, userId));

  const purchases = await db
    .select({ purchasedAt: purchaseHistory.purchasedAt })
    .from(purchaseHistory)
    .where(and(...conditions))
    .orderBy(desc(purchaseHistory.purchasedAt));

  if (purchases.length === 0) {
    return {
      avgDays: null,
      purchaseCount: 0,
      lastPurchase: null,
      predictedNext: null,
      isOverdue: false,
    };
  }

  const dates = purchases.map((p) => new Date(p.purchasedAt));
  const freq = computeFrequencyFromDates(dates);

  return {
    avgDays: freq?.avgDays ?? null,
    purchaseCount: purchases.length,
    lastPurchase: purchases[0].purchasedAt,
    predictedNext: freq?.predictedNext ?? null,
    isOverdue: freq?.isOverdue ?? false,
  };
}

export async function getProductsNeedingRestock(userId: string) {
  const rows = await db
    .select({
      productId: purchaseHistory.productId,
      purchasedAt: purchaseHistory.purchasedAt,
    })
    .from(purchaseHistory)
    .innerJoin(
      inventoryItem,
      eq(inventoryItem.productId, purchaseHistory.productId),
    )
    .where(
      and(
        eq(inventoryItem.status, "in_stock"),
        eq(inventoryItem.addedBy, userId),
      ),
    )
    .orderBy(purchaseHistory.productId, desc(purchaseHistory.purchasedAt));

  const grouped = new Map<string, Date[]>();
  for (const row of rows) {
    let dates = grouped.get(row.productId);
    if (!dates) {
      dates = [];
      grouped.set(row.productId, dates);
    }
    dates.push(new Date(row.purchasedAt));
  }

  const restockIds: string[] = [];
  for (const [productId, dates] of grouped) {
    const freq = computeFrequencyFromDates(dates);
    if (freq?.isOverdue) {
      restockIds.push(productId);
    }
  }

  return restockIds;
}

export async function getProductPurchaseHistory(productId: string, userId?: string) {
  const conditions = [eq(purchaseHistory.productId, productId)];
  if (userId) conditions.push(eq(purchaseHistory.recordedBy, userId));

  return db
    .select({
      id: purchaseHistory.id,
      purchasedAt: purchaseHistory.purchasedAt,
      price: purchaseHistory.price,
      storeName: purchaseHistory.storeName,
      quantity: purchaseHistory.quantity,
      source: purchaseHistory.source,
    })
    .from(purchaseHistory)
    .where(and(...conditions))
    .orderBy(desc(purchaseHistory.purchasedAt))
    .limit(20);
}

export async function recordPurchase({
  productId,
  price,
  storeName,
  quantity = 1,
  source,
  userId,
  executor = db,
}: {
  productId: string;
  price?: number | null;
  storeName?: string | null;
  quantity?: number;
  source: "receipt" | "list_check" | "barcode" | "manual";
  userId: string;
  executor?: DbExecutor;
}) {
  await executor.insert(purchaseHistory).values({
    id: crypto.randomUUID(),
    productId,
    price: price != null ? String(price) : null,
    storeName: storeName ?? null,
    quantity,
    source,
    recordedBy: userId,
  });
}
