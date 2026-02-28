"use server";

import { and, eq } from "drizzle-orm";
import { getSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { shoppingListItem } from "@/lib/db/schema";
import {
  getNextSortOrder,
  getOrCreateActiveList,
  incrementProductUsage,
  recordPurchase,
  upsertInventory,
} from "@/lib/grocery/queries";
import {
  listItemIdSchema,
  quantitySchema,
  revalidateGrocery,
  uuidSchema,
} from "./shared";

export async function toggleItem(itemId: string) {
  const parsedItemId = listItemIdSchema.safeParse(itemId);
  if (!parsedItemId.success) {
    throw new Error("Identifiant d'article invalide");
  }

  const session = await getSession();
  const list = await getOrCreateActiveList(session.user.id);
  const didToggle = await db.transaction(async (tx) => {
    const [item] = await tx
      .select({
        checked: shoppingListItem.checked,
        productId: shoppingListItem.productId,
      })
      .from(shoppingListItem)
      .where(
        and(
          eq(shoppingListItem.id, parsedItemId.data),
          eq(shoppingListItem.listId, list.id),
        ),
      )
      .limit(1);

    if (!item) return false;

    const newChecked = !item.checked;

    await tx
      .update(shoppingListItem)
      .set({
        checked: newChecked,
        checkedAt: newChecked ? new Date() : null,
      })
      .where(
        and(
          eq(shoppingListItem.id, parsedItemId.data),
          eq(shoppingListItem.listId, list.id),
        ),
      );

    if (newChecked && item.productId) {
      // Use shared upsertInventory (ON CONFLICT)
      await upsertInventory(tx, item.productId, "in_stock", session.user.id);

      await recordPurchase({
        productId: item.productId,
        source: "list_check",
        userId: session.user.id,
        executor: tx,
      });
    }

    return true;
  });

  if (!didToggle) return;

  revalidateGrocery("grocery-list", "grocery-stock", "grocery-suggestions");
}

export async function updateItemQuantity(itemId: string, quantity: number) {
  const parsedItemId = listItemIdSchema.safeParse(itemId);
  const parsedQuantity = quantitySchema.safeParse(quantity);
  if (!parsedItemId.success || !parsedQuantity.success) {
    throw new Error("Quantité ou identifiant invalide");
  }

  const session = await getSession();
  const list = await getOrCreateActiveList(session.user.id);

  await db
    .update(shoppingListItem)
    .set({ quantity: parsedQuantity.data })
    .where(
      and(
        eq(shoppingListItem.id, parsedItemId.data),
        eq(shoppingListItem.listId, list.id),
      ),
    );

  revalidateGrocery("grocery-list");
}

export async function removeItem(itemId: string) {
  const parsedItemId = listItemIdSchema.safeParse(itemId);
  if (!parsedItemId.success) {
    throw new Error("Identifiant d'article invalide");
  }

  const session = await getSession();
  const list = await getOrCreateActiveList(session.user.id);

  await db
    .delete(shoppingListItem)
    .where(
      and(
        eq(shoppingListItem.id, parsedItemId.data),
        eq(shoppingListItem.listId, list.id),
      ),
    );

  revalidateGrocery("grocery-list");
}

export async function clearCheckedItems() {
  const session = await getSession();
  const list = await getOrCreateActiveList(session.user.id);

  await db
    .delete(shoppingListItem)
    .where(
      and(
        eq(shoppingListItem.listId, list.id),
        eq(shoppingListItem.checked, true),
      ),
    );

  revalidateGrocery("grocery-list");
}

export async function addOutOfStockToList(productId: string) {
  const parsedProductId = uuidSchema.safeParse(productId);
  if (!parsedProductId.success) {
    throw new Error("Identifiant de produit invalide");
  }

  const session = await getSession();
  const list = await getOrCreateActiveList(session.user.id);
  const sortOrder = await getNextSortOrder(list.id);

  // Atomic: ON CONFLICT uses partial unique index (listId, productId)
  const result = await db
    .insert(shoppingListItem)
    .values({
      id: crypto.randomUUID(),
      listId: list.id,
      productId: parsedProductId.data,
      customName: null,
      quantity: 1,
      unit: "piece",
      sortOrder,
      addedBy: session.user.id,
    })
    .onConflictDoNothing()
    .returning({ id: shoppingListItem.id });

  // Only increment usage if the item was actually inserted (not a duplicate)
  if (result.length > 0) {
    await incrementProductUsage(parsedProductId.data);
  }

  revalidateGrocery("grocery-list");
}

export async function addSuggestionToList(productId: string) {
  await addOutOfStockToList(productId);
}
