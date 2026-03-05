"use server";

import { eq } from "drizzle-orm";
import { z } from "zod";
import { getSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { inventoryItem } from "@/lib/db/schema";
import { NEXT_STATUS, type StockStatus } from "@/lib/grocery/constants";
import {
  addTags,
  getProductDetails as getProductDetailsQuery,
  removeTags,
  updateStockStatus,
} from "@/lib/grocery/queries";
import {
  locationSchema,
  revalidateGrocery,
  stockStatusSchema,
  tagSchema,
  uuidSchema,
} from "./shared";

export async function cycleStockStatus(
  productId: string,
  currentStatus: string,
) {
  const parsedProductId = uuidSchema.safeParse(productId);
  const parsedCurrentStatus = stockStatusSchema.safeParse(currentStatus);
  if (!parsedProductId.success || !parsedCurrentStatus.success) {
    throw new Error("Statut de stock invalide");
  }

  await getSession();

  const nextStatus =
    NEXT_STATUS[parsedCurrentStatus.data as StockStatus] ?? "in_stock";

  await updateStockStatus(parsedProductId.data, nextStatus);
  revalidateGrocery("grocery-stock", "grocery-suggestions");
}

export async function setStockLocation(productId: string, location: string) {
  const parsedProductId = uuidSchema.safeParse(productId);
  const parsedLocation = locationSchema.safeParse(location);
  if (!parsedProductId.success || !parsedLocation.success) {
    throw new Error("Emplacement invalide");
  }

  await getSession();

  await db
    .update(inventoryItem)
    .set({ location: parsedLocation.data })
    .where(eq(inventoryItem.productId, parsedProductId.data));

  revalidateGrocery("grocery-stock");
}

export async function removeStockItem(productId: string) {
  const parsedProductId = uuidSchema.safeParse(productId);
  if (!parsedProductId.success) {
    throw new Error("Identifiant de produit invalide");
  }

  await getSession();

  await db
    .delete(inventoryItem)
    .where(eq(inventoryItem.productId, parsedProductId.data));

  revalidateGrocery("grocery-stock", "grocery-suggestions");
}

export async function setStockExpiry(
  productId: string,
  expiresAt: string | null,
) {
  const parsedProductId = uuidSchema.safeParse(productId);
  const parsedExpiry = z
    .union([z.string().datetime(), z.null()])
    .safeParse(expiresAt);
  if (!parsedProductId.success || !parsedExpiry.success) {
    throw new Error("Date d'expiration invalide");
  }

  await getSession();

  await db
    .update(inventoryItem)
    .set({ expiresAt: parsedExpiry.data ? new Date(parsedExpiry.data) : null })
    .where(eq(inventoryItem.productId, parsedProductId.data));

  revalidateGrocery("grocery-stock");
}

export async function getProductDetails(productId: string) {
  const parsedProductId = uuidSchema.safeParse(productId);
  if (!parsedProductId.success) {
    throw new Error("Identifiant de produit invalide");
  }

  await getSession();
  return getProductDetailsQuery(parsedProductId.data);
}

export async function addProductTag(productId: string, tag: string) {
  const parsedProductId = uuidSchema.safeParse(productId);
  const parsedTag = tagSchema.safeParse(tag);
  if (!parsedProductId.success || !parsedTag.success) {
    throw new Error("Tag ou identifiant invalide");
  }

  await getSession();
  await addTags(parsedProductId.data, [parsedTag.data], "user");
  revalidateGrocery("grocery-stock");
}

export async function removeProductTag(productId: string, tag: string) {
  const parsedProductId = uuidSchema.safeParse(productId);
  const parsedTag = tagSchema.safeParse(tag);
  if (!parsedProductId.success || !parsedTag.success) {
    throw new Error("Tag ou identifiant invalide");
  }

  await getSession();
  await removeTags(parsedProductId.data, [parsedTag.data]);
  revalidateGrocery("grocery-stock");
}
