/* oxlint-disable react/purity -- Vue composable, not a React render. */
import { ref, computed, watch } from 'vue';
import { apiClient } from '@/services/api.client';
import { useToastStore } from '@/stores/toast.store';
import { useMmoProvidersStore } from '@/stores/mmoProviders.store';

/**
 * Sắp xếp danh sách sản phẩm MMO:
 * 1. Sản phẩm còn hàng (in_stock) trước sản phẩm hết hàng
 * 2. Giá rẻ nhất (price_usd) tăng dần
 * 3. Tên sản phẩm theo thứ tự bảng chữ cái
 */
function sortProducts(items: any[]) {
  items.sort((a, b) => {
    if (a.in_stock && !b.in_stock) return -1;
    if (!a.in_stock && b.in_stock) return 1;

    const priceA = a.price_usd ?? Infinity;
    const priceB = b.price_usd ?? Infinity;
    if (priceA !== priceB) return priceA - priceB;

    return (a.name || '').localeCompare(b.name || '');
  });
}

export function useMMO() {
  const toast = useToastStore();
  const directory = useMmoProvidersStore();
  
  const isLoading = ref(false);
  const loadingProgress = ref({ loaded: 0, total: 0, inProgress: false });
  const products = ref<any[]>([]);
  const providerErrors = ref<any[]>([]);
  const providerBalances = ref<any[]>([]);
  const backendCategories = ref<string[]>([]);
  const fetchedAt = ref<string>('');
  
  const searchQuery = ref('');
  const activeCategory = ref(localStorage.getItem('mmo_active_category') || 'Tất cả');
  watch(activeCategory, (val) => localStorage.setItem('mmo_active_category', val));
  const activeProvider = ref('Tất cả');

  let currentFetchId = 0;

  /**
   * Tải tịnh tiến dữ liệu sản phẩm từ tất cả nhà cung cấp (Progressive Vendor Loading)
   * - Bước 1: Lấy danh sách nhà cung cấp đang kích hoạt
   * - Bước 2: Kích hoạt đồng thời các request tải riêng từng NCC với timeout 35s
   * - Bước 3: Cập nhật và sắp xếp lại giao diện ngay khi từng NCC phản hồi
   */
  const fetchProducts = async () => {
    const fetchId = ++currentFetchId;
    isLoading.value = true;
    loadingProgress.value = { loaded: 0, total: 0, inProgress: true };
    providerErrors.value = [];

    try {
      // Bước 1: Lấy danh sách NCC đang hoạt động từ provider directory (làm mới để có số dư cache mới nhất)
      await directory.refresh();
      if (fetchId !== currentFetchId) return;

      const activeProviders = directory.activeProviders;

      if (activeProviders.length === 0) {
        providerBalances.value = [];
        products.value = [];
        return;
      }

      // Khởi tạo trạng thái ban đầu cho từng NCC
      loadingProgress.value = { loaded: 0, total: activeProviders.length, inProgress: true };
      providerBalances.value = activeProviders.map((p: any) => ({
        provider_id: p.id,
        name: p.name,
        bot_url: p.bot_url || null,
        avatar_url: p.avatar_url || null,
        balance: p.balance !== null && p.balance !== undefined && !isNaN(Number(p.balance)) ? Number(p.balance) : undefined,
        currency: p.balance_currency || 'USD',
        balance_original: p.balance,
        currency_original: p.balance_currency,
        isLoading: true
      }));

      // Bước 2: Gọi đồng thời từng nhà cung cấp
      const vendorPromises = activeProviders.map(async (provider: any) => {
        try {
          const { data } = await apiClient.get(`/mmo/products?provider_id=${provider.id}`, { timeout: 35000 });
          if (fetchId !== currentFetchId) return;

          if (data?.success) {
            if (data.categories?.length) backendCategories.value = data.categories;

            // Cập nhật số dư trực tiếp của vendor này
            if (data.provider_balances?.length) {
              const liveBal = data.provider_balances[0];
              const idx = providerBalances.value.findIndex(b => b.provider_id === provider.id);
              if (idx >= 0) {
                providerBalances.value[idx] = { 
                  ...providerBalances.value[idx],
                  ...liveBal, 
                  balance: liveBal.balance !== undefined && !isNaN(Number(liveBal.balance)) ? Number(liveBal.balance) : providerBalances.value[idx].balance,
                  isLoading: false 
                };
              }
            } else {
              const idx = providerBalances.value.findIndex(b => b.provider_id === provider.id);
              if (idx >= 0) {
                providerBalances.value[idx].isLoading = false;
              }
            }

            // Ghi nhận lỗi riêng lẻ nếu có
            if (data.provider_errors?.length) {
              providerErrors.value.push(...data.provider_errors);
            }

            // Ghép và sắp xếp lại danh sách sản phẩm
            const remaining = products.value.filter(p => p.provider_id !== provider.id);
            const merged = [...remaining, ...(data.products || [])];
            sortProducts(merged);
            products.value = merged;
          }
        } catch (err: any) {
          if (fetchId !== currentFetchId) return;
          providerErrors.value.push({
            provider_id: provider.id,
            error: true,
            message: err.response?.data?.message || err.message || 'Lỗi kết nối'
          });
          const idx = providerBalances.value.findIndex(b => b.provider_id === provider.id);
          if (idx >= 0) {
            providerBalances.value[idx].isLoading = false;
          }
        } finally {
          if (fetchId === currentFetchId) {
            loadingProgress.value.loaded++;
          }
        }
      });

      await Promise.allSettled(vendorPromises);

      if (fetchId === currentFetchId) {
        fetchedAt.value = new Date().toISOString();
      }
    } catch (err: any) {
      if (fetchId === currentFetchId) {
        toast.error('Lỗi tải dữ liệu sản phẩm', err.message);
      }
    } finally {
      if (fetchId === currentFetchId) {
        isLoading.value = false;
        loadingProgress.value.inProgress = false;
      }
    }
  };

  /**
   * Danh sách số dư NCC được sắp xếp theo số dư giảm dần (số dư nhiều nhất ở trên cùng).
   */
  const sortedProviderBalances = computed(() => {
    return [...providerBalances.value].sort((a, b) => {
      const balA = typeof a.balance === 'number' ? a.balance : (a.balance !== undefined && !isNaN(Number(a.balance)) ? Number(a.balance) : -Infinity);
      const balB = typeof b.balance === 'number' ? b.balance : (b.balance !== undefined && !isNaN(Number(b.balance)) ? Number(b.balance) : -Infinity);
      if (balB !== balA) return balB - balA; // Giảm dần: số dư nhiều nhất ở trên cùng
      return (a.name || a.provider_id || '').localeCompare(b.name || b.provider_id || '');
    });
  });

  const providersList = computed(() => {
    const sortedIds = sortedProviderBalances.value.map(b => b.provider_id).filter(Boolean);
    const set = new Set(sortedIds);
    products.value.forEach(p => {
      if (p.provider_id && !set.has(p.provider_id)) {
        sortedIds.push(p.provider_id);
        set.add(p.provider_id);
      }
    });
    return ['Tất cả', ...sortedIds];
  });
  
  const categories = computed(() => {
    // Thu thập danh mục có sản phẩm thực tế
    const catsInUse = new Set(products.value.map(p => p.category));
    
    // Sắp xếp theo đúng thứ tự sort_order backend
    const sortedCats = backendCategories.value.filter(c => catsInUse.has(c));
    
    // Danh mục phát sinh ngoài cấu hình được đưa xuống cuối
    const otherCats = Array.from(catsInUse).filter(c => !backendCategories.value.includes(c)).sort();
    
    return ['Tất cả', ...sortedCats, ...otherCats];
  });
  
  const filteredProducts = computed(() => {
    let result = products.value;
    
    if (activeCategory.value && activeCategory.value !== 'Tất cả') {
      result = result.filter(p => p.category === activeCategory.value);
    }
    
    if (activeProvider.value && activeProvider.value !== 'Tất cả') {
      result = result.filter(p => p.provider_id === activeProvider.value);
    }

    if (searchQuery.value) {
      const lowerQ = searchQuery.value.toLowerCase();
      result = result.filter(p => (p.name || '').toLowerCase().includes(lowerQ));
    }

    return result;
  });

  return {
    isLoading,
    loadingProgress,
    products,
    categories,
    providersList,
    activeCategory,
    activeProvider,
    filteredProducts,
    providerErrors,
    providerBalances,
    sortedProviderBalances,
    fetchedAt,
    searchQuery,
    fetchProducts
  };
}
