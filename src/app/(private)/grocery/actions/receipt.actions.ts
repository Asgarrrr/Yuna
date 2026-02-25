"use server";

import { after } from "next/server";
import { getSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { purchaseHistory } from "@/lib/db/schema";
import { enrichProducts } from "@/lib/grocery/openfoodfacts";
import { bulkUpsertFromReceipt, updateProductOFF } from "@/lib/grocery/queries";
import { commitReceiptPayloadSchema, revalidateGrocery } from "./shared";

export async function commitReceiptItems(
  items: {
    humanName: string;
    category: string;
    quantity: number;
    unit: string;
    unitPrice: number | null;
    totalPrice: number | null;
  }[],
  storeName: string | null,
) {
  const parsedPayload = commitReceiptPayloadSchema.safeParse({
    items,
    storeName,
  });
  if (!parsedPayload.success) {
    throw new Error("Contenu du ticket invalide");
  }

  const session = await getSession();

  const mergedItems = parsedPayload.data.items.map((item) => ({
    rawName: item.humanName,
    humanName: item.humanName,
    category: item.category,
    quantity: item.quantity,
    unit: item.unit,
    unitPrice: item.unitPrice,
    totalPrice: item.totalPrice,
  }));

  const { productIds, newProducts } = await bulkUpsertFromReceipt(
    mergedItems,
    session.user.id,
  );

  await db.transaction(async (tx) => {
    const purchaseRows: (typeof purchaseHistory.$inferInsert)[] = [];

    for (let i = 0; i < mergedItems.length; i++) {
      const item = mergedItems[i];
      const productId = productIds[i];
      if (!productId) continue;

      purchaseRows.push({
        id: crypto.randomUUID(),
        productId,
        price:
          item.unitPrice != null || item.totalPrice != null
            ? String(item.unitPrice ?? item.totalPrice)
            : null,
        storeName: parsedPayload.data.storeName ?? null,
        quantity: item.quantity,
        source: "receipt",
        recordedBy: session.user.id,
      });
    }

    if (purchaseRows.length > 0) {
      await tx.insert(purchaseHistory).values(purchaseRows);
    }
  });

  if (newProducts.length > 0) {
    after(async () => {
      try {
        const results = await enrichProducts(newProducts);
        for (const [productId, data] of results) {
          await updateProductOFF(productId, data);
        }
        revalidateGrocery("grocery-stock");
        console.log(
          `[receipt] Enriched ${results.size}/${newProducts.length} products via OFF`,
        );
      } catch (err) {
        console.error("[receipt] OFF enrichment failed:", err);
      }
    });
  }

  revalidateGrocery("grocery-list", "grocery-stock", "grocery-suggestions");
  return { count: parsedPayload.data.items.length };
}
