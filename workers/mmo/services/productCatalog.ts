export interface CategoryConfig {
  name: string;
  keywords: string[];
}

export const FALLBACK_CATEGORY = "Khác";

// Product catalog: assigns the first configured category whose name or keyword appears in the product name.
export function categorizeProduct(name: string, categories: CategoryConfig[]): string {
  const lower = name.toLowerCase();
  for (const cat of categories) {
    if (lower.includes(cat.name.toLowerCase())) return cat.name;
    if (cat.keywords.some((kw) => kw && lower.includes(kw.toLowerCase()))) return cat.name;
  }
  return FALLBACK_CATEGORY;
}
