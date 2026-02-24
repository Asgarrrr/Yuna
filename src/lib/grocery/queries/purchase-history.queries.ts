import "server-only";

import { and, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { inventoryItem, purchaseHistory } from "@/lib/db/schema";

export async function getPurchaseFrequency(productId: string) {
  const purchases = await db
    .select({ purchasedAt: purchaseHistory.purchasedAt })
    .from(purchaseHistory)
    .where(eq(purchaseHistory.productId, productId))
    .orderBy(desc(purchaseHistory.purchasedAt));

  if (purchases.length < 2) {
    return {
      avgDays: null,
      purchaseCount: purchases.length,
      lastPurchase: purchases[0]?.purchasedAt ?? null,
      predictedNext: null,
      isOverdue: false,
    };
  }

  let totalDays = 0;
  for (let i = 0; i < purchases.length - 1; i++) {
    const diff =
      new Date(purchases[i].purchasedAt).getTime() -
      new Date(purchases[i + 1].purchasedAt).getTime();
    totalDays += diff / (1000 * 60 * 60 * 24);
  }
  const avgDays = Math.round(totalDays / (purchases.length - 1));

  const lastPurchase = purchases[0].purchasedAt;
  const predictedNext = new Date(
    new Date(lastPurchase).getTime() + avgDays * 24 * 60 * 60 * 1000,
  );
  const isOverdue = predictedNext.getTime() < Date.now();

  return {
    avgDays,
    purchaseCount: purchases.length,
    lastPurchase,
    predictedNext,
    isOverdue,
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

  const now = Date.now();
  const restockIds: string[] = [];

  for (const [productId, dates] of grouped) {
    if (dates.length < 2) continue;

    let totalMs = 0;
    for (let i = 0; i < dates.length - 1; i++) {
      totalMs += dates[i].getTime() - dates[i + 1].getTime();
    }
    const avgMs = totalMs / (dates.length - 1);
    const predictedNext = dates[0].getTime() + avgMs;

    if (predictedNext < now) {
      restockIds.push(productId);
    }
  }

  return restockIds;
}

export async function getProductPurchaseHistory(productId: string) {
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
    .where(eq(purchaseHistory.productId, productId))
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
}: {
  productId: string;
  price?: number | null;
  storeName?: string | null;
  quantity?: number;
  source: "receipt" | "list_check" | "barcode" | "manual";
  userId: string;
}) {
  await db.insert(purchaseHistory).values({
    id: crypto.randomUUID(),
    productId,
    price: price != null ? String(price) : null,
    storeName: storeName ?? null,
    quantity,
    source,
    recordedBy: userId,
  });
}
