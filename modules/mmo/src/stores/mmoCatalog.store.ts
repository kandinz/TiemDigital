import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { apiClient } from '@/services/api.client';
import { useToastStore } from './toast.store';

export interface RetailProduct {
  id: number;
  provider_id: string;
  provider_product_id: string;
  name: string;
  description: string;
  original_name: string;
  original_description: string;
  original_price_usd: number;
  original_price: number;
  original_currency: string;
  selling_price: number;
  profit_vnd?: number;
  profit_margin?: number;
  category: string;
  image_url: string | null;
  in_stock: boolean;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export const useMmoCatalogStore = defineStore('mmoCatalog', () => {
  const toast = useToastStore();
  const products = ref<RetailProduct[]>([]);
  const isLoading = ref(false);
  const isSyncing = ref(false);

  // Map tra cứu nhanh theo provider_id + provider_product_id
  const productKeyMap = computed(() => {
    const map = new Map<string, RetailProduct>();
    for (const p of products.value) {
      map.set(`${p.provider_id}:${p.provider_product_id}`, p);
    }
    return map;
  });

  const getByVendorKey = (providerId?: string, productId?: string | number): RetailProduct | undefined => {
    if (!providerId || productId === undefined || productId === null) return undefined;
    return productKeyMap.value.get(`${providerId}:${productId}`);
  };

  const fetchAdminCatalog = async () => {
    isLoading.value = true;
    try {
      const { data } = await apiClient.get('/mmo/catalog/admin');
      if (data?.success) {
        products.value = data.products || [];
      }
    } catch (err: any) {
      console.error('Failed to fetch admin retail catalog:', err);
    } finally {
      isLoading.value = false;
    }
  };

  const upsertProduct = async (payload: {
    provider_id: string;
    provider_product_id: string;
    original_name: string;
    original_description?: string;
    original_price_usd?: number;
    original_price?: number;
    original_currency?: string;
    selling_price: number;
    name?: string;
    description?: string;
    category?: string;
    image_url?: string | null;
    in_stock?: boolean | number;
    is_active?: boolean | number;
    sort_order?: number;
  }) => {
    try {
      const { data } = await apiClient.post('/mmo/catalog', payload);
      if (data?.success) {
        toast.success('Đã lưu sản phẩm vào kệ bán lẻ');
        await fetchAdminCatalog();
        return true;
      }
      toast.error(data?.message || 'Không thể lưu sản phẩm');
      return false;
    } catch (err: any) {
      toast.error(err.response?.data?.message || err.message || 'Lỗi kết nối');
      return false;
    }
  };

  const updateProduct = async (
    id: number,
    payload: {
      name?: string;
      description?: string;
      selling_price?: number;
      category?: string;
      sort_order?: number;
      is_active?: boolean | number;
      restore_defaults?: boolean;
    }
  ) => {
    try {
      const { data } = await apiClient.put(`/mmo/catalog/${id}`, payload);
      if (data?.success) {
        toast.success('Đã cập nhật thông tin sản phẩm');
        await fetchAdminCatalog();
        return true;
      }
      toast.error(data?.message || 'Không thể cập nhật sản phẩm');
      return false;
    } catch (err: any) {
      toast.error(err.response?.data?.message || err.message || 'Lỗi kết nối');
      return false;
    }
  };

  const toggleStatus = async (id: number, isActive: boolean) => {
    try {
      const { data } = await apiClient.patch(`/mmo/catalog/${id}/status`, { is_active: isActive });
      if (data?.success) {
        const item = products.value.find((p) => p.id === id);
        if (item) item.is_active = isActive;
        toast.success(
          isActive ? 'Sản phẩm đã xuất hiện trên trang /product' : 'Sản phẩm đã ẩn khỏi trang /product'
        );
        return true;
      }
    } catch (err: any) {
      toast.error(err.response?.data?.message || err.message || 'Lỗi cập nhật');
    }
    return false;
  };

  const deleteProduct = async (id: number) => {
    try {
      const { data } = await apiClient.delete(`/mmo/catalog/${id}`);
      if (data?.success) {
        products.value = products.value.filter((p) => p.id !== id);
        toast.success('Sản phẩm đã được gỡ khỏi kệ bán lẻ');
        return true;
      }
    } catch (err: any) {
      toast.error(err.response?.data?.message || err.message || 'Lỗi xóa sản phẩm');
    }
    return false;
  };

  const syncVendors = async () => {
    isSyncing.value = true;
    try {
      const { data } = await apiClient.post('/mmo/catalog/sync');
      if (data?.success) {
        toast.success(data.message || 'Đồng bộ hoàn tất');
        await fetchAdminCatalog();
        return true;
      }
      toast.error(data?.message || 'Không thể đồng bộ với vendor');
    } catch (err: any) {
      toast.error(err.response?.data?.message || err.message || 'Lỗi kết nối');
    } finally {
      isSyncing.value = false;
    }
    return false;
  };

  return {
    products,
    isLoading,
    isSyncing,
    productKeyMap,
    getByVendorKey,
    fetchAdminCatalog,
    upsertProduct,
    updateProduct,
    toggleStatus,
    deleteProduct,
    syncVendors,
  };
});
