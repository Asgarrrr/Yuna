"use server";

import { devToolsMiddleware } from "@ai-sdk/devtools";
import { openai } from "@ai-sdk/openai";
import { generateText, stepCountIs, tool, wrapLanguageModel } from "ai";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { inventoryItem, product, shoppingListItem } from "@/lib/db/schema";
import { CATEGORIES, PURCHASE_UNITS, type StockStatus } from "@/lib/grocery/constants";

import { enrichProducts, getProductByBarcode } from "@/lib/grocery/openfoodfacts";
import {
  bulkUpsertFromReceipt,
  findProductByName,
  getNextSortOrder,
  getOrCreateActiveList,
  getProductPurchaseHistory,
  getPurchaseFrequency,
  getStockByProductNames,
  getStockSummary,
  incrementProductUsage,
  recordPurchase,
  searchProductsCatalog,
  updateProductOFF,
  updateStockStatus,
  upsertStockItem,
} from "@/lib/grocery/queries";

const baseModel = openai("gpt-4o-mini");
const model =
  process.env.NODE_ENV === "development"
    ? wrapLanguageModel({ model: baseModel, middleware: devToolsMiddleware() })
    : baseModel;

// ── AI Add ────────────────────────────────────────────────

export async function addItemsWithAI(input: string) {
  if (!input.trim() || input.length > 500) {
    throw new Error("Input invalide");
  }

  const session = await getSession();
  const list = await getOrCreateActiveList(session.user.id);

  const { steps } = await generateText({
    model,
    system: `Tu es un assistant pour une liste de courses familiale française.
L'utilisateur peut :
1. Ajouter des produits à sa liste de courses (ex: "Ajoute du lait", "Il me faut des pâtes et du beurre")
2. Signaler un manque / épuisement de stock (ex: "Y'a plus de pâtes", "On n'a plus de crème", "Il reste un peu de beurre")
3. Demander ce qu'il a en stock (ex: "qu'est-ce que j'ai en stock ?", "mon stock")
4. Mentionner une recette ou un repas (ex: "je fais des pâtes carbo ce soir", "pizza maison")

RÈGLES :
- Si l'utilisateur mentionne une RECETTE ou un REPAS → utilise TOUJOURS checkStock d'abord pour vérifier les ingrédients nécessaires, puis n'ajoute QUE ce qui manque (status "out" ou non tracké).
- Si l'utilisateur demande un BILAN DU STOCK → utilise getFullStock et résume le contenu.
- Si l'utilisateur veut AJOUTER à la liste → cherche dans le catalogue (searchCatalog), crée si nécessaire (createProduct), puis addItem.
- Si l'utilisateur SIGNALE UN MANQUE ("y'a plus de", "on n'a plus de", "il n'y a plus de", "c'est fini") → utilise updateStock avec status "out". Le produit sera automatiquement ajouté à la liste.
- Si l'utilisateur signale un STOCK BAS ("il reste un peu de", "presque plus de") → utilise updateStock avec status "low".
- Ne laisse JAMAIS productId vide — utilise toujours l'id retourné par searchCatalog ou createProduct.
- Appelle les tools pour TOUS les produits en un seul step quand possible.

Catégories : ${CATEGORIES.map((c) => c.value).join(", ")}
Unités : ${PURCHASE_UNITS.map((u) => u.value).join(", ")}

Sois concis. Confirme simplement ce que tu as fait.`,
    prompt: input,
    tools: {
      searchCatalog: tool({
        description: "Cherche un produit dans le catalogue interne",
        inputSchema: z.object({
          query: z.string().describe("Nom du produit à chercher"),
        }),
        execute: async ({ query }) => {
          const results = await searchProductsCatalog(query);
          return results.length > 0
            ? { found: true, products: results }
            : { found: false };
        },
      }),
      createProduct: tool({
        description:
          "Crée un nouveau produit dans le catalogue. Retourne l'id du produit créé.",
        inputSchema: z.object({
          name: z.string().describe("Nom générique simplifié du produit (ex: Lait demi-écrémé)"),
          category: z.string().describe("Catégorie du produit"),
          unit: z.string().default("piece").describe("Unité d'achat par défaut"),
        }),
        execute: async ({ name, category, unit }) => {
          const id = crypto.randomUUID();
          await db.insert(product).values({
            id,
            name,
            category,
            unit,
            createdBy: session.user.id,
          });
          return { id, name, category };
        },
      }),
      addItem: tool({
        description: "Ajoute un article à la liste de courses. productId est OBLIGATOIRE.",
        inputSchema: z.object({
          productId: z.string().describe("ID du produit (depuis searchCatalog ou createProduct)"),
          quantity: z.number().default(1).describe("Quantité"),
          unit: z.string().default("piece").describe("Unité"),
        }),
        execute: async ({ productId, quantity, unit }) => {
          const sortOrder = await getNextSortOrder(list.id);
          await incrementProductUsage(productId);

          await db.insert(shoppingListItem).values({
            id: crypto.randomUUID(),
            listId: list.id,
            productId,
            customName: null,
            quantity,
            unit,
            sortOrder,
            addedBy: session.user.id,
          });

          return { added: true, productId, quantity, unit };
        },
      }),
      updateStock: tool({
        description:
          "Met à jour le statut d'un produit en stock (in_stock, low, out). Utilise quand l'utilisateur signale un manque ou un stock bas. Si status=out, le produit est automatiquement ajouté à la liste de courses.",
        inputSchema: z.object({
          productId: z.string().describe("ID du produit (depuis searchCatalog ou createProduct)"),
          status: z.enum(["in_stock", "low", "out"]).describe("Nouveau statut du stock"),
        }),
        execute: async ({ productId, status }) => {
          await upsertStockItem(productId, status, session.user.id);

          // If out of stock, automatically add to shopping list
          if (status === "out") {
            const sortOrder = await getNextSortOrder(list.id);
            await incrementProductUsage(productId);
            await db.insert(shoppingListItem).values({
              id: crypto.randomUUID(),
              listId: list.id,
              productId,
              customName: null,
              quantity: 1,
              unit: "piece",
              sortOrder,
              addedBy: session.user.id,
            });
            return { updated: true, productId, status, addedToList: true };
          }

          return { updated: true, productId, status, addedToList: false };
        },
      }),
      checkStock: tool({
        description:
          "Vérifie le stock pour une liste de noms de produits. Utilise TOUJOURS ce tool quand l'utilisateur mentionne une recette ou un repas, pour ne pas ajouter ce qu'il a déjà.",
        inputSchema: z.object({
          productNames: z.array(z.string()).describe("Liste des noms de produits/ingrédients à vérifier"),
        }),
        execute: async ({ productNames }) => {
          const results = await getStockByProductNames(productNames);
          return {
            products: results.map((r) => ({
              productId: r.productId,
              name: r.productName,
              status: r.status ?? "not_tracked",
            })),
          };
        },
      }),
      getFullStock: tool({
        description:
          "Retourne un résumé complet de tout le stock avec nom, statut et catégorie. Utilise quand l'utilisateur demande ce qu'il a en stock.",
        inputSchema: z.object({}),
        execute: async () => {
          const items = await getStockSummary();
          return {
            items: items.map((i) => ({
              productId: i.productId,
              name: i.productName,
              status: i.status,
              category: i.category,
            })),
          };
        },
      }),
    },
    stopWhen: stepCountIs(7),
    timeout: { totalMs: 30_000, stepMs: 10_000 },
    onStepFinish({ stepNumber, toolCalls, toolResults }) {
      console.log(`[grocery] step ${stepNumber}:`, {
        calls: toolCalls.map((tc) => tc.toolName),
        results: toolResults.length,
      });
    },
  });

  console.log("[grocery] done:", steps.length, "steps");
  revalidatePath("/grocery");
}

