"use server";

import { eq, ilike } from "drizzle-orm";
import { getSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { product, shoppingListItem } from "@/lib/db/schema";
import { getProductByBarcode } from "@/lib/grocery/openfoodfacts";
import {
  getNextSortOrder,
  getOrCreateActiveList,
  incrementProductUsage,
  recordPurchase,
  upsertInventory,
} from "@/lib/grocery/queries";
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
      // Use shared upsertInventory (ON CONFLICT)
      await upsertInventory(
        tx,
        resolvedProductId,
        "in_stock",
        session.user.id,
      );
    } else if (targetList) {
      const sortOrder = await getNextSortOrder(targetList.id);

      await tx.insert(shoppingListItem).values({
        id: crypto.randomUUID(),
        listId: targetList.id,
        productId: resolvedProductId,
        customName: null,
        quantity: 1,
        unit: "piece",
        sortOrder,
        addedBy: session.user.id,
      });

      await incrementProductUsage(resolvedProductId);
    }

    await recordPurchase({
      productId: resolvedProductId,
      source: "barcode",
      userId: session.user.id,
      executor: tx,
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
