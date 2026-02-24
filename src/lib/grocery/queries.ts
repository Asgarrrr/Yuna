import "server-only";

import { and, desc, eq, gt, ilike, lt, not, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  inventoryItem,
  product,
  purchaseHistory,
  shoppingList,
  shoppingListItem,
} from "@/lib/db/schema";
import type { StockStatus } from "./constants";

export async function getOrCreateActiveList(userId: string) {
  const [existing] = await db
    .select()
    .from(shoppingList)
    .where(
      and(eq(shoppingList.isActive, true), eq(shoppingList.createdBy, userId)),
    )
    .limit(1);

  if (existing) return existing;

  const [created] = await db
    .insert(shoppingList)
    .values({
      id: crypto.randomUUID(),
      name: "Ma liste",
      isActive: true,
      createdBy: userId,
    })
    .returning();

  return created;
}

async function getListItems(listId: string) {
  return db
    .select({
      id: shoppingListItem.id,
      customName: shoppingListItem.customName,
      quantity: shoppingListItem.quantity,
      unit: shoppingListItem.unit,
      checked: shoppingListItem.checked,
      productName: product.name,
      productIcon: product.icon,
    })
    .from(shoppingListItem)
    .leftJoin(product, eq(shoppingListItem.productId, product.id))
    .where(eq(shoppingListItem.listId, listId))
    .orderBy(shoppingListItem.checked, shoppingListItem.sortOrder);
}

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
    .where(ilike(product.name, `%${query}%`))
    .orderBy(desc(product.usageCount))
    .limit(8);
}

export async function getNextSortOrder(listId: string) {
  const [result] = await db
    .select({ max: sql<number>`coalesce(max(${shoppingListItem.sortOrder}), 0)` })
    .from(shoppingListItem)
    .where(eq(shoppingListItem.listId, listId));

  return (result?.max ?? 0) + 1;
}

export async function incrementProductUsage(productId: string) {
  await db
    .update(product)
    .set({ usageCount: sql`${product.usageCount} + 1` })
    .where(eq(product.id, productId));
}

export async function getActiveListWithItems(userId: string) {
  const list = await getOrCreateActiveList(userId);
  const items = await getListItems(list.id);
  return { list, items };
}

// ── Stock queries ─────────────────────────────────────────

export type StockItem = Awaited<ReturnType<typeof getStock>>[number];

