"use server";

import { devToolsMiddleware } from "@ai-sdk/devtools";
import { openai } from "@ai-sdk/openai";
import { generateText, stepCountIs, tool, wrapLanguageModel } from "ai";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { inventoryItem, product, shoppingListItem } from "@/lib/db/schema";
import { CATEGORIES, PURCHASE_UNITS } from "@/lib/grocery/constants";

import {
  getNextSortOrder,
  getOrCreateActiveList,
  incrementProductUsage,
  searchProductsCatalog,
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

RÈGLES :
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
    },
    stopWhen: stepCountIs(5),
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

  // When checking an item (= purchased), upsert stock as in_stock
  if (newChecked && item.productId) {
    await upsertStockItem(item.productId, "in_stock", session.user.id);
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

export async function cycleStockStatus(productId: string, currentStatus: string) {
  const nextStatus =
    currentStatus === "in_stock"
      ? "low"
      : currentStatus === "low"
        ? "out"
        : "in_stock";

  await updateStockStatus(productId, nextStatus as "in_stock" | "low" | "out");
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
