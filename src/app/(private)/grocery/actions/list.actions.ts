"use server";

import { and, eq } from "drizzle-orm";
import { getSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import {
  inventoryItem,
  product,
  purchaseHistory,
  shoppingListItem,
} from "@/lib/db/schema";
import {
  getNextSortOrder,
  getOrCreateActiveList,
  incrementProductUsage,
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
    const now = new Date();

    await tx
      .update(shoppingListItem)
      .set({
        checked: newChecked,
        checkedAt: newChecked ? now : null,
      })
      .where(
        and(
          eq(shoppingListItem.id, parsedItemId.data),
          eq(shoppingListItem.listId, list.id),
        ),
      );

    if (newChecked && item.productId) {
      const [existingStock] = await tx
        .select({ id: inventoryItem.id })
        .from(inventoryItem)
        .where(eq(inventoryItem.productId, item.productId))
        .limit(1);

      if (existingStock) {
        await tx
          .update(inventoryItem)
          .set({
            status: "in_stock",
            lastPurchasedAt: now,
            depletedAt: null,
          })
          .where(eq(inventoryItem.id, existingStock.id));
      } else {
        await tx.insert(inventoryItem).values({
          id: crypto.randomUUID(),
          productId: item.productId,
          status: "in_stock",
          lastPurchasedAt: now,
          depletedAt: null,
          addedBy: session.user.id,
        });
      }

      await tx
        .update(product)
        .set({ lastPurchasedAt: now })
        .where(eq(product.id, item.productId));

      await tx.insert(purchaseHistory).values({
        id: crypto.randomUUID(),
        productId: item.productId,
        source: "list_check",
        recordedBy: session.user.id,
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

  const [existing] = await db
    .select({ id: shoppingListItem.id })
    .from(shoppingListItem)
    .where(
      and(
        eq(shoppingListItem.listId, list.id),
        eq(shoppingListItem.productId, parsedProductId.data),
      ),
    )
    .limit(1);

  if (existing) return;

  const sortOrder = await getNextSortOrder(list.id);
  await incrementProductUsage(parsedProductId.data);

  await db.insert(shoppingListItem).values({
    id: crypto.randomUUID(),
    listId: list.id,
    productId: parsedProductId.data,
    customName: null,
    quantity: 1,
    unit: "piece",
    sortOrder,
    addedBy: session.user.id,
  });

  revalidateGrocery("grocery-list");
}

export async function addSuggestionToList(productId: string) {
  await addOutOfStockToList(productId);
}
