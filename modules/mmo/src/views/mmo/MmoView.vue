<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useAuthStore } from '@/stores/auth.store';
import AuthGuard from '@/components/common/AuthGuard.vue';
import ProductCard from './components/ProductCard.vue';
import BuyConfirmModal from './components/BuyConfirmModal.vue';
import OrderHistoryView from './components/OrderHistoryView.vue';
import MmoTransactionsView from './components/MmoTransactionsView.vue';
import MmoReportsView from './components/MmoReportsView.vue';
import RetailCatalogManagementView from './components/RetailCatalogManagementView.vue';
import RetailProductModal from './components/RetailProductModal.vue';
import { useMmoCatalogStore } from '@/stores/mmoCatalog.store';
import { useMMO } from '@/composables/useMMO';
import { useMmoProvidersStore } from '@/stores/mmoProviders.store';
import { useMmoMoneyStore } from '@/stores/mmoMoney.store';
import { Store, ExternalLink, ShoppingCart, Settings, AlertTriangle, Search, ChevronRight, ChevronDown, Hash, Wallet, Server, ShoppingBag, Receipt, BarChart3, Loader2, X, RotateCcw } from 'lucide-vue-next';

const router = useRouter();
const route = useRoute();
const authStore = useAuthStore();
const hasAccess = computed(() => authStore.hasPermission('mmo'));
const isAdmin = computed(() => authStore.user?.role === 'admin');

const activeTab = ref<'products' | 'purchases' | 'sales' | 'reports'>((route.query.tab as any) || 'products');
const orderHistoryRef = ref<any>(null);
const mmoTransactionsRef = ref<any>(null);
const reportsRef = ref<any>(null);
const catalogStore = useMmoCatalogStore();
const money = useMmoMoneyStore();
const directory = useMmoProvidersStore();


const { 
  isLoading,
  loadingProgress,
  products,
  categories,
  activeCategory, activeProvider, providersList,
  filteredProducts,
  providerErrors, 
  providerBalances,
  sortedProviderBalances,
  searchQuery, 
  fetchProducts 
} = useMMO();
const productsViewMode = ref<'all' | 'retail'>('all');
const isRetailModalOpen = ref(false);
const selectedProductForRetail = ref<any>(null);

const onOpenRetailConfig = (product: any) => {
  selectedProductForRetail.value = product;
  isRetailModalOpen.value = true;
};

const setTab = (tab: 'products' | 'purchases' | 'sales' | 'reports') => {
  activeTab.value = tab;
  router.replace({ query: { ...route.query, tab } });
};

watch(
  () => route.query.tab,
  (tab) => {
    if (tab) {
      if (tab === 'transactions') {
        activeTab.value = 'sales';
      } else if (['products', 'purchases', 'sales', 'reports'].includes(tab as string)) {
        activeTab.value = tab as any;
      }
    }
  }
);

watch(
  () => money.refreshSignal,
  async () => {
    money.isRefreshing = true;
    try {
      if (activeTab.value === 'products') {
        await fetchProducts();
      } else if (activeTab.value === 'purchases') {
        if (orderHistoryRef.value?.fetchOrders) {
          await orderHistoryRef.value.fetchOrders();
        }
      } else if (activeTab.value === 'sales') {
        if (mmoTransactionsRef.value?.fetchTransactions) {
          await mmoTransactionsRef.value.fetchTransactions();
        }
      } else if (activeTab.value === 'reports') {
        if (reportsRef.value?.refreshAll) {
          await reportsRef.value.refreshAll();
        }
      }
    } finally {
      money.isRefreshing = false;
    }
  }
);

const onResellOrder = (order: any) => {
  activeTab.value = 'sales';
  if (mmoTransactionsRef.value) {
    mmoTransactionsRef.value.openResellFromOrder(order);
  }
};

const onViewTransaction = (txId: number) => {
  activeTab.value = 'sales';
  if (mmoTransactionsRef.value && mmoTransactionsRef.value.openDetailById) {
    mmoTransactionsRef.value.openDetailById(txId);
  }
};

// Mobile Chip Dropdown state
const isCategoryDropdownOpen = ref(false);
const isProviderDropdownOpen = ref(false);

