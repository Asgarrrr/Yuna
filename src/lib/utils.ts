import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** French-aware pluralization: `pluralize(3, "produit")` → `"3 produits"` */
export function pluralize(
  count: number,
  singular: string,
  plural?: string,
): string {
  const word = count > 1 ? (plural ?? `${singular}s`) : singular;
  return `${count} ${word}`;
}
