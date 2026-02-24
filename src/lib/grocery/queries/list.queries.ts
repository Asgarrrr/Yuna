import "server-only";

import { and, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { product, shoppingList, shoppingListItem } from "@/lib/db/schema";

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

export async function getListItems(listId: string) {
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

export async function getNextSortOrder(listId: string) {
  const [result] = await db
    .select({
      max: sql<number>`coalesce(max(${shoppingListItem.sortOrder}), 0)`,
    })
    .from(shoppingListItem)
    .where(eq(shoppingListItem.listId, listId));

  return (result?.max ?? 0) + 1;
}

export async function getActiveListWithItems(userId: string) {
  const list = await getOrCreateActiveList(userId);
  const items = await getListItems(list.id);
  return { list, items };
}