const toggleCategoryDropdown = () => {
  isCategoryDropdownOpen.value = !isCategoryDropdownOpen.value;
  if (isCategoryDropdownOpen.value) isProviderDropdownOpen.value = false;
};

const toggleProviderDropdown = () => {
  isProviderDropdownOpen.value = !isProviderDropdownOpen.value;
  if (isProviderDropdownOpen.value) isCategoryDropdownOpen.value = false;
};

const closeDropdowns = () => {
  isCategoryDropdownOpen.value = false;
  isProviderDropdownOpen.value = false;
};

const selectCategory = (cat: string) => {
  activeCategory.value = cat;
  isCategoryDropdownOpen.value = false;
};

const selectProvider = (pId: string) => {
  activeProvider.value = pId;
  isProviderDropdownOpen.value = false;
};

const isBuyModalOpen = ref(false);
const selectedProductToBuy = ref<any>(null);

const hasActiveFilters = computed(() => {
  return (
    !!searchQuery.value?.trim() ||
    activeCategory.value !== 'Tất cả' ||
    activeProvider.value !== 'Tất cả'
  );
});

const clearFilters = () => {
  searchQuery.value = '';
  activeCategory.value = 'Tất cả';
  activeProvider.value = 'Tất cả';
};

const formatProviderBalance = (balInfo: any) => {
  if (!balInfo || balInfo.balance === undefined) return '';
  return money.format(Number(balInfo.balance) || 0, balInfo.balance_original, balInfo.currency_original);
};

const mobileProviderOptions = computed(() => {
  const options = [{ id: 'Tất cả', label: 'Tất cả NCC' }];
  providersList.value.forEach(pId => {
    if (pId === 'Tất cả') return;
    const balInfo = providerBalances.value.find(b => b.provider_id === pId);
    const name = directory.displayInfo(pId).name;
    let label = name;
    if (balInfo?.balance !== undefined) {
      label += ` (${formatProviderBalance(balInfo)})`;
    }
    options.push({ id: pId, label });
  });
  return options;
});

onMounted(() => {
  if (hasAccess.value) {
    fetchProducts();
    if (isAdmin.value) {
      catalogStore.fetchAdminCatalog();
    }
  }
});

const handleBuy = (product: any) => {
  selectedProductToBuy.value = product;
  isBuyModalOpen.value = true;
};

const selectedProviderBalance = computed(() => {
  if (!selectedProductToBuy.value?.provider_id) return null;
  const balInfo = providerBalances.value.find(b => b.provider_id === selectedProductToBuy.value.provider_id);
  if (balInfo?.balance !== undefined) {
    return formatProviderBalance(balInfo);
  }
  const p = directory.providers.find(x => x.id === selectedProductToBuy.value.provider_id);
  if (p?.balance !== null && p?.balance !== undefined) {
    return money.format(Number(p.balance) || 0, p.balance, p.balance_currency || 'USD');
  }
  return null;
});

const goToSettings = () => {
  if (isAdmin.value) {
    router.push('/settings/mmo');
  }
};

const onOrderSuccess = () => {
  if (orderHistoryRef.value) {
    orderHistoryRef.value.fetchOrders();
  }
};
</script>

