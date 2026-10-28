import type { Product, PromoCode } from "../types";
import { api } from "./platform";
export const AVAILABLE_PROMOS: PromoCode[] = [];
export async function fetchProducts(): Promise<{
  products: Product[];
  categories: string[];
  fromCache: boolean;
}> {
  return api("/api/catalog");
}
