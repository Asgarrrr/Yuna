"use server";

import { eq, ilike, sql } from "drizzle-orm";
import { getSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import {
  inventoryItem,
  product,
  purchaseHistory,
  shoppingListItem,
} from "@/lib/db/schema";
import { getProductByBarcode } from "@/lib/grocery/openfoodfacts";
import { getOrCreateActiveList } from "@/lib/grocery/queries";
import {
  barcodePayloadSchema,
  barcodeSchema,
  revalidateGrocery,
} from "./shared";

export async function lookupBarcode(barcode: string) {
  const parsedBarcode = barcodeSchema.safeParse(barcode);
  if (!parsedBarcode.success) {
    throw new Error("Code-barres invalide");
  }
  const normalizedBarcode = parsedBarcode.data;

  await getSession();

  const [localProduct] = await db
    .select({
      id: product.id,
      name: product.name,
      brand: product.brand,
      genericName: product.genericName,
      nutriscoreGrade: product.nutriscoreGrade,
      imageSmallUrl: product.imageSmallUrl,
    })
    .from(product)
    .where(eq(product.barcode, normalizedBarcode))
    .limit(1);

  if (localProduct) {
    return {
      barcode: normalizedBarcode,
      productName: localProduct.name,
      brand: localProduct.brand,
      genericName: localProduct.genericName,
      nutriscoreGrade: localProduct.nutriscoreGrade,
      imageSmallUrl: localProduct.imageSmallUrl,
      existingProductId: localProduct.id,
    };
  }

  const offResult = await getProductByBarcode(normalizedBarcode);

  return {
    barcode: normalizedBarcode,
    productName: offResult?.productName ?? null,
    brand: offResult?.brand ?? null,
    genericName: offResult?.genericName ?? null,
    nutriscoreGrade: offResult?.nutriscoreGrade ?? null,
    imageSmallUrl: offResult?.imageSmallUrl ?? null,
    existingProductId: null,
  };
}

export async function addBarcodeToStock(data: {
  barcode: string;
  productName: string | null;
  brand: string | null;
  genericName: string | null;
  nutriscoreGrade: string | null;
  imageSmallUrl: string | null;
  existingProductId: string | null;
  target: "stock" | "list";
}) {
  const parsedData = barcodePayloadSchema.safeParse(data);
  if (!parsedData.success) {
    throw new Error("Données de scan invalides");
  }

  const session = await getSession();

  const payload = parsedData.data;
  const targetList =
    payload.target === "list"
      ? await getOrCreateActiveList(session.user.id)
      : null;
  const now = new Date();

  const { target, productId } = await db.transaction(async (tx) => {
    let resolvedProductId = payload.existingProductId;

    if (!resolvedProductId) {
      let foundByName = false;
      if (payload.productName) {
        const [existing] = await tx
          .select({ id: product.id, name: product.name })
          .from(product)
          .where(ilike(product.name, payload.productName.trim()))
          .limit(1);
        if (existing) {
          resolvedProductId = existing.id;
          foundByName = true;
        }
      }

      if (foundByName && resolvedProductId) {
        await tx
          .update(product)
          .set({
            barcode: payload.barcode,
            brand: payload.brand ?? undefined,
            genericName: payload.genericName ?? undefined,
            nutriscoreGrade: payload.nutriscoreGrade ?? undefined,
            imageSmallUrl: payload.imageSmallUrl ?? undefined,
          })
          .where(eq(product.id, resolvedProductId));
      } else {
        resolvedProductId = crypto.randomUUID();
        await tx.insert(product).values({
          id: resolvedProductId,
          name: payload.productName || `Produit ${payload.barcode}`,
          category: "other",
          unit: "piece",
          barcode: payload.barcode,
          brand: payload.brand,
          genericName: payload.genericName,
          nutriscoreGrade: payload.nutriscoreGrade,
          imageSmallUrl: payload.imageSmallUrl,
          createdBy: session.user.id,
        });
      }
    }

    if (payload.target === "stock") {
      const [existingInventory] = await tx
        .select({ id: inventoryItem.id })
        .from(inventoryItem)
        .where(eq(inventoryItem.productId, resolvedProductId))
        .limit(1);

      if (existingInventory) {
        await tx
          .update(inventoryItem)
          .set({ status: "in_stock", lastPurchasedAt: now, depletedAt: null })
          .where(eq(inventoryItem.id, existingInventory.id));
      } else {
        await tx.insert(inventoryItem).values({
          id: crypto.randomUUID(),
          productId: resolvedProductId,
          status: "in_stock",
          lastPurchasedAt: now,
          depletedAt: null,
          addedBy: session.user.id,
        });
      }

      await tx
        .update(product)
        .set({ lastPurchasedAt: now })
        .where(eq(product.id, resolvedProductId));
    } else if (targetList) {
      const [sortOrderResult] = await tx
        .select({
          max: sql<number>`coalesce(max(${shoppingListItem.sortOrder}), 0)`,
        })
        .from(shoppingListItem)
        .where(eq(shoppingListItem.listId, targetList.id));

      await tx
        .update(product)
        .set({
          usageCount: sql`${product.usageCount} + 1`,
        })
        .where(eq(product.id, resolvedProductId));

      await tx.insert(shoppingListItem).values({
        id: crypto.randomUUID(),
        listId: targetList.id,
        productId: resolvedProductId,
        customName: null,
        quantity: 1,
        unit: "piece",
        sortOrder: (sortOrderResult?.max ?? 0) + 1,
        addedBy: session.user.id,
      });
    }

    await tx.insert(purchaseHistory).values({
      id: crypto.randomUUID(),
      productId: resolvedProductId,
      source: "barcode",
      recordedBy: session.user.id,
    });

    return { target: payload.target, productId: resolvedProductId };
  });

  if (target === "stock") {
    revalidateGrocery("grocery-stock", "grocery-suggestions");
  } else {
    revalidateGrocery("grocery-list", "grocery-suggestions");
  }

  return { productId };
}
