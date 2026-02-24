import { devToolsMiddleware } from "@ai-sdk/devtools";
import { openai } from "@ai-sdk/openai";
import { Output, generateText, streamObject, wrapLanguageModel } from "ai";
import { getSession } from "@/lib/auth/session";
import { CATEGORIES, PURCHASE_UNITS } from "@/lib/grocery/constants";
import { rawReceiptSchema, streamingReceiptSchema } from "@/lib/grocery/receipt-schema";

const baseModel = openai("gpt-4o-mini");
const model =
  process.env.NODE_ENV === "development"
    ? wrapLanguageModel({ model: baseModel, middleware: devToolsMiddleware() })
    : baseModel;

const visionBaseModel = openai("gpt-4o");
const visionModel =
  process.env.NODE_ENV === "development"
    ? wrapLanguageModel({ model: visionBaseModel, middleware: devToolsMiddleware() })
    : visionBaseModel;

export async function POST(request: Request) {
  await getSession();

  const { base64Data, mediaType } = await request.json();

  if (!base64Data || !mediaType) {
    return Response.json({ error: "missing_data" }, { status: 400 });
  }

  // ── Step 1: Raw OCR extraction (blocking) ──────────────────
  const fileContent: Array<
    | { type: "text"; text: string }
    | { type: "image"; image: string }
    | { type: "file"; data: string; mediaType: string }
  > = [
    {
      type: "text",
      text: `Tu es un OCR spécialisé pour les tickets de caisse français.

TÂCHE : Lis ce ticket de caisse et extrais CHAQUE ligne visible, dans l'ordre.

RÈGLES STRICTES :
- Recopie le texte de chaque ligne EXACTEMENT comme il apparaît (majuscules, abréviations, codes)
- Pour chaque ligne, indique le prix s'il y en a un (le nombre à droite, en euros)
- Marque isProduct=true UNIQUEMENT pour les lignes qui sont des produits achetés
- Marque isProduct=false pour : remises, réductions, sous-totaux, totaux, TVA, moyens de paiement, messages, lignes vides, numéros de carte, etc.
- Si une ligne contient un poids variable (ex: "0,411 kg"), c'est probablement le détail de la ligne précédente — marque-la isProduct=false
- Les lignes de type "x 2,99 €/kg" sont des détails de prix au kilo — marque-les isProduct=false
- Identifie le nom du magasin et la date si visible`,
    },
  ];

  if (mediaType === "application/pdf") {
    fileContent.push({ type: "file", data: base64Data, mediaType: "application/pdf" });
  } else {
    fileContent.push({ type: "image", image: base64Data });
  }

  const { output: rawReceipt } = await generateText({
    model: visionModel,
    output: Output.object({ schema: rawReceiptSchema }),
    messages: [{ role: "user", content: fileContent }],
    timeout: { totalMs: 60_000 },
  });

  if (!rawReceipt || rawReceipt.rawLines.length === 0) {
    return Response.json({ error: "no_products" }, { status: 200 });
  }

  const productLines = rawReceipt.rawLines.filter((l) => l.isProduct);

  if (productLines.length === 0) {
    return Response.json({ error: "no_products" }, { status: 200 });
  }

  console.log(`[receipt-stream] Step 1: ${productLines.length} product lines from ${rawReceipt.storeName ?? "?"}`);

  // ── Step 2: Stream refined products ────────────────────────
  const productListText = productLines
    .map((l, i) => `${i + 1}. "${l.text}" → ${l.price != null ? `${l.price} €` : "prix inconnu"}`)
    .join("\n");

  const result = streamObject({
    model,
    schema: streamingReceiptSchema,
    system: `Tu es un expert en produits de supermarché français.

TÂCHE : On te donne des lignes brutes extraites d'un ticket de caisse ${rawReceipt.storeName ? `(${rawReceipt.storeName})` : ""}. Pour chaque ligne, produis un nom de produit propre et complet.

RÈGLES DE NOMMAGE (très important) :
- Transforme les abréviations en noms complets et naturels
- Inclus la marque si elle est reconnaissable dans le texte (ex: "CRISTALINE" → "Cristaline", "COCA" → "Coca-Cola")
- Inclus le format/poids/volume s'il est mentionné (ex: "1.25L", "500g", "4 tranches")
- Le nom doit être celui qu'on utiliserait naturellement à l'oral : "Tagliatelles Barilla 500g", "Eau Cristaline 1.5L", "Jambon supérieur Herta"
- JAMAIS de codes internes, de références, ni de texte incompréhensible
- Si tu ne reconnais pas du tout un produit, fais de ton mieux avec le contexte (enseigne, prix, mots-clés)

EXEMPLES de transformations :
- "500G TAGLIATELLE P" → "Tagliatelles 500g"
- "PET 1.25L COCA CO" → "Coca-Cola 1.25L"
- "CRISTALINE 6X1.5L" → "Eau Cristaline 6x1.5L"
- "LES CROISÉS FROMA" → "Fromage Les Croisés"
- "BIO LARDONS FUMES" → "Lardons fumés bio"
- "PQ CONFORT X12" → "Papier toilette Confort x12"
- "BAGUETTE 250G" → "Baguette 250g"
- "MM PIZZA ROYALE" → "Pizza royale Marie"

CATÉGORIES : ${CATEGORIES.map((c) => `${c.value} (${c.label})`).join(", ")}
UNITÉS : ${PURCHASE_UNITS.map((u) => `${u.value} (${u.label})`).join(", ")}

- storeName = "${rawReceipt.storeName ?? ""}"
- date = "${rawReceipt.date ?? ""}"
- quantity = 1 sauf si le ticket indique explicitement une quantité multiple (ex: "x2", "QTE: 3")
- Si le poids est dans le nom (ex: "0.411kg"), l'unité est "kg" et la quantité le poids
- Retourne EXACTEMENT le même nombre de produits que de lignes fournies, dans le même ordre
- Merge les prix de la liste brute : utilise le prix fourni pour totalPrice si l'item n'en a pas`,
    prompt: productListText,
    timeout: { totalMs: 30_000 },
  });

  return result.toTextStreamResponse();
}
