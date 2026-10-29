interface CategoryPillsProps {
  categories: string[];
  selectedCategory: string;
  onSelectCategory: (category: string) => void;
}

export function CategoryPills({ categories, selectedCategory, onSelectCategory }: CategoryPillsProps) {
  return <div className="category-tabs" role="group" aria-label="Danh mục sản phẩm">
    {['all', ...categories].map((category) => <button key={category} aria-pressed={selectedCategory === category} onClick={() => onSelectCategory(category)}>
      {category === 'all' ? 'Tất cả' : category}
    </button>)}
  </div>;
}
