import "server-only";

import { and, desc, eq, gt, ilike, lt, not, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  inventoryItem,
  product,
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
