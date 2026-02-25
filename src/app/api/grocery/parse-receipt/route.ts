import { generateText, Output, streamText } from "ai";
import { z } from "zod";
import { chatModel, visionModel } from "@/lib/ai/models";
import { getSession } from "@/lib/auth/session";
import { CATEGORIES, PURCHASE_UNITS } from "@/lib/grocery/constants";
import {
  rawReceiptSchema,
  streamingReceiptSchema,
} from "@/lib/grocery/receipt-schema";

// Simple per-user rate limiter: max 5 requests per 60 seconds
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 5;
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

const parseReceiptRequestSchema = z.object({
  base64Data: z.string().min(1).max(15_000_000),
  mediaType: z.string().min(1).max(200),
});

export async function POST(request: Request) {
  const session = await getSession();

  // Rate limiting — clean expired entries first to prevent memory leak
  const now = Date.now();
  for (const [key, bucket] of rateLimitMap) {
    if (bucket.resetAt < now) rateLimitMap.delete(key);
  }

  const userId = session.user.id;
  const bucket = rateLimitMap.get(userId);
  if (bucket && now < bucket.resetAt) {
    if (bucket.count >= RATE_LIMIT_MAX) {
      return Response.json(
        { error: "rate_limited" },
        {
          status: 429,
          headers: {
            "Retry-After": String(Math.ceil((bucket.resetAt - now) / 1000)),
          },
        },
      );
    }
    bucket.count++;
  } else {
    rateLimitMap.set(userId, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }

  const parsed = parseReceiptRequestSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "invalid_payload" }, { status: 400 });
  }

  const { base64Data, mediaType } = parsed.data;

  if (mediaType !== "application/pdf" && !mediaType.startsWith("image/")) {
    return Response.json({ error: "unsupported_media_type" }, { status: 400 });
  }

  try {
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
      fileContent.push({
        type: "file",
        data: base64Data,
        mediaType: "application/pdf",
      });
    } else {
      fileContent.push({ type: "image", image: base64Data });
    }

    const { output: rawReceipt } = await generateText({
      model: visionModel,
      output: Output.object({ schema: rawReceiptSchema }),
      messages: [{ role: "user", content: fileContent }],
      timeout: { totalMs: 60_000 },
      abortSignal: request.signal,
    });

    if (!rawReceipt || rawReceipt.rawLines.length === 0) {
      return Response.json({ error: "no_products" }, { status: 200 });
    }

    const productLines = rawReceipt.rawLines.filter((line) => line.isProduct);

    if (productLines.length === 0) {
      return Response.json({ error: "no_products" }, { status: 200 });
    }

    console.log(
      `[receipt-stream] Step 1: ${productLines.length} product lines from ${rawReceipt.storeName ?? "?"}`,
    );

    // ── Step 2: Stream refined products ────────────────────────
    const productListText = productLines
      .map(
        (line, index) =>
          `${index + 1}. "${line.text}" → ${line.price != null ? `${line.price} €` : "prix inconnu"}`,
      )
      .join("\n");

    const result = streamText({
      model: chatModel,
      output: Output.object({ schema: streamingReceiptSchema }),
      abortSignal: request.signal,
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
  } catch (error) {
    console.error("[receipt-stream] parsing failed:", error);
    return Response.json({ error: "receipt_parse_failed" }, { status: 500 });
  }
}