// ── Mutations ─────────────────────────────────────────────

export async function toggleItem(itemId: string) {
  const session = await getSession();
  const list = await getOrCreateActiveList(session.user.id);

  const [item] = await db
    .select({
      checked: shoppingListItem.checked,
      productId: shoppingListItem.productId,
    })
    .from(shoppingListItem)
    .where(
      and(
        eq(shoppingListItem.id, itemId),
        eq(shoppingListItem.listId, list.id),
      ),
    )
    .limit(1);

  if (!item) return;

  const newChecked = !item.checked;

  await db
    .update(shoppingListItem)
    .set({
      checked: newChecked,
      checkedAt: newChecked ? new Date() : null,
    })
    .where(
      and(
        eq(shoppingListItem.id, itemId),
        eq(shoppingListItem.listId, list.id),
      ),
    );

  // When checking an item (= purchased), upsert stock as in_stock + record purchase
  if (newChecked && item.productId) {
    await upsertStockItem(item.productId, "in_stock", session.user.id);
    await recordPurchase({
      productId: item.productId,
      source: "list_check",
      userId: session.user.id,
    });
  }

  revalidatePath("/grocery");
}

export async function updateItemQuantity(itemId: string, quantity: number) {
  const session = await getSession();
  if (quantity < 1) return;

  const list = await getOrCreateActiveList(session.user.id);

  await db
    .update(shoppingListItem)
    .set({ quantity })
    .where(
      and(
        eq(shoppingListItem.id, itemId),
        eq(shoppingListItem.listId, list.id),
      ),
    );

  revalidatePath("/grocery");
}

