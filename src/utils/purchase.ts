export function readPurchaseRequest(search: string) {
  const params = new URLSearchParams(search);
  const productId = Number(params.get('buy'));
  const quantity = Number(params.get('quantity') ?? 1);
  return Number.isSafeInteger(productId) && productId > 0 && Number.isInteger(quantity) && quantity >= 1 && quantity <= 100
    ? { productId, quantity } : null;
}