export async function getStock() {
  return db
    .select({
      id: inventoryItem.id,
      productId: inventoryItem.productId,
      status: inventoryItem.status,
      location: inventoryItem.location,
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
    .orderBy(inventoryItem.location, product.name);
}

export async function upsertStockItem(
  productId: string,
  status: StockStatus,
  userId: string,
) {
  const now = new Date();
  const [existing] = await db
    .select({ id: inventoryItem.id })
    .from(inventoryItem)
    .where(eq(inventoryItem.productId, productId))
    .limit(1);

  if (existing) {
    await db
      .update(inventoryItem)
      .set({
        status,
        lastPurchasedAt: status === "in_stock" ? now : undefined,
        depletedAt: status === "out" ? now : null,
      })
      .where(eq(inventoryItem.id, existing.id));
  } else {
    await db.insert(inventoryItem).values({
      id: crypto.randomUUID(),
      productId,
      status,
      lastPurchasedAt: status === "in_stock" ? now : null,
      depletedAt: status === "out" ? now : null,
      addedBy: userId,
    });
  }

  // Also update product.lastPurchasedAt when purchasing
  if (status === "in_stock") {
    await db
      .update(product)
      .set({ lastPurchasedAt: now })
      .where(eq(product.id, productId));
  }
}

export async function updateStockStatus(
  productId: string,
  status: StockStatus,
) {
  const now = new Date();
  await db
    .update(inventoryItem)
    .set({
      status,
      depletedAt: status === "out" ? now : null,
      lastPurchasedAt: status === "in_stock" ? now : undefined,
    })
    .where(eq(inventoryItem.productId, productId));
}

export async function getSuggestions(userId: string) {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

  const list = await getOrCreateActiveList(userId);

  // Products that are "out", depleted recently (< 30 days),
  // bought regularly (usageCount >= 2), not already on active list,
  // and not abandoned (depletedAt not older than 90 days with low usage)
  return db
    .select({
      id: product.id,
      name: product.name,
      icon: product.icon,
      category: product.category,
    })
    .from(inventoryItem)
    .innerJoin(product, eq(inventoryItem.productId, product.id))
    .where(
      and(
        eq(inventoryItem.status, "out"),
        gt(inventoryItem.depletedAt, thirtyDaysAgo),
        not(lt(inventoryItem.depletedAt, ninetyDaysAgo)),
        gt(product.usageCount, 1),
        sql`NOT EXISTS (
          SELECT 1 FROM ${shoppingListItem}
          WHERE ${shoppingListItem.productId} = ${product.id}
          AND ${shoppingListItem.listId} = ${list.id}
        )`,
      ),
    )
    .orderBy(desc(product.usageCount))
    .limit(10);
}

// ── Smart list queries ──────────────────────────────────────

export async function getStockByProductNames(names: string[]) {
  if (names.length === 0) return [];

  const conditions = names.map((n) => ilike(product.name, `%${n}%`));
  const orCondition = conditions.length === 1 ? conditions[0] : sql`(${sql.join(conditions, sql` OR `)})`;

  return db
    .select({
      productId: product.id,
      productName: product.name,
      status: inventoryItem.status,
    })
    .from(product)
    .leftJoin(inventoryItem, eq(inventoryItem.productId, product.id))
    .where(orCondition);
}

export async function getStockSummary() {
  return db
    .select({
      productId: product.id,
      productName: product.name,
      status: inventoryItem.status,
      category: product.category,
    })
    .from(inventoryItem)
    .innerJoin(product, eq(inventoryItem.productId, product.id))
    .orderBy(product.category, product.name);
}

// ── Receipt / OFF queries ─────────────────────────────────

export async function findProductByName(name: string) {
  if (!name) return null;

  const [result] = await db
    .select({ id: product.id, name: product.name })
    .from(product)
    .where(ilike(product.name, name.trim()))
    .limit(1);

  return result ?? null;
}

export interface BulkUpsertResult {
  /** All product mappings (index matches input items) */
  productIds: string[];
  /** Only newly created products (for OFF enrichment) */
  newProducts: { productId: string; productName: string }[];
}

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
  const now = new Date();
  const newProducts: { productId: string; productName: string }[] = [];
  const productIds: string[] = [];

  for (const item of items) {
    // Try to find existing product by name (case-insensitive)
    let existing = await findProductByName(item.humanName);

    if (!existing) {
      // Also try with rawName
      existing = await findProductByName(item.rawName);
    }

    let productId: string;

    if (existing) {
      productId = existing.id;
    } else {
      // Create new product
      productId = crypto.randomUUID();
      await db.insert(product).values({
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
    }

    productIds.push(productId);

    // Update lastPrice
    const price = item.unitPrice ?? item.totalPrice;
    if (price) {
      await db
        .update(product)
        .set({ lastPrice: String(price) })
        .where(eq(product.id, productId));
    }

    // Upsert inventory item as in_stock
    const [existingInventory] = await db
      .select({ id: inventoryItem.id })
      .from(inventoryItem)
      .where(eq(inventoryItem.productId, productId))
      .limit(1);

    if (existingInventory) {
      await db
        .update(inventoryItem)
        .set({ status: "in_stock", lastPurchasedAt: now })
        .where(eq(inventoryItem.id, existingInventory.id));
    } else {
      await db.insert(inventoryItem).values({
        id: crypto.randomUUID(),
        productId,
        status: "in_stock",
        lastPurchasedAt: now,
        addedBy: userId,
      });
    }

    // Increment usage count
    await db
      .update(product)
      .set({
        usageCount: sql`${product.usageCount} + 1`,
        lastPurchasedAt: now,
      })
      .where(eq(product.id, productId));
  }

  return { productIds, newProducts };
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

// ── Purchase history ───────────────────────────────────────

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

  // Calculate average days between purchases
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

export async function getProductsNeedingRestock() {
  // Single query: get all purchase dates for in-stock products that have ≥2 purchases
  const rows = await db
    .select({
      productId: purchaseHistory.productId,
      purchasedAt: purchaseHistory.purchasedAt,
    })
    .from(purchaseHistory)
    .innerJoin(inventoryItem, eq(inventoryItem.productId, purchaseHistory.productId))
    .where(eq(inventoryItem.status, "in_stock"))
    .orderBy(purchaseHistory.productId, desc(purchaseHistory.purchasedAt));

  // Group by productId
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

    // dates are already sorted desc — compute avg interval
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
