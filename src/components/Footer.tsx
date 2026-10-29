const year = new Date().getFullYear();

export function Footer() {
  return <footer className="shop-footer shop-container">
    <span>© {year} Tiệm Digital</span>
    <a href="/pages/lien-he">Hỗ trợ mua hàng</a>
  </footer>;
}