export async function removeItem(itemId: string) {
  const session = await getSession();
  const list = await getOrCreateActiveList(session.user.id);

  await db
    .delete(shoppingListItem)
    .where(
      and(
        eq(shoppingListItem.id, itemId),
        eq(shoppingListItem.listId, list.id),
      ),
    );

  revalidatePath("/grocery");
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

  revalidatePath("/grocery");
}

// ── Stock mutations ───────────────────────────────────────

const nextStatusMap: Record<StockStatus, StockStatus> = {
  in_stock: "low",
  low: "out",
  out: "in_stock",
};

export async function cycleStockStatus(productId: string, currentStatus: string) {
  const nextStatus = nextStatusMap[currentStatus as StockStatus] ?? "in_stock";

  await updateStockStatus(productId, nextStatus);
  revalidatePath("/grocery");
}

export async function addOutOfStockToList(productId: string) {
  const session = await getSession();
  const list = await getOrCreateActiveList(session.user.id);

  // Check if already on active list
  const [existing] = await db
    .select({ id: shoppingListItem.id })
    .from(shoppingListItem)
    .where(
      and(
        eq(shoppingListItem.listId, list.id),
        eq(shoppingListItem.productId, productId),
      ),
    )
    .limit(1);

  if (existing) return;

  const sortOrder = await getNextSortOrder(list.id);
  await incrementProductUsage(productId);

  await db.insert(shoppingListItem).values({
    id: crypto.randomUUID(),
    listId: list.id,
    productId,
    customName: null,
    quantity: 1,
    unit: "piece",
    sortOrder,
    addedBy: session.user.id,
  });

  revalidatePath("/grocery");
}

export async function addSuggestionToList(productId: string) {
  await addOutOfStockToList(productId);
}

export async function setStockLocation(productId: string, location: string) {
  await db
    .update(inventoryItem)
    .set({ location })
    .where(eq(inventoryItem.productId, productId));

  revalidatePath("/grocery");
}

export async function removeStockItem(productId: string) {
  await db
    .delete(inventoryItem)
    .where(eq(inventoryItem.productId, productId));

  revalidatePath("/grocery");
}

export async function setStockExpiry(productId: string, expiresAt: string | null) {
  await db
    .update(inventoryItem)
    .set({ expiresAt: expiresAt ? new Date(expiresAt) : null })
    .where(eq(inventoryItem.productId, productId));

  revalidatePath("/grocery");
}

// ── Product details ──────────────────────────────────────

export async function getProductDetails(productId: string) {
  await getSession();

  const [frequency, history] = await Promise.all([
    getPurchaseFrequency(productId),
    getProductPurchaseHistory(productId),
  ]);

  return { frequency, history };
}

