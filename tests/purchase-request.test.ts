import { describe, expect, it } from 'vitest';
import { readPurchaseRequest } from '../src/utils/purchase';

describe('restoring a purchase after sign-in', () => {
  it('accepts the checkout limit and rejects quantities the order API cannot accept', () => {
    expect(readPurchaseRequest('?buy=12&quantity=20')).toEqual({ productId: 12, quantity: 20 });
    expect(readPurchaseRequest('?buy=12&quantity=21')).toBeNull();
    expect(readPurchaseRequest('?buy=12&quantity=0')).toBeNull();
  });
});
