import type { Product } from "../types";
import { api } from "./platform";
export async function fetchProducts(): Promise<{
  products: Product[];
  categories: string[];
  fromCache: boolean;
}> {
  return api("/api/catalog");
}
