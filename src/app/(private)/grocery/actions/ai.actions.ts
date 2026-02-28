"use server";

import { generateText, stepCountIs } from "ai";
import { model } from "@/lib/ai/models";
import { getSession } from "@/lib/auth/session";
import { CATEGORIES, PURCHASE_UNITS } from "@/lib/grocery/constants";
import { getActiveListWithItems } from "@/lib/grocery/queries";
import { createGroceryTools } from "./ai.tools";
import { revalidateGrocery } from "./shared";

export async function addItemsWithAI(input: string) {
  if (!input.trim() || input.length > 500) {
    throw new Error("Input invalide");
  }

  const session = await getSession();
  const { list, items: currentListItems } = await getActiveListWithItems(session.user.id);

  // Build current list context for the AI prompt
  const listContext = currentListItems.length > 0
    ? `\n\nListe de courses actuelle (${currentListItems.length} articles) :\n${currentListItems.map((i) => `- ${i.productName ?? i.customName ?? "?"} ×${i.quantity}${i.checked ? " ✓" : ""}`).join("\n")}`
    : "";

  try {
    const { steps, text } = await generateText({
      model: model,
      system: `Tu es un assistant pour une liste de courses familiale française.
L'utilisateur peut :
1. Ajouter des produits à sa liste de courses (ex: "Ajoute du lait", "Il me faut des pâtes et du beurre")
2. Signaler un manque / épuisement de stock (ex: "Y'a plus de pâtes", "On n'a plus de crème", "Il reste un peu de beurre")
3. Demander ce qu'il a en stock (ex: "qu'est-ce que j'ai en stock ?", "mon stock")
4. Mentionner une recette ou un repas (ex: "je fais des pâtes carbo ce soir", "pizza maison")
5. Tagger un produit (ex: "les tagliatelles c'est des pâtes")

RÈGLES :
- Si l'utilisateur mentionne une RECETTE ou un REPAS → utilise TOUJOURS checkStock d'abord pour vérifier les ingrédients nécessaires, puis n'ajoute QUE ce qui manque (status "out" ou non tracké).
- Si l'utilisateur demande un BILAN DU STOCK → utilise getFullStock et résume le contenu.
- Si l'utilisateur veut AJOUTER à la liste → cherche dans le catalogue (searchCatalog), crée si nécessaire (createProduct), puis addItem.
- Si l'utilisateur SIGNALE UN MANQUE ("y'a plus de", "on n'a plus de", "il n'y a plus de", "c'est fini") → utilise updateStock avec status "out". Le produit sera automatiquement ajouté à la liste de courses.
- Si l'utilisateur signale un STOCK BAS ("il reste un peu de", "presque plus de") → utilise updateStock avec status "low".
- Ne laisse JAMAIS productId vide — utilise toujours l'id retourné par searchCatalog ou createProduct.
- Appelle les tools pour TOUS les produits en un seul step quand possible.
- searchCatalog cherche aussi par tags/alias : "pâtes" trouvera tagliatelles, macaroni, etc.
- checkStock cherche aussi par tags : pour "pâtes carbo", il trouvera les tagliatelles ou macaroni via le tag "pâtes".
- Si un produit est DÉJÀ sur la liste, ne l'ajoute PAS en double (augmente la quantité si besoin).

Catégories : ${CATEGORIES.map((c) => c.value).join(", ")}
Unités : ${PURCHASE_UNITS.map((u) => u.value).join(", ")}${listContext}

Sois concis. Confirme simplement ce que tu as fait.`,
      prompt: input,
      tools: createGroceryTools(session, list),
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
    return { message: text };
  } catch (error) {
    console.error("[grocery] AI failed:", error);
    return { error: "ai_failed" };
  }
}
