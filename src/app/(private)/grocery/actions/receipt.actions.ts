"use server";

import { generateObject } from "ai";
import { after } from "next/server";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { model } from "@/lib/ai/models";
import { getSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import {
  product,
  purchaseHistory,
  shoppingListItem,
} from "@/lib/db/schema";
import { enrichProducts } from "@/lib/grocery/openfoodfacts";
import {
  addTags,
  autoTagProducts,
  bulkUpsertCodeMappings,
  bulkUpsertFromReceipt,
  getOrCreateActiveList,
  searchByNameOrTag,
  updateProductOFF,
} from "@/lib/grocery/queries";
import { commitReceiptPayloadSchema, revalidateGrocery } from "./shared";

export async function commitReceiptItems(
  items: {
    rawName: string;
    humanName: string;
    category: string;
    quantity: number;
    unit: string;
    unitPrice: number | null;
    totalPrice: number | null;
    matchedProductId?: string | null;
    isCodeMapping?: boolean;
  }[],
  storeName: string | null,
  matchedListItemIds?: string[],
) {
  const parsedPayload = commitReceiptPayloadSchema.safeParse({
    items,
    storeName,
    matchedListItemIds,
  });
  if (!parsedPayload.success) {
    throw new Error("Contenu du ticket invalide");
  }

  const session = await getSession();

  const mergedItems = parsedPayload.data.items.map((item) => ({
    rawName: item.rawName,
    humanName: item.humanName,
    category: item.category,
    quantity: item.quantity,
    unit: item.unit,
    unitPrice: item.unitPrice,
    totalPrice: item.totalPrice,
    matchedProductId: item.matchedProductId ?? null,
  }));

  const { productIds, newProducts } = await bulkUpsertFromReceipt(
    mergedItems,
    session.user.id,
    parsedPayload.data.storeName,
  );

  await db.transaction(async (tx) => {
    const purchaseRows: (typeof purchaseHistory.$inferInsert)[] = [];

    for (let i = 0; i < mergedItems.length; i++) {
      const item = mergedItems[i];
      const productId = productIds[i];
      if (!productId) continue;

      // Prefer unitPrice for the per-unit price record, fallback to totalPrice
      const price =
        item.unitPrice != null
          ? String(item.unitPrice)
          : item.totalPrice != null
            ? String(item.totalPrice)
            : null;

      purchaseRows.push({
        id: crypto.randomUUID(),
        productId,
        price,
        storeName: parsedPayload.data.storeName ?? null,
        quantity: item.quantity,
        source: "receipt",
        recordedBy: session.user.id,
      });
    }

    if (purchaseRows.length > 0) {
      await tx.insert(purchaseHistory).values(purchaseRows);
    }

    // Auto-check shopping list items that match imported products (direct ID match)
    const importedProductIds = [...new Set(productIds.filter(Boolean))];
    if (importedProductIds.length > 0) {
      const list = await getOrCreateActiveList(session.user.id);
      await tx
        .update(shoppingListItem)
        .set({ checked: true, checkedAt: new Date() })
        .where(
          and(
            eq(shoppingListItem.listId, list.id),
            eq(shoppingListItem.checked, false),
            inArray(shoppingListItem.productId, importedProductIds),
          ),
        );
    }

    // Check matched list items from the review UI (AI smart-match results)
    const listItemIds = parsedPayload.data.matchedListItemIds ?? [];
    if (listItemIds.length > 0) {
      await tx
        .update(shoppingListItem)
        .set({ checked: true, checkedAt: new Date() })
        .where(
          and(
            eq(shoppingListItem.checked, false),
            inArray(shoppingListItem.id, listItemIds),
          ),
        );
    }
  });

  after(async () => {
    // Auto-tag new products (deterministic, based on name + category)
    if (newProducts.length > 0) {
      try {
        await autoTagProducts(
          newProducts.map((p) => ({
            productId: p.productId,
            name: p.productName,
            category: p.category,
          })),
        );
        console.log(`[receipt] Auto-tagged ${newProducts.length} new products`);
      } catch (err) {
        console.error("[receipt] Auto-tagging failed:", err);
      }
    }

    // Enrich new products via OpenFoodFacts + auto-tag brand
    if (newProducts.length > 0) {
      try {
        const results = await enrichProducts(newProducts);
        for (const [productId, data] of results) {
          await updateProductOFF(productId, data);
          // Auto-tag brand from OFF enrichment
          if (data.brand) {
            await addTags(productId, [data.brand.toLowerCase()], "system");
          }
        }
        revalidateGrocery("grocery-stock");
        console.log(
          `[receipt] Enriched ${results.size}/${newProducts.length} products via OFF`,
        );
      } catch (err) {
        console.error("[receipt] OFF enrichment failed:", err);
      }
    }

    // Save code mappings for edited/corrected items
    const codeMappings: {
      rawCode: string;
      storeName: string | null;
      productId: string;
    }[] = [];
    for (let i = 0; i < parsedPayload.data.items.length; i++) {
      const item = parsedPayload.data.items[i];
      const productId = productIds[i];
      if (!productId) continue;

      if (item.isCodeMapping && item.rawName !== item.humanName) {
        codeMappings.push({
          rawCode: item.rawName,
          storeName: parsedPayload.data.storeName ?? null,
          productId,
        });
      }
    }

    if (codeMappings.length > 0) {
      try {
        await bulkUpsertCodeMappings(codeMappings, session.user.id);
        console.log(`[receipt] Saved ${codeMappings.length} code mappings`);
      } catch (err) {
        console.error("[receipt] Code mapping save failed:", err);
      }
    }
  });

  revalidateGrocery("grocery-list", "grocery-stock", "grocery-suggestions");
  return { count: parsedPayload.data.items.length };
}

export async function matchReceiptToList(
  receiptItems: { humanName: string }[],
) {
  const session = await getSession();
  const list = await getOrCreateActiveList(session.user.id);

  // Use LEFT JOIN to include custom items (no productId) as well as product-linked items
  const uncheckedRows = await db
    .select({
      id: shoppingListItem.id,
      productId: shoppingListItem.productId,
      productName: product.name,
      customName: shoppingListItem.customName,
    })
    .from(shoppingListItem)
    .leftJoin(product, eq(product.id, shoppingListItem.productId))
    .where(
      and(
        eq(shoppingListItem.listId, list.id),
        eq(shoppingListItem.checked, false),
      ),
    );

  if (uncheckedRows.length === 0 || receiptItems.length === 0) {
    return [];
  }

  // Build list names from product name or custom name
  const unchecked = uncheckedRows
    .map((row) => ({
      id: row.id,
      name: row.productName ?? row.customName ?? null,
    }))
    .filter((row): row is { id: string; name: string } => row.name != null);

  if (unchecked.length === 0) return [];

  const receiptNames = receiptItems.map((i) => i.humanName);
  const listNames = unchecked.map((i) => ({ id: i.id, name: i.name }));

  try {
    const { object: matches } = await generateObject({
      model,
      temperature: 0,
      maxRetries: 1,
      timeout: 15_000,
      schema: z.object({
        matches: z
          .array(
            z.object({
              listItemId: z.string(),
              receiptItemIndex: z.number(),
            }),
          )
          .describe(
            "Paires (listItemId, receiptItemIndex) ou le produit du ticket couvre l'item de la liste",
          ),
      }),
      prompt: `Produits du ticket (par index) : ${JSON.stringify(receiptNames.map((n, i) => ({ index: i, name: n })))}
Items de la liste de courses : ${JSON.stringify(listNames)}
Quels items de la liste sont couverts par les produits du ticket ? Un item est couvert si un produit du ticket correspond au meme type de produit (ex: "Tagliatelles 500g" couvre "pates", "Coca-Cola 1.25L" couvre "coca"). Retourne les paires.`,
    });

    // Validate returned IDs against actual unchecked items
    const validUncheckedIds = new Set(unchecked.map((u) => u.id));
    return matches.matches
      .filter(
        (m) =>
          validUncheckedIds.has(m.listItemId) &&
          Number.isInteger(m.receiptItemIndex) &&
          m.receiptItemIndex >= 0 &&
          m.receiptItemIndex < receiptItems.length,
      )
      .map((m) => ({
        listItemId: m.listItemId,
        listItemName:
          unchecked.find((u) => u.id === m.listItemId)?.name ?? "",
        receiptItemIndex: m.receiptItemIndex,
      }));
  } catch (err) {
    console.error("[receipt] matchReceiptToList failed:", err);
    return [];
  }
}

export async function searchProducts(query: string) {
  await getSession(); // Auth check
  return searchByNameOrTag(query);
}
