import { Output, streamText } from "ai";
import { z } from "zod";
import { model } from "@/lib/ai/models";
import { getSession } from "@/lib/auth/session";
import { streamingReceiptSchema } from "@/lib/grocery/receipt-schema";

// Allow streaming responses up to 60 seconds (Vercel serverless limit)
export const maxDuration = 60;

const parseReceiptRequestSchema = z.object({
  base64Data: z.string().min(1).max(15_000_000),
  mediaType: z.string().min(1).max(200),
});

export async function POST(request: Request) {
  await getSession();

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
    const content: Array<
      | { type: "text"; text: string }
      | { type: "image"; image: string }
      | { type: "file"; data: string; mediaType: string }
    > = [
      {
        type: "text",
        text: "Lis ce ticket de caisse et extrais les produits achetés.",
      },
    ];

    if (mediaType === "application/pdf") {
      content.push({ type: "file", data: base64Data, mediaType });
    } else {
      content.push({ type: "image", image: base64Data });
    }

    const result = streamText({
      model,
      output: Output.object({ schema: streamingReceiptSchema }),
      abortSignal: request.signal,
      temperature: 0,
      maxRetries: 2,
      timeout: {
        totalMs: 55_000,
        chunkMs: 15_000,
      },
      onError({ error }) {
        console.error("[receipt] stream error:", error);
      },
      system: `Extrais les produits d'un ticket de caisse français.

GARDER : chaque ligne avec un prix qui correspond à un article acheté. NE JAMAIS fusionner : si un produit apparaît 2 fois sur le ticket, retourne 2 items séparés.

REMISES ET PRIX NET :
- Si une ligne "Remise immédiate", "RI", "Promo", ou "Remise" suit un produit, SOUSTRAIS-LA du prix de ce produit.
- unitPrice = prix NET après remise / quantité.
- totalPrice = prix total NET après remise.
- Si un même produit apparaît 2 fois avec des remises différentes, retourne 2 items avec chacun son prix net.
- IGNORE les lignes "COUPON FIDELITE", "Avantage fidélité", "Remise fidélité", et tout ce qui est lié au programme de fidélité. Applique UNIQUEMENT les remises produit immédiates.

POIDS VARIABLES :
- Les lignes comme "0,411 kg × 2,19 €/kg" sont le détail d'un produit. Utilise le poids comme quantity et "kg" comme unit.
- totalPrice = poids × prix/kg.

IGNORER : sous-totaux, totaux, TVA, paiements, messages promotionnels, lignes de caissier.

rawName : recopie exactement le texte brut de la ligne tel qu'affiché sur le ticket (ex: "PET 1.25L COCA CO", "500G TAGLIATELLE P", "VIVA BP1 LX8FF").
humanName : transforme les abréviations en noms naturels, inclus marque et format si visibles.
Ex: "500G TAGLIATELLE P"→"Tagliatelles 500g", "PET 1.25L COCA CO"→"Coca-Cola 1.25L", "MM PIZZA ROYALE"→"Pizza royale Marie"

confidence :
- "high" : le décodage est évident et sans ambiguïté (ex: "COCA COLA 1.5L" → "Coca-Cola 1.5L")
- "medium" : le décodage est une supposition raisonnable (ex: "500G TAGLIATELLE P" → "Tagliatelles 500g")
- "low" : le code est cryptique et le nom est une supposition incertaine (ex: "VIVA BP1 LX8FF" → produit inconnu)

quantity=1 sauf si la ligne indique explicitement une quantité multiple. Si poids variable, unit="kg" et quantity=le poids.`,
      messages: [{ role: "user", content }],
    });

    return result.toTextStreamResponse();
  } catch (error) {
    console.error("[receipt] parsing failed:", error);
    return Response.json({ error: "receipt_parse_failed" }, { status: 500 });
  }
}
