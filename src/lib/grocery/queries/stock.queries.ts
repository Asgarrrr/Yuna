import "server-only";

import { and, desc, eq, gt, ilike, lt, not, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { inventoryItem, product, shoppingListItem } from "@/lib/db/schema";
import type { StockStatus } from "../constants";
import { getOrCreateActiveList } from "./list.queries";
import { escapeLike } from "./shared";

export type StockItem = Awaited<ReturnType<typeof getStock>>[number];

export async function getStock(userId: string) {
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
    .where(eq(inventoryItem.addedBy, userId))
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
  userId: string,
) {
  const now = new Date();
  await db
    .update(inventoryItem)
    .set({
      status,
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

export async function getStockByProductNames(names: string[]) {
  if (names.length === 0) return [];

  const conditions = names.map((n) =>
    ilike(product.name, `%${escapeLike(n)}%`),
  );
  const orCondition =
    conditions.length === 1
      ? conditions[0]
      : sql`(${sql.join(conditions, sql` OR `)})`;

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

export async function getSuggestions(userId: string) {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

  const list = await getOrCreateActiveList(userId);

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
