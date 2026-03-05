import "server-only";

import { and, desc, eq, ilike, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { inventoryItem, product } from "@/lib/db/schema";
import { getProductPurchaseHistory } from "./purchase-history.queries";
import { getPurchaseFrequency } from "./purchase-history.queries";
import { findMappingsByRawCodes } from "./receipt-code.queries";
import { escapeLike } from "./shared";
import { getProductTags } from "./tag.queries";

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
    .where(ilike(product.name, `%${escapeLike(query)}%`))
    .orderBy(desc(product.usageCount))
    .limit(8);
}

export async function incrementProductUsage(productId: string) {
  await db
    .update(product)
    .set({ usageCount: sql`${product.usageCount} + 1` })
    .where(eq(product.id, productId));
}

export async function findProductByName(name: string) {
  if (!name) return null;

  const [result] = await db
    .select({ id: product.id, name: product.name })
    .from(product)
    .where(ilike(product.name, name.trim()))
    .limit(1);

  return result ?? null;
}

export type BulkUpsertResult = {
  /** All product mappings (index matches input items) */
  productIds: string[];
  /** Only newly created products (for OFF enrichment + auto-tagging) */
  newProducts: { productId: string; productName: string; category: string }[];
};

export async function bulkUpsertFromReceipt(
  items: {
    rawName: string;
    humanName: string;
    category: string;
    quantity: number;
    unit: string;
    unitPrice: number | null;
    totalPrice: number | null;
    matchedProductId?: string | null;
  }[],
  userId: string,
  storeName: string | null | undefined,
): Promise<BulkUpsertResult> {
  // Pre-fetch code mappings for all rawNames
  const rawCodes = items.map((i) => i.rawName).filter(Boolean);
  const rawMappings =
    rawCodes.length > 0
      ? await findMappingsByRawCodes(rawCodes, storeName ?? null)
      : new Map<string, { productId: string; productName: string }>();

  // Extract just productId for the resolution pipeline
  const codeMappings = new Map<string, string>();
  for (const [code, mapping] of rawMappings) {
    codeMappings.set(code, mapping.productId);
  }

  // Phase 1: Collect all unique names for bulk lookup
  const allNames = new Set<string>();
  for (const item of items) {
    if (!item.matchedProductId) {
      if (item.humanName) allNames.add(item.humanName.trim());
      if (item.rawName) allNames.add(item.rawName.trim());
    }
  }

  // Bulk name lookup: single SELECT for all candidate names
  let existingProductsByName = new Map<string, { id: string; name: string }>();
  if (allNames.size > 0) {
    const nameArray = [...allNames];
    const nameConditions = nameArray.map((n) => ilike(product.name, n));
    const orCondition =
      nameConditions.length === 1
        ? nameConditions[0]
        : sql`(${sql.join(nameConditions, sql` OR `)})`;

    const rows = await db
      .select({ id: product.id, name: product.name })
      .from(product)
      .where(orCondition);

    for (const row of rows) {
      existingProductsByName.set(
        row.name.trim().toLocaleLowerCase("fr-FR"),
        row,
      );
    }
  }

  return db.transaction(async (tx) => {
    const now = new Date();
    const newProducts: BulkUpsertResult["newProducts"] = [];
    const productIds: string[] = [];

    // Local cache for newly created products in this transaction
    const nameLookupCache = new Map<
      string,
      { id: string; name: string } | null
    >(
      [...existingProductsByName.entries()].map(([key, value]) => [key, value]),
    );

    // Phase 2: Resolve all product IDs
    const newProductInserts: (typeof product.$inferInsert)[] = [];

    for (const item of items) {
      let productId: string | null = null;

      // 1. User-provided match
      if (item.matchedProductId) {
        productId = item.matchedProductId;
      }

      // 2. Code mapping
      if (!productId && item.rawName) {
        const mappedId = codeMappings.get(item.rawName);
        if (mappedId) productId = mappedId;
      }

      // 3. Name-based lookup (from bulk pre-fetch or cache)
      if (!productId) {
        const humanKey = item.humanName.trim().toLocaleLowerCase("fr-FR");
        const rawKey = item.rawName.trim().toLocaleLowerCase("fr-FR");

        const existing =
          nameLookupCache.get(humanKey) ?? nameLookupCache.get(rawKey) ?? null;

        if (existing) {
          productId = existing.id;
        }
      }

      // 4. Create new product
      if (!productId) {
        productId = crypto.randomUUID();
        const newProduct = {
          id: productId,
          name: item.humanName,
          category: item.category,
          unit: item.unit,
          createdBy: userId,
        };
        newProductInserts.push(newProduct);
        newProducts.push({
          productId,
          productName: item.humanName,
          category: item.category,
        });

        // Cache for subsequent items in same batch
        const normalizedHumanName = item.humanName
          .trim()
          .toLocaleLowerCase("fr-FR");
        if (normalizedHumanName) {
          nameLookupCache.set(normalizedHumanName, {
            id: productId,
            name: item.humanName,
          });
        }
        const normalizedRawName = item.rawName
          .trim()
          .toLocaleLowerCase("fr-FR");
        if (normalizedRawName) {
          nameLookupCache.set(normalizedRawName, {
            id: productId,
            name: item.humanName,
          });
        }
      }

      productIds.push(productId);
    }

    // Phase 3: Bulk insert new products
    if (newProductInserts.length > 0) {
      await tx.insert(product).values(newProductInserts);
    }

    // Phase 4: Bulk update usageCount, lastPurchasedAt, lastPrice for ALL products
    // Group updates by productId to handle duplicates (same product appearing twice on receipt)
    const updateMap = new Map<
      string,
      { count: number; price: number | null }
    >();
    for (let i = 0; i < items.length; i++) {
      const pid = productIds[i];
      const price = items[i].unitPrice ?? items[i].totalPrice;
      const existing = updateMap.get(pid);
      if (existing) {
        existing.count += 1;
        if (price != null) existing.price = price;
      } else {
        updateMap.set(pid, { count: 1, price });
      }
    }

    if (updateMap.size > 0) {
      const pids = [...updateMap.keys()];

      // Build CASE WHEN for usage count increments
      const usageCaseFragments = pids.map((pid) => {
        const data = updateMap.get(pid)!;
        return sql`WHEN ${product.id} = ${pid} THEN ${product.usageCount} + ${data.count}`;
      });

      // Build CASE WHEN for price (only set when non-null)
      const priceCaseFragments = pids.map((pid) => {
        const data = updateMap.get(pid)!;
        return data.price != null
          ? sql`WHEN ${product.id} = ${pid} THEN ${String(data.price)}`
          : sql`WHEN ${product.id} = ${pid} THEN ${product.lastPrice}`;
      });

      await tx
        .update(product)
        .set({
          usageCount: sql`CASE ${sql.join(usageCaseFragments, sql` `)} ELSE ${product.usageCount} END`,
          lastPurchasedAt: now,
          lastPrice: sql`CASE ${sql.join(priceCaseFragments, sql` `)} ELSE ${product.lastPrice} END`,
        })
        .where(inArray(product.id, pids));
    }

    // Phase 5: Bulk inventory upsert using ON CONFLICT
    // Deduplicate by productId (same product can appear multiple times on a receipt)
    const uniqueProductIds = [...new Set(productIds)];
    const inventoryValues = uniqueProductIds.map((pid) => ({
      id: crypto.randomUUID(),
      productId: pid,
      status: "in_stock" as const,
      lastPurchasedAt: now,
      depletedAt: null,
      addedBy: userId,
    }));

    if (inventoryValues.length > 0) {
      await tx
        .insert(inventoryItem)
        .values(inventoryValues)
        .onConflictDoUpdate({
          target: [inventoryItem.productId],
          set: {
            status: "in_stock",
            lastPurchasedAt: now,
            depletedAt: null,
            addedBy: userId,
          },
        });
    }

    return { productIds, newProducts };
  });
}

export async function getProductDetails(productId: string) {
  const [exists] = await db
    .select({ id: inventoryItem.id })
    .from(inventoryItem)
    .where(eq(inventoryItem.productId, productId))
    .limit(1);

  if (!exists) {
    throw new Error("Produit introuvable dans votre stock");
  }

  const [frequency, history, tags] = await Promise.all([
    getPurchaseFrequency(productId),
    getProductPurchaseHistory(productId),
    getProductTags(productId),
  ]);

  return { frequency, history, tags: tags.map((t) => t.tag) };
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
