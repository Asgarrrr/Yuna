import "server-only";

import { tool } from "ai";
import { and, eq, ilike } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { product, shoppingListItem } from "@/lib/db/schema";
import {
  addTags,
  getNextSortOrder,
  getStockByNamesOrTags,
  getStockSummary,
  incrementProductUsage,
  searchByNameOrTag,
  upsertStockItem,
} from "@/lib/grocery/queries";
import { autoTagProduct } from "@/lib/grocery/queries/tag.queries";

export function createGroceryTools(
  session: { user: { id: string } },
  list: { id: string },
) {
  // Local cache for search results within this tool invocation
  const searchCache = new Map<string, Awaited<ReturnType<typeof searchByNameOrTag>>>();

  return {
    searchCatalog: tool({
      description:
        "Cherche un produit dans le catalogue interne par nom OU par tag/alias. Ex: 'pâtes' trouvera aussi tagliatelles.",
      inputSchema: z.object({
        query: z.string().describe("Nom ou tag du produit à chercher"),
      }),
      execute: async ({ query }) => {
        const cacheKey = query.toLowerCase().trim();
        let results = searchCache.get(cacheKey);
        if (!results) {
          results = await searchByNameOrTag(query);
          searchCache.set(cacheKey, results);
        }
        return results.length > 0
          ? { found: true, products: results }
          : { found: false };
      },
    }),
    createProduct: tool({
      description:
        "Crée un nouveau produit dans le catalogue. Auto-assigne des tags basés sur le nom et la catégorie. Retourne l'id du produit créé.",
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
        // Fuzzy dedup: check for existing similar product before creating
        const [existing] = await db
          .select({ id: product.id, name: product.name })
          .from(product)
          .where(ilike(product.name, name.trim()))
          .limit(1);

        if (existing) {
          return { id: existing.id, name: existing.name, category, alreadyExisted: true };
        }

        const id = crypto.randomUUID();
        await db.insert(product).values({
          id,
          name,
          category,
          unit,
          createdBy: session.user.id,
        });
        // Auto-tag based on name and category
        await autoTagProduct(id, name, category);
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
          .describe(
            "ID du produit (depuis searchCatalog ou createProduct)",
          ),
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

          const sortOrder = await getNextSortOrder(list.id);

          await incrementProductUsage(productId);

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
          .describe(
            "ID du produit (depuis searchCatalog ou createProduct)",
          ),
        status: z
          .enum(["in_stock", "low", "out"])
          .describe("Nouveau statut du stock"),
      }),
      execute: async ({ productId, status }) => {
        await upsertStockItem(productId, status, session.user.id);

        if (status === "out") {
          const addedToList = await db.transaction(async (tx) => {
            const [alreadyOnList] = await tx
              .select({ id: shoppingListItem.id })
              .from(shoppingListItem)
              .where(
                and(
                  eq(shoppingListItem.listId, list.id),
                  eq(shoppingListItem.productId, productId),
                ),
              )
              .limit(1);

            if (alreadyOnList) return false;

            const sortOrder = await getNextSortOrder(list.id);
            await incrementProductUsage(productId);
            await tx.insert(shoppingListItem).values({
              id: crypto.randomUUID(),
              listId: list.id,
              productId,
              customName: null,
              quantity: 1,
              unit: "piece",
              sortOrder,
              addedBy: session.user.id,
            });
            return true;
          });

          return { updated: true, productId, status, addedToList };
        }

        return { updated: true, productId, status, addedToList: false };
      },
    }),
    checkStock: tool({
      description:
        "Vérifie le stock pour une liste de noms de produits/ingrédients. Cherche aussi par tags : 'pâtes' trouvera tagliatelles, macaroni, etc. Utilise TOUJOURS ce tool quand l'utilisateur mentionne une recette ou un repas.",
      inputSchema: z.object({
        productNames: z
          .array(z.string())
          .describe("Liste des noms de produits/ingrédients à vérifier"),
      }),
      execute: async ({ productNames }) => {
        const results = await getStockByNamesOrTags(productNames);
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
    tagProduct: tool({
      description:
        "Ajoute des tags/alias à un produit existant. Utilise quand tu détectes une association pertinente (ex: tagliatelles → 'pâtes', 'féculent').",
      inputSchema: z.object({
        productId: z.string().uuid().describe("ID du produit à tagger"),
        tags: z
          .array(z.string())
          .min(1)
          .max(5)
          .describe("Tags à ajouter (2-5 tags pertinents)"),
      }),
      execute: async ({ productId, tags }) => {
        await addTags(productId, tags, "ai");
        return { tagged: true, productId, tags };
      },
    }),
  };
}
