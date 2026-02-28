import "server-only";

import { and, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { product, productTag } from "@/lib/db/schema";
import type { Category, TagSource } from "../constants";
import { CATEGORY_TAGS, NAME_TAG_RULES } from "../constants";
import { escapeLike } from "./shared";

/**
 * Add tags to a product (ignores duplicates via ON CONFLICT).
 */
export async function addTags(
  productId: string,
  tags: string[],
  source: TagSource,
) {
  if (tags.length === 0) return;

  const uniqueTags = [...new Set(tags.map((t) => t.toLowerCase().trim()))];
  const values = uniqueTags.map((tag) => ({
    id: crypto.randomUUID(),
    productId,
    tag,
    source,
  }));

  await db
    .insert(productTag)
    .values(values)
    .onConflictDoNothing({ target: [productTag.productId, productTag.tag] });
}

/**
 * Get all products that have a given tag.
 */
export async function getProductsByTag(tag: string) {
  return db
    .select({
      id: product.id,
      name: product.name,
      category: product.category,
      unit: product.unit,
      icon: product.icon,
    })
    .from(productTag)
    .innerJoin(product, eq(productTag.productId, product.id))
    .where(eq(productTag.tag, tag.toLowerCase().trim()));
}

/**
 * Search products by name OR by tag (union of both results).
 */
export async function searchByNameOrTag(query: string) {
  if (!query || query.length < 2) return [];

  const normalizedQuery = query.toLowerCase().trim();
  const likePattern = `%${escapeLike(normalizedQuery)}%`;

  // Products matching by name
  const byName = db
    .select({
      id: product.id,
      name: product.name,
      category: product.category,
      unit: product.unit,
      icon: product.icon,
      imageUrl: product.imageUrl,
    })
    .from(product)
    .where(ilike(product.name, likePattern))
    .limit(15);

  // Products matching by tag
  const byTag = db
    .selectDistinct({
      id: product.id,
      name: product.name,
      category: product.category,
      unit: product.unit,
      icon: product.icon,
      imageUrl: product.imageUrl,
    })
    .from(productTag)
    .innerJoin(product, eq(productTag.productId, product.id))
    .where(ilike(productTag.tag, likePattern))
    .limit(15);

  const [nameResults, tagResults] = await Promise.all([byName, byTag]);

  // Deduplicate by product ID, prioritize name matches
  const seen = new Set<string>();
  const results: typeof nameResults = [];

  for (const r of nameResults) {
    if (!seen.has(r.id)) {
      seen.add(r.id);
      results.push(r);
    }
  }
  for (const r of tagResults) {
    if (!seen.has(r.id)) {
      seen.add(r.id);
      results.push(r);
    }
  }

  return results.slice(0, 15);
}

/**
 * Get tags for a single product.
 */
export async function getProductTags(productId: string) {
  return db
    .select({ tag: productTag.tag, source: productTag.source })
    .from(productTag)
    .where(eq(productTag.productId, productId));
}

/**
 * Get tags for multiple products in a single query.
 */
export async function getProductsTagsBulk(productIds: string[]) {
  if (productIds.length === 0) return new Map<string, string[]>();

  const rows = await db
    .select({
      productId: productTag.productId,
      tag: productTag.tag,
    })
    .from(productTag)
    .where(inArray(productTag.productId, productIds));

  const result = new Map<string, string[]>();
  for (const row of rows) {
    const tags = result.get(row.productId) ?? [];
    tags.push(row.tag);
    result.set(row.productId, tags);
  }
  return result;
}

/**
 * Remove specific tags from a product.
 */
export async function removeTags(productId: string, tags: string[]) {
  if (tags.length === 0) return;

  await db
    .delete(productTag)
    .where(
      and(
        eq(productTag.productId, productId),
        inArray(
          productTag.tag,
          tags.map((t) => t.toLowerCase().trim()),
        ),
      ),
    );
}

/**
 * Deterministic auto-tagging based on product name and category.
 * Uses CATEGORY_TAGS and NAME_TAG_RULES from constants.
 */
export async function autoTagProduct(
  productId: string,
  name: string,
  category: string,
) {
  const tags: string[] = [];

  // 1. Category-based tags
  const categoryTags = CATEGORY_TAGS[category as Category];
  if (categoryTags) {
    tags.push(...categoryTags);
  }

  // 2. Name-based tags using regex rules
  for (const [regex, nameTags] of NAME_TAG_RULES) {
    if (regex.test(name)) {
      tags.push(...nameTags);
    }
  }

  if (tags.length > 0) {
    await addTags(productId, tags, "system");
  }

  return tags;
}

/**
 * Bulk auto-tag multiple products.
 */
export async function autoTagProducts(
  products: { productId: string; name: string; category: string }[],
) {
  if (products.length === 0) return;

  const allValues: { id: string; productId: string; tag: string; source: TagSource }[] = [];

  for (const p of products) {
    const tags = new Set<string>();

    // Category-based tags
    const categoryTags = CATEGORY_TAGS[p.category as Category];
    if (categoryTags) {
      for (const t of categoryTags) tags.add(t);
    }

    // Name-based tags
    for (const [regex, nameTags] of NAME_TAG_RULES) {
      if (regex.test(p.name)) {
        for (const t of nameTags) tags.add(t);
      }
    }

    for (const tag of tags) {
      allValues.push({
        id: crypto.randomUUID(),
        productId: p.productId,
        tag: tag.toLowerCase().trim(),
        source: "system",
      });
    }
  }

  if (allValues.length > 0) {
    await db
      .insert(productTag)
      .values(allValues)
      .onConflictDoNothing({ target: [productTag.productId, productTag.tag] });
  }
}
