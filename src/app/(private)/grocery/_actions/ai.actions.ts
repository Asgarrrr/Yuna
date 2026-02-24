"use server";

import { generateText, stepCountIs, tool } from "ai";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { chatModel } from "@/lib/ai/models";
import { getSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { product, shoppingListItem } from "@/lib/db/schema";
import { CATEGORIES, PURCHASE_UNITS } from "@/lib/grocery/constants";
import {
  getNextSortOrder,
  getOrCreateActiveList,
  getStockByProductNames,
  getStockSummary,
  incrementProductUsage,
  searchProductsCatalog,
  upsertStockItem,
} from "@/lib/grocery/queries";
import { revalidateGrocery } from "./shared";

export async function addItemsWithAI(input: string) {
  if (!input.trim() || input.length > 500) {
    throw new Error("Input invalide");
  }

  const session = await getSession();
  const list = await getOrCreateActiveList(session.user.id);

  const { steps } = await generateText({
    model: chatModel,
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
- Si l'utilisateur SIGNALE UN MANQUE ("y'a plus de", "on n'a plus de", "il n'y a plus de", "c'est fini") → utilise updateStock avec status "out". Le produit sera automatiquement ajouté à la liste de courses.
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
          name: z
            .string()
            .describe(
              "Nom générique simplifié du produit (ex: Lait demi-écrémé)",
            ),
          category: z.string().describe("Catégorie du produit"),
          unit: z
            .string()
            .default("piece")
            .describe("Unité d'achat par défaut"),
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
        description:
          "Ajoute un article à la liste de courses. productId est OBLIGATOIRE.",
        inputSchema: z.object({
          productId: z
            .string()
            .uuid()
            .describe("ID du produit (depuis searchCatalog ou createProduct)"),
          quantity: z.number().default(1).describe("Quantité"),
          unit: z.string().default("piece").describe("Unité"),
        }),
        execute: async ({ productId, quantity, unit }) => {
          return db.transaction(async (tx) => {
            const [existing] = await tx
              .select({ id: product.id })
              .from(product)
              .where(eq(product.id, productId))
              .limit(1);
            if (!existing) {
              return { added: false, error: "Product not found" };
            }

            const [onList] = await tx
              .select({
                id: shoppingListItem.id,
                quantity: shoppingListItem.quantity,
              })
              .from(shoppingListItem)
              .where(
                and(
                  eq(shoppingListItem.listId, list.id),
                  eq(shoppingListItem.productId, productId),
                ),
              )
              .limit(1);

            if (onList) {
              await tx
                .update(shoppingListItem)
                .set({ quantity: (onList.quantity ?? 1) + quantity })
                .where(eq(shoppingListItem.id, onList.id));
              return { added: true, productId, quantity, unit, merged: true };
            }

            const [sortResult] = await tx
              .select({
                max: sql<number>`coalesce(max(${shoppingListItem.sortOrder}), 0)`,
              })
              .from(shoppingListItem)
              .where(eq(shoppingListItem.listId, list.id));
            const sortOrder = (sortResult?.max ?? 0) + 1;

            await tx
              .update(product)
              .set({ usageCount: sql`${product.usageCount} + 1` })
              .where(eq(product.id, productId));

            await tx.insert(shoppingListItem).values({
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
          });
        },
      }),
      updateStock: tool({
        description:
          "Met à jour le statut d'un produit en stock (in_stock, low, out). Utilise quand l'utilisateur signale un manque ou un stock bas. Si status=out, le produit est automatiquement ajouté à la liste de courses.",
        inputSchema: z.object({
          productId: z
            .string()
            .uuid()
            .describe("ID du produit (depuis searchCatalog ou createProduct)"),
          status: z
            .enum(["in_stock", "low", "out"])
            .describe("Nouveau statut du stock"),
        }),
        execute: async ({ productId, status }) => {
          await upsertStockItem(productId, status, session.user.id);

          if (status === "out") {
            const [alreadyOnList] = await db
              .select({ id: shoppingListItem.id })
              .from(shoppingListItem)
              .where(
                and(
                  eq(shoppingListItem.listId, list.id),
                  eq(shoppingListItem.productId, productId),
                ),
              )
              .limit(1);

            if (!alreadyOnList) {
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
            return {
              updated: true,
              productId,
              status,
              addedToList: !alreadyOnList,
            };
          }

          return { updated: true, productId, status, addedToList: false };
        },
      }),
      checkStock: tool({
        description:
          "Vérifie le stock pour une liste de noms de produits. Utilise TOUJOURS ce tool quand l'utilisateur mentionne une recette ou un repas, pour ne pas ajouter ce qu'il a déjà.",
        inputSchema: z.object({
          productNames: z
            .array(z.string())
            .describe("Liste des noms de produits/ingrédients à vérifier"),
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
          const items = await getStockSummary(session.user.id);
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
  revalidateGrocery("grocery-list", "grocery-stock", "grocery-suggestions");
}
