"use server";

import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { inventoryItem } from "@/lib/db/schema";
import { NEXT_STATUS, type StockStatus } from "@/lib/grocery/constants";
import {
  getProductPurchaseHistory,
  getPurchaseFrequency,
  updateStockStatus,
} from "@/lib/grocery/queries";
import {
  locationSchema,
  revalidateGrocery,
  stockStatusSchema,
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

  const session = await getSession();

  const nextStatus =
    NEXT_STATUS[parsedCurrentStatus.data as StockStatus] ?? "in_stock";

  await updateStockStatus(parsedProductId.data, nextStatus, session.user.id);
  revalidateGrocery("grocery-stock", "grocery-suggestions");
}

export async function setStockLocation(productId: string, location: string) {
  const parsedProductId = uuidSchema.safeParse(productId);
  const parsedLocation = locationSchema.safeParse(location);
  if (!parsedProductId.success || !parsedLocation.success) {
    throw new Error("Emplacement invalide");
  }

  const session = await getSession();

  await db
    .update(inventoryItem)
    .set({ location: parsedLocation.data })
    .where(
      and(
        eq(inventoryItem.productId, parsedProductId.data),
        eq(inventoryItem.addedBy, session.user.id),
      ),
    );

  revalidateGrocery("grocery-stock");
}

export async function removeStockItem(productId: string) {
  const parsedProductId = uuidSchema.safeParse(productId);
  if (!parsedProductId.success) {
    throw new Error("Identifiant de produit invalide");
  }

  const session = await getSession();

  await db
    .delete(inventoryItem)
    .where(
      and(
        eq(inventoryItem.productId, parsedProductId.data),
        eq(inventoryItem.addedBy, session.user.id),
      ),
    );

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

  const session = await getSession();

  await db
    .update(inventoryItem)
    .set({ expiresAt: parsedExpiry.data ? new Date(parsedExpiry.data) : null })
    .where(
      and(
        eq(inventoryItem.productId, parsedProductId.data),
        eq(inventoryItem.addedBy, session.user.id),
      ),
    );

  revalidateGrocery("grocery-stock");
}

export async function getProductDetails(productId: string) {
  await getSession();

  const [frequency, history] = await Promise.all([
    getPurchaseFrequency(productId),
    getProductPurchaseHistory(productId),
  ]);

  return { frequency, history };
}
