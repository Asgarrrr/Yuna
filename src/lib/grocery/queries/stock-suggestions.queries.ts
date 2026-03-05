import "server-only";

import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  inventoryItem,
  product,
  purchaseHistory,
  shoppingListItem,
} from "@/lib/db/schema";
import { getOrCreateActiveList } from "./list.queries";

/**
 * Weighted suggestions algorithm.
 * Score = (usageCount × 0.2) + (recencyScore × 0.3) + (frequencyScore × 0.5)
 *
 * Includes both "out" and "low" status products (low products get a 0.6 multiplier).
 * recencyScore: products depleted more recently score higher (0..100)
 * frequencyScore: products overdue for repurchase score higher (0..100)
 */
export async function getSuggestions() {
  const list = await getOrCreateActiveList();

  // Get all "out" and "low" products with purchase history for scoring
  const candidates = await db
    .select({
      id: product.id,
      name: product.name,
      icon: product.icon,
      category: product.category,
      usageCount: product.usageCount,
      depletedAt: inventoryItem.depletedAt,
      status: inventoryItem.status,
    })
    .from(inventoryItem)
    .innerJoin(product, eq(inventoryItem.productId, product.id))
    .where(
      and(
        sql`${inventoryItem.status} IN ('out', 'low')`,
        sql`NOT EXISTS (
          SELECT 1 FROM ${shoppingListItem}
          WHERE ${shoppingListItem.productId} = ${product.id}
          AND ${shoppingListItem.listId} = ${list.id}
        )`,
      ),
    );

  if (candidates.length === 0) return [];

  // Get purchase history for frequency scoring
  const productIds = candidates.map((c) => c.id);
  const purchaseRows = await db
    .select({
      productId: purchaseHistory.productId,
      purchasedAt: purchaseHistory.purchasedAt,
    })
    .from(purchaseHistory)
    .where(sql`${purchaseHistory.productId} IN ${productIds}`)
    .orderBy(purchaseHistory.productId, desc(purchaseHistory.purchasedAt))
    .limit(500);

  // Group purchases by product
  const purchasesByProduct = new Map<string, Date[]>();
  for (const row of purchaseRows) {
    const dates = purchasesByProduct.get(row.productId) ?? [];
    dates.push(new Date(row.purchasedAt));
    purchasesByProduct.set(row.productId, dates);
  }

  const now = Date.now();
  const maxUsage = Math.max(...candidates.map((c) => c.usageCount), 1);

  const scored = candidates.map((c) => {
    // Usage score: normalized to 0..100
    const usageScore = (c.usageCount / maxUsage) * 100;

    // Recency score: how recently was it depleted (0..100, more recent = higher)
    let recencyScore = 0;
    if (c.depletedAt) {
      const daysSinceDepleted =
        (now - new Date(c.depletedAt).getTime()) / (1000 * 60 * 60 * 24);
      // Max 90 days window, linear decay
      recencyScore = Math.max(0, (1 - daysSinceDepleted / 90) * 100);
    }

    // Frequency score: is it overdue for repurchase?
    let frequencyScore = 0;
    const dates = purchasesByProduct.get(c.id);
    if (dates && dates.length >= 2) {
      // Deduplicate same-day purchases
      const unique = dates.filter(
        (d, i) => i === 0 || d.toDateString() !== dates[i - 1].toDateString(),
      );
      if (unique.length >= 2) {
        let totalMs = 0;
        for (let i = 0; i < unique.length - 1; i++) {
          totalMs += unique[i].getTime() - unique[i + 1].getTime();
        }
        const avgMs = totalMs / (unique.length - 1);
        const predictedNext = unique[0].getTime() + avgMs;
        const overdueMs = now - predictedNext;
        if (overdueMs > 0) {
          // More overdue = higher score (capped at 100)
          const overdueDays = overdueMs / (1000 * 60 * 60 * 24);
          frequencyScore = Math.min(100, overdueDays * 3);
        }
      }
    }

    const rawScore =
      usageScore * 0.2 + recencyScore * 0.3 + frequencyScore * 0.5;

    // "low" products get a 0.6 multiplier (still relevant but less urgent than "out")
    const score = c.status === "low" ? rawScore * 0.6 : rawScore;

    return {
      id: c.id,
      name: c.name,
      icon: c.icon,
      category: c.category,
      score,
    };
  });

  // Sort by score descending, take top 10
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, 10).map(({ score: _, ...rest }) => rest);
}