// ── Barcode ──────────────────────────────────────────────

export async function lookupBarcode(barcode: string) {
  await getSession();

  // Check local DB first
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
    .where(eq(product.barcode, barcode))
    .limit(1);

  if (localProduct) {
    return {
      barcode,
      productName: localProduct.name,
      brand: localProduct.brand,
      genericName: localProduct.genericName,
      nutriscoreGrade: localProduct.nutriscoreGrade,
      imageSmallUrl: localProduct.imageSmallUrl,
      existingProductId: localProduct.id,
    };
  }

  // Lookup on OpenFoodFacts
  const offResult = await getProductByBarcode(barcode);

  return {
    barcode,
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
  const session = await getSession();
  let productId = data.existingProductId;

  if (!productId) {
    // Try to find by name
    let foundByName = false;
    if (data.productName) {
      const existing = await findProductByName(data.productName);
      if (existing) {
        productId = existing.id;
        foundByName = true;
      }
    }

    if (foundByName && productId) {
      // Existing product found by name — enrich with barcode + OFF data
      await db
        .update(product)
        .set({
          barcode: data.barcode,
          brand: data.brand ?? undefined,
          genericName: data.genericName ?? undefined,
          nutriscoreGrade: data.nutriscoreGrade ?? undefined,
          imageSmallUrl: data.imageSmallUrl ?? undefined,
        })
        .where(eq(product.id, productId));
    } else {
      // Create new product
      productId = crypto.randomUUID();
      await db.insert(product).values({
        id: productId,
        name: data.productName || `Produit ${data.barcode}`,
        category: "other",
        unit: "piece",
        barcode: data.barcode,
        brand: data.brand,
        genericName: data.genericName,
        nutriscoreGrade: data.nutriscoreGrade,
        imageSmallUrl: data.imageSmallUrl,
        createdBy: session.user.id,
      });
    }
  }

  if (data.target === "stock") {
    await upsertStockItem(productId, "in_stock", session.user.id);
  } else {
    const list = await getOrCreateActiveList(session.user.id);
    const sortOrder = await getNextSortOrder(list.id);
    await incrementProductUsage(productId);
    await db.insert(shoppingListItem).values({
      id: crypto.randomUUID(),
      listId: list.id,
      productId,
      customName: null,
      quantity: 1,
      unit: "piece",
      sortOrder,
      addedBy: session.user.id,
    });
  }

  await recordPurchase({
    productId,
    source: "barcode",
    userId: session.user.id,
  });

  revalidatePath("/grocery");
}

// ── Receipt commit ───────────────────────────────────────

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
  const session = await getSession();

  const mergedItems = items.map((item) => ({
    rawName: item.humanName,
    humanName: item.humanName,
    category: item.category,
    quantity: item.quantity,
    unit: item.unit,
    unitPrice: item.unitPrice,
    totalPrice: item.totalPrice,
  }));

  const { productIds, newProducts } = await bulkUpsertFromReceipt(mergedItems, session.user.id);

  // Record purchase for each item using IDs already resolved by bulkUpsert
  for (let i = 0; i < mergedItems.length; i++) {
    const item = mergedItems[i];
    const productId = productIds[i];
    if (!productId) continue;

    await recordPurchase({
      productId,
      price: item.unitPrice ?? item.totalPrice,
      storeName,
      quantity: item.quantity,
      source: "receipt",
      userId: session.user.id,
    });
  }

  // Enrich new products via OpenFoodFacts after response
  if (newProducts.length > 0) {
    after(async () => {
      try {
        const results = await enrichProducts(newProducts);
        for (const [productId, data] of results) {
          await updateProductOFF(productId, data);
        }
        revalidatePath("/grocery");
        console.log(`[receipt] Enriched ${results.size}/${newProducts.length} products via OFF`);
      } catch (err) {
        console.error("[receipt] OFF enrichment failed:", err);
      }
    });
  }

  revalidatePath("/grocery");
  return { count: items.length };
}