<template>
  <div class="px-2 sm:px-6 py-3 sm:py-4 max-w-[1720px] mx-auto flex flex-col gap-3 sm:gap-4 min-h-[calc(100vh-64px)] pb-24">
    <!-- Auth Check Guard -->
    <AuthGuard
      v-if="!hasAccess"
      module-name="MMO Marketplace"
      :type="authStore.isLoggedIn ? 'forbidden' : 'login_required'"
    />

    <template v-else>


      <!-- Tab 2: Purchases (Danh Sách Đơn Mua Từ NCC) -->
      <div v-show="activeTab === 'purchases'" class="flex flex-col gap-3">
        <OrderHistoryView 
          ref="orderHistoryRef" 
          @resell-order="onResellOrder" 
          @view-transaction="onViewTransaction"
        />
      </div>

      <!-- Tab 3: Sales (Sổ Giao Dịch Bán Hàng & Chi Phí) -->
      <div v-show="activeTab === 'sales'" class="flex flex-col gap-3">
        <MmoTransactionsView ref="mmoTransactionsRef" @switch-tab="setTab" />
      </div>

      <!-- Tab 4: Reports & Warranty Lookup -->
      <div v-show="activeTab === 'reports'">
        <MmoReportsView ref="reportsRef" />
      </div>

      <!-- Tab 1: Products -->
      <div v-show="activeTab === 'products'" class="flex flex-col gap-3">
        <!-- Mode Switcher: Kho NCC vs. Kệ Bán Lẻ -->
        <div v-if="isAdmin" class="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 pb-1">
          <div class="flex items-center gap-1 p-1 bg-app-surface border border-app-border rounded-2xl shadow-xs self-start">
            <button
              type="button"
              @click="productsViewMode = 'all'"
              class="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all touch-active cursor-pointer"
              :class="productsViewMode === 'all' ? 'bg-app-accent text-white shadow-xs' : 'text-app-text-sub hover:text-app-text'"
            >
              <Server class="w-3.5 h-3.5" />
              <span>Kho NCC</span>
              <span class="text-[10px] opacity-80 font-mono">({{ filteredProducts.length }})</span>
            </button>

            <button
              type="button"
              @click="productsViewMode = 'retail'"
              class="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all touch-active cursor-pointer"
              :class="productsViewMode === 'retail' ? 'bg-app-accent text-white shadow-xs' : 'text-app-text-sub hover:text-app-text'"
            >
              <Store class="w-3.5 h-3.5" />
              <span>Kệ Bán Lẻ</span>
              <span v-if="catalogStore.products.length" class="text-[10px] px-1.5 py-0.2 rounded-full font-mono" :class="productsViewMode === 'retail' ? 'bg-white/20 text-white' : 'bg-teal-500/10 text-teal-600 dark:text-teal-400 border border-teal-500/20'">
                {{ catalogStore.products.length }}
              </span>
            </button>
          </div>

          <!-- Quick link to Public Showcase /product -->
          <router-link
            to="/product"
            
            class="inline-flex items-center justify-center gap-1.5 text-xs text-app-accent font-semibold px-3 py-1.5 rounded-xl border border-app-accent/25 bg-app-accent/5 hover:bg-app-accent/10 transition-colors self-start sm:self-auto touch-active"
          >
            <span>Xem trước kệ bán lẻ</span>
            <ExternalLink class="w-3.5 h-3.5" />
          </router-link>
        </div>

        <!-- Sub-view 1: Retail Catalog Management -->
        <div v-if="isAdmin && productsViewMode === 'retail'">
          <RetailCatalogManagementView @switch-to-all="productsViewMode = 'all'" />
        </div>

        <!-- Sub-view 2: Wholesale Provider Feed (Original) -->
        <div v-show="!isAdmin || productsViewMode === 'all'" class="flex flex-col gap-3">
        <!-- Unified Filter & Search Bar (Synchronized for Mobile & PC) -->
        <div class="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 relative">
          <!-- Click outside backdrop to close dropdowns -->
          <div 
            v-if="isCategoryDropdownOpen || isProviderDropdownOpen" 
            class="fixed inset-0 z-20"
            @click="closeDropdowns"
          />

          <!-- Search Input -->
          <div class="relative flex-1 min-w-[200px]">
            <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search class="h-4 w-4 text-app-text-sub" />
            </div>
            <input 
              v-model="searchQuery" 
              type="text" 
              placeholder="Tìm sản phẩm... (vd: Netflix, ChatGPT)"
              class="block w-full pl-10 pr-9 py-2 border border-app-border rounded-xl leading-5 bg-app-surface text-app-text placeholder-app-text-sub focus:outline-none focus:ring-1 focus:ring-app-accent focus:border-app-accent text-xs sm:text-sm transition-colors"
            >
            <button
              v-if="searchQuery"
              @click="searchQuery = ''"
              type="button"
              class="absolute inset-y-0 right-0 pr-3 flex items-center text-app-text-sub hover:text-app-text"
              title="Xóa ô tìm kiếm"
            >
              <X class="w-3.5 h-3.5" />
            </button>
          </div>

          <!-- Dropdowns & Actions Row -->
          <div class="flex items-center gap-2 relative z-20">
            <!-- Category Selector Trigger & Popover -->
            <div class="relative flex-1 sm:flex-initial sm:w-48 lg:w-56">
              <button
                type="button"
                @click="toggleCategoryDropdown"
                class="w-full flex items-center justify-between gap-1.5 px-3 py-2 bg-app-surface border rounded-xl text-xs font-bold transition-all touch-active truncate shadow-xs"
                :class="isCategoryDropdownOpen ? 'border-app-accent ring-1 ring-app-accent text-app-accent' : 'border-app-border text-app-text-base'"
              >
                <div class="flex items-center gap-1.5 truncate">
                  <Hash class="w-3.5 h-3.5 shrink-0 text-app-accent" />
                  <span class="truncate">{{ activeCategory }}</span>
                </div>
                <ChevronDown class="w-3.5 h-3.5 shrink-0 text-app-text-sub transition-transform duration-200" :class="{ 'rotate-180': isCategoryDropdownOpen }" />
              </button>

              <!-- Category Chips Popover -->
              <div
                v-if="isCategoryDropdownOpen"
                class="absolute left-0 top-full mt-1.5 z-30 bg-app-surface border border-app-border rounded-2xl p-3 shadow-xl animate-fade-in w-[calc(100vw-32px)] sm:w-80 md:w-96 max-w-sm sm:max-w-md"
              >
                <div class="flex items-center justify-between mb-2 pb-1.5 border-b border-app-border/50 text-[11px] font-bold text-app-text-sub uppercase tracking-wider">
                  <span>Chọn danh mục ({{ categories.length }})</span>
                  <span class="text-[10px] text-app-accent lowercase font-normal">Chạm để lọc</span>
                </div>
                <div class="flex flex-wrap gap-1.5 max-h-64 overflow-y-auto pr-1">
                  <button
                    v-for="cat in categories"
                    :key="cat"
                    type="button"
                    @click="selectCategory(cat)"
                    class="px-2.5 py-1.5 rounded-xl text-xs font-semibold transition-all touch-active border"
                    :class="activeCategory === cat ? 'bg-app-accent text-white border-app-accent shadow-xs' : 'bg-app-bg border-app-border text-app-text-sub hover:text-app-text hover:bg-app-surface-hover'"
                  >
                    {{ cat }}
                  </button>
                </div>
              </div>
            </div>

            <!-- Provider Selector Trigger & Popover -->
            <div class="relative flex-1 sm:flex-initial sm:w-48 lg:w-56">
              <button
                type="button"
                @click="toggleProviderDropdown"
                class="w-full flex items-center justify-between gap-1.5 px-3 py-2 bg-app-surface border rounded-xl text-xs font-bold transition-all touch-active truncate shadow-xs"
                :class="isProviderDropdownOpen ? 'border-app-accent ring-1 ring-app-accent text-app-accent' : 'border-app-border text-app-text-base'"
              >
                <div class="flex items-center gap-1.5 truncate">
                  <template v-if="activeProvider !== 'Tất cả'">
                    <img 
                      v-if="directory.displayInfo(activeProvider).avatarUrl" 
                      :src="directory.displayInfo(activeProvider).avatarUrl || ''" 
                      referrerpolicy="no-referrer" 
                      alt="" 
                      class="w-3.5 h-3.5 rounded-full object-cover shrink-0" 
                    />
                    <Server v-else class="w-3.5 h-3.5 shrink-0 text-app-accent" />
                    <span class="truncate">{{ directory.displayInfo(activeProvider).name }}</span>
                  </template>
                  <template v-else>
                    <Server class="w-3.5 h-3.5 shrink-0 text-app-accent" />
                    <span class="truncate">Tất cả NCC</span>
                  </template>
                </div>
                <ChevronDown class="w-3.5 h-3.5 shrink-0 text-app-text-sub transition-transform duration-200" :class="{ 'rotate-180': isProviderDropdownOpen }" />
              </button>

              <!-- Provider Chips Popover -->
              <div
                v-if="isProviderDropdownOpen"
                class="absolute right-0 top-full mt-1.5 z-30 bg-app-surface border border-app-border rounded-2xl p-3 shadow-xl animate-fade-in w-[calc(100vw-32px)] sm:w-80 md:w-96 max-w-sm sm:max-w-md"
              >
                <div class="flex items-center justify-between mb-2 pb-1.5 border-b border-app-border/50 text-[11px] font-bold text-app-text-sub uppercase tracking-wider">
                  <span>Chọn nhà cung cấp</span>
                  <span class="text-[10px] text-app-accent lowercase font-normal">Chạm để lọc</span>
                </div>
                <div class="flex flex-wrap gap-1.5 max-h-64 overflow-y-auto pr-1">
                  <!-- Option: Tất cả NCC -->
                  <button
                    type="button"
                    @click="selectProvider('Tất cả')"
                    class="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-semibold transition-all touch-active border"
                    :class="activeProvider === 'Tất cả' ? 'bg-app-accent text-white border-app-accent shadow-xs' : 'bg-app-bg border-app-border text-app-text-sub hover:text-app-text hover:bg-app-surface-hover'"
                  >
                    <span>Tất cả NCC</span>
                  </button>

                  <!-- Vendor options with avatars and balances (sorted by balance desc) -->
                  <button
                    v-for="b in sortedProviderBalances"
                    :key="b.provider_id"
                    type="button"
                    @click="selectProvider(b.provider_id)"
                    class="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-semibold transition-all touch-active border"
                    :class="activeProvider === b.provider_id ? 'bg-blue-500/15 border-blue-500 text-blue-600 dark:text-blue-400 font-bold' : 'bg-app-bg border-app-border text-app-text-sub hover:text-app-text hover:bg-app-surface-hover'"
                  >
                    <img 
                      v-if="b.avatar_url" 
                      :src="b.avatar_url" 
                      referrerpolicy="no-referrer" 
                      alt="" 
                      class="w-4 h-4 rounded-full object-cover shrink-0" 
                    />
                    <div 
                      v-else 
                      class="w-4 h-4 rounded-full bg-app-accent/15 text-app-accent text-[9px] flex items-center justify-center font-bold shrink-0"
                    >
                      {{ (b.name || b.provider_id).charAt(0).toUpperCase() }}
                    </div>

                    <span>{{ b.name }}</span>
                    <span v-if="b.balance !== undefined" class="font-mono text-[10px] opacity-80 ml-0.5 bg-black/5 dark:bg-white/10 px-1 rounded">
                      {{ formatProviderBalance(b) }}
                    </span>
                  </button>
                </div>
              </div>
            </div>

            <!-- Loading Progress Indicator -->
            <div 
              v-if="loadingProgress.inProgress" 
              class="flex items-center gap-1.5 px-2.5 py-2 bg-app-surface border border-app-border rounded-xl text-xs font-semibold text-app-text-sub shrink-0 animate-fade-in shadow-xs"
            >
              <Loader2 class="w-3.5 h-3.5 animate-spin text-app-accent" />
              <span class="hidden sm:inline">Đang tải ({{ loadingProgress.loaded }}/{{ loadingProgress.total }} NCC)...</span>
              <span class="sm:hidden">{{ loadingProgress.loaded }}/{{ loadingProgress.total }}</span>
            </div>

            <!-- Nút Xóa Bộ Lọc (Clear filter) -->
            <button
              v-if="hasActiveFilters"
              type="button"
              @click="clearFilters"
              class="flex items-center gap-1.5 px-2.5 py-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/15 border border-rose-500/25 text-rose-500 dark:text-rose-400 text-xs font-bold transition-all shadow-xs touch-active shrink-0"
              title="Xóa tất cả bộ lọc tìm kiếm, danh mục, NCC"
            >
              <RotateCcw class="w-3.5 h-3.5" />
              <span class="hidden sm:inline">Xóa lọc</span>
            </button>
          </div>
        </div>

        <!-- Provider Errors -->
        <div v-if="providerErrors.length > 0" class="flex flex-col gap-2">
          <div 
            v-for="err in providerErrors" 
            :key="err.provider_id"
            class="flex items-center justify-between px-3 py-2 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-600 text-xs max-w-lg"
          >
            <div class="flex items-center gap-1.5 min-w-0">
              <AlertTriangle class="w-3.5 h-3.5 shrink-0" />
              <span class="truncate"><span class="font-bold">{{ err.provider_id }}:</span> {{ err.message || 'Lỗi kết nối' }}</span>
            </div>
            <button v-if="isAdmin" @click="goToSettings" class="shrink-0 flex items-center gap-0.5 font-semibold hover:underline">
              Cấu hình <ChevronRight class="w-3 h-3" />
            </button>
          </div>
        </div>

        <!-- Search Summary -->
        <div v-if="searchQuery && (products.length > 0 || !isLoading)" class="text-xs font-medium text-app-text-sub">
          Tìm thấy {{ filteredProducts.length }} sản phẩm
        </div>

        <!-- Loading Skeleton (12 compact cards) -->
        <div v-if="isLoading && products.length === 0" class="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-2 sm:gap-2.5">
          <div v-for="i in 12" :key="i" class="bg-app-surface border border-app-border rounded-xl p-2 sm:p-2.5 flex flex-col justify-between h-[115px] animate-pulse">
            <div class="flex items-center justify-between mb-1">
              <div class="h-3 bg-app-border rounded w-16"></div>
              <div class="h-3 bg-app-border rounded w-8"></div>
            </div>
            <div class="space-y-1 my-auto">
              <div class="h-3 bg-app-border rounded w-full"></div>
              <div class="h-3 bg-app-border rounded w-3/4"></div>
            </div>
            <div class="flex items-center justify-between pt-1 border-t border-app-border/30 mt-1">
              <div class="h-3.5 bg-app-border rounded w-14"></div>
              <div class="h-3 bg-app-border rounded w-6"></div>
            </div>
          </div>
        </div>

        <!-- Empty State -->
        <div v-else-if="filteredProducts.length === 0" class="flex flex-col items-center justify-center p-8 mt-4 text-center bg-app-surface border border-app-border rounded-3xl border-dashed">
          <div class="w-16 h-16 rounded-2xl bg-slate-500/10 text-slate-500 flex items-center justify-center mb-4">
            <ShoppingCart class="w-8 h-8 opacity-50" />
          </div>
          <h2 class="text-lg font-bold text-app-text-base mb-1">Không có sản phẩm</h2>
          <p class="text-sm text-app-text-sub max-w-[280px]">
            {{ searchQuery ? `Không tìm thấy sản phẩm nào khớp với "${searchQuery}"` : 'Chưa có dữ liệu sản phẩm. Vui lòng kiểm tra cấu hình nhà cung cấp.' }}
          </p>
          <button v-if="isAdmin && !searchQuery" @click="goToSettings" class="mt-4 px-4 py-2 bg-app-accent text-white rounded-lg text-sm font-semibold shadow-accent">
            Cấu hình nhà cung cấp
          </button>
        </div>

        <!-- Product Grid -->
        <div v-else class="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-2 sm:gap-2.5">
          <ProductCard 
            v-for="product in filteredProducts" 
            :key="`${product.provider_id}-${product.provider_product_id}`" 
            :product="product" 
            @buy="handleBuy"
            @retail="onOpenRetailConfig"
          />
        </div>

        <!-- Footer -->
        <div v-if="products.length > 0" class="text-center text-xs text-app-text-sub pt-4 pb-2 flex items-center justify-center gap-1.5 w-full">
          <span v-if="money.usdRate">* Tỷ giá: 1 USD = {{ money.usdRate.toLocaleString() }} VND</span>
          <button v-if="isAdmin" @click="goToSettings" class="p-1 hover:bg-app-border rounded transition-colors text-app-accent">
            <Settings class="w-3.5 h-3.5" />
          </button>
        </div>
        </div>
      </div>

      <BuyConfirmModal 
        :is-open="isBuyModalOpen" 
        :product="selectedProductToBuy" 
        :provider-balance="selectedProviderBalance"
        @close="isBuyModalOpen = false" 
        @order-success="onOrderSuccess"
        @retail-config="onOpenRetailConfig"
      />

      <RetailProductModal
        :is-open="isRetailModalOpen"
        :vendor-product="selectedProductForRetail"
        @close="isRetailModalOpen = false"
        @saved="catalogStore.fetchAdminCatalog"
      />


    </template>
  </div>
</template>

<style scoped>
/* Hide scrollbar for mobile chips */
.scrollbar-hide::-webkit-scrollbar {
    display: none;
}
.scrollbar-hide {
    -ms-overflow-style: none;
    scrollbar-width: none;
}
</style>





