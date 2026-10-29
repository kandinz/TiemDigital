interface CategoryPillsProps {
  categories: string[];
  selectedCategory: string;
  onSelectCategory: (category: string) => void;
}

export function CategoryPills({ categories, selectedCategory, onSelectCategory }: CategoryPillsProps) {
  return <>
    <div className="category-list"><h2>Danh mục</h2><div className="category-tabs" role="group" aria-label="Danh mục sản phẩm">
    {['all', ...categories].map((category) => <button key={category} aria-pressed={selectedCategory === category} onClick={() => onSelectCategory(category)}>
      {category === 'all' ? 'Tất cả' : category}
    </button>)}
    </div></div>
    <label className="category-select">Danh mục<select value={selectedCategory} onChange={(event) => onSelectCategory(event.target.value)}>{['all', ...categories].map((category) => <option key={category} value={category}>{category === 'all' ? 'Tất cả' : category}</option>)}</select></label>
  </>;
}
