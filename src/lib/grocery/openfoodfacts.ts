import "server-only";

const BASE_URL = "https://world.openfoodfacts.org";
const USER_AGENT = "Yuna/1.0";
const RATE_LIMIT_MS = 150;

interface OFFProduct {
  code?: string;
  product_name?: string;
  brands?: string;
  generic_name?: string;
  nutriscore_grade?: string;
  image_small_url?: string;
  image_front_small_url?: string;
}

interface OFFSearchResponse {
  count: number;
  products: OFFProduct[];
}

const VALID_NUTRISCORE = new Set(["a", "b", "c", "d", "e"]);

function parseNutriscore(raw?: string): string | null {
  const grade = raw?.trim().toLowerCase() ?? "";
  return VALID_NUTRISCORE.has(grade) ? grade : null;
}

export interface OFFEnrichmentData {
  brand: string | null;
  genericName: string | null;
  nutriscoreGrade: string | null;
  offId: string | null;
  imageSmallUrl: string | null;
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface OFFBarcodeResult {
  productName: string | null;
  brand: string | null;
  genericName: string | null;
  nutriscoreGrade: string | null;
  offId: string;
  imageSmallUrl: string | null;
}

export async function getProductByBarcode(
  ean: string,
): Promise<OFFBarcodeResult | null> {
  try {
    const url = `${BASE_URL}/api/v3/product/${encodeURIComponent(ean)}.json`;
    const res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(5000),
    });

    if (!res.ok) return null;

    const data = await res.json();
    const p = data.product as OFFProduct | undefined;
    if (!p) return null;

    return {
      productName: p.product_name || null,
      brand: p.brands?.split(",")[0]?.trim() || null,
      genericName: p.generic_name || null,
      nutriscoreGrade: parseNutriscore(p.nutriscore_grade),
      offId: ean,
      imageSmallUrl: p.image_front_small_url || p.image_small_url || null,
    };
  } catch {
    return null;
  }
}

export async function searchProduct(query: string): Promise<OFFProduct[]> {
  const url = new URL("/cgi/search.pl", BASE_URL);
  url.searchParams.set("search_terms", query);
  url.searchParams.set("json", "1");
  url.searchParams.set("page_size", "3");

  const res = await fetch(url.toString(), {
    headers: { "User-Agent": USER_AGENT },
    signal: AbortSignal.timeout(5000),
  });

  if (!res.ok) return [];

  const data = (await res.json()) as OFFSearchResponse;
  return data.products ?? [];
}

export async function enrichProduct(
  productName: string,
): Promise<OFFEnrichmentData | null> {
  try {
    const products = await searchProduct(productName);
    if (products.length === 0) return null;

    const best = products[0];
    return {
      brand: best.brands?.split(",")[0]?.trim() || null,
      genericName: best.generic_name || null,
      nutriscoreGrade: parseNutriscore(best.nutriscore_grade),
      offId: best.code || null,
      imageSmallUrl: best.image_front_small_url || best.image_small_url || null,
    };
  } catch {
    return null;
  }
}

export async function enrichProducts(
  items: { productId: string; productName: string }[],
): Promise<Map<string, OFFEnrichmentData>> {
  const results = new Map<string, OFFEnrichmentData>();

  for (const item of items) {
    const data = await enrichProduct(item.productName);
    if (data) {
      results.set(item.productId, data);
    }
    await delay(RATE_LIMIT_MS);
  }

  return results;
}
