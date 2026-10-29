<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useMmoCatalogStore, type RetailProduct } from '@/stores/mmoCatalog.store';
import { useMmoProvidersStore } from '@/stores/mmoProviders.store';
import RetailProductModal from './RetailProductModal.vue';
import {
  Store,
  Search,
  RefreshCw,
  Edit2,
  Trash2,
  Eye,
  EyeOff,
  ExternalLink,
  Plus,
  Layers,
  TrendingUp,
  Tag,
  CheckCircle2,
  XCircle,
  X,
} from 'lucide-vue-next';

const emit = defineEmits<{
  (e: 'switch-to-all'): void;
}>();

const catalogStore = useMmoCatalogStore();
const directory = useMmoProvidersStore();

const searchQuery = ref('');
const selectedCategory = ref('Tất cả');

const isEditModalOpen = ref(false);
const editingProduct = ref<RetailProduct | null>(null);

onMounted(() => {
  catalogStore.fetchAdminCatalog();
});

const categories = computed(() => {
  const set = new Set<string>();
  for (const p of catalogStore.products) {
    if (p.category) set.add(p.category);
  }
  return ['Tất cả', ...Array.from(set)];
});

const filteredProducts = computed(() => {
  return catalogStore.products.filter((p) => {
    if (selectedCategory.value !== 'Tất cả' && p.category !== selectedCategory.value) {
      return false;
    }
    if (searchQuery.value.trim()) {
      const q = searchQuery.value.trim().toLowerCase();
      const matchName = p.name.toLowerCase().includes(q) || p.original_name.toLowerCase().includes(q);
      const matchDesc = p.description?.toLowerCase().includes(q);
      const matchCat = p.category?.toLowerCase().includes(q);
      return matchName || matchDesc || matchCat;
    }
    return true;
  });
});

const openEditModal = (product: RetailProduct) => {
  editingProduct.value = product;
  isEditModalOpen.value = true;
};

const handleToggleStatus = async (product: RetailProduct) => {
  await catalogStore.toggleStatus(product.id, !product.is_active);
};

const handleDelete = async (product: RetailProduct) => {
  if (confirm(`Bạn có chắc chắn muốn gỡ "${product.name}" khỏi kệ bán lẻ?`)) {
    await catalogStore.deleteProduct(product.id);
  }
};

const handleSyncVendors = async () => {
  await catalogStore.syncVendors();
};
</script>

<template>
  <div class="flex flex-col gap-3">
    <!-- Top Bar: Tìm kiếm, Bộ lọc danh mục & Thao tác đồng bộ -->
    <div class="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 bg-app-surface border border-app-border p-3 rounded-2xl shadow-xs">
      <div class="flex items-center gap-2 flex-1 min-w-0">
        <!-- Search Input -->
        <div class="relative flex-1 min-w-[180px]">
          <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Search class="h-3.5 w-3.5 text-app-text-sub" />
          </div>
          <input
            v-model="searchQuery"
            type="text"
            placeholder="Tìm sản phẩm đang bán..."
            class="block w-full pl-9 pr-8 py-2 text-xs bg-app-bg border border-app-border rounded-xl text-app-text focus:outline-none focus:ring-1 focus:ring-app-accent focus:border-app-accent"
          />
          <button
            v-if="searchQuery"
            type="button"
            @click="searchQuery = ''"
            class="absolute inset-y-0 right-0 pr-2.5 flex items-center text-app-text-sub hover:text-app-text"
          >
            <X class="w-3.5 h-3.5" />
          </button>
        </div>

        <!-- Category Dropdown / Selector -->
        <select
          v-model="selectedCategory"
          class="px-2.5 py-2 text-xs font-semibold bg-app-bg border border-app-border rounded-xl text-app-text focus:outline-none"
        >
          <option v-for="cat in categories" :key="cat" :value="cat">
            {{ cat }}
          </option>
        </select>
      </div>

      <!-- Action Buttons -->
      <div class="flex items-center gap-2 shrink-0">
        <!-- Nút Đồng Bộ Giá & Tồn Kho NCC -->
        <button
          type="button"
          @click="handleSyncVendors"
          :disabled="catalogStore.isSyncing || catalogStore.products.length === 0"
          class="px-3 py-2 rounded-xl text-xs font-semibold bg-app-bg border border-app-border hover:bg-app-surface-hover text-app-text transition-all touch-active flex items-center gap-1.5 disabled:opacity-50"
          title="Đồng bộ giá vốn và tồn kho mới nhất từ các nhà cung cấp"
        >
          <RefreshCw class="w-3.5 h-3.5" :class="{ 'animate-spin': catalogStore.isSyncing }" />
          <span class="hidden sm:inline">{{ catalogStore.isSyncing ? 'Đang đồng bộ...' : 'Đồng bộ NCC' }}</span>
        </button>

        <!-- Nút Mở Trang /product -->
        <router-link
          to="/product"
          
          class="px-3 py-2 rounded-xl text-xs font-bold bg-teal-500/10 border border-teal-500/30 text-teal-600 dark:text-teal-400 hover:bg-teal-500/20 transition-all touch-active flex items-center gap-1.5 shadow-xs"
          title="Mở trang xem bảng giá /product trên tab mới"
        >
          <ExternalLink class="w-3.5 h-3.5" />
          <span>Mở /product</span>
        </router-link>
      </div>
    </div>

    <!-- Loading State -->
    <div v-if="catalogStore.isLoading && catalogStore.products.length === 0" class="p-8 text-center text-xs text-app-text-sub">
      <RefreshCw class="w-5 h-5 animate-spin mx-auto mb-2 text-app-accent" />
      <span>Đang tải danh sách sản phẩm bán lẻ...</span>
    </div>

    <!-- Empty State -->
    <div
      v-else-if="filteredProducts.length === 0"
      class="flex flex-col items-center justify-center p-8 text-center bg-app-surface border border-app-border rounded-3xl border-dashed"
    >
      <div class="w-14 h-14 rounded-2xl bg-teal-500/10 text-teal-600 dark:text-teal-400 flex items-center justify-center mb-3">
        <Store class="w-7 h-7" />
      </div>
      <h3 class="text-base font-bold text-app-text-base mb-1">
        {{ searchQuery ? 'Không tìm thấy sản phẩm phù hợp' : 'Chưa có sản phẩm nào trên kệ bán lẻ' }}
      </h3>
      <p class="text-xs text-app-text-sub max-w-sm mb-4">
        {{
          searchQuery
            ? 'Hãy thử thay đổi từ khóa hoặc bộ lọc danh mục.'
            : 'Hãy chuyển sang tab "Kho NCC", mở chi tiết sản phẩm bất kỳ và bấm "Lên kệ bán lẻ" để bắt đầu.'
        }}
      </p>
      <button
        v-if="!searchQuery"
        type="button"
        @click="emit('switch-to-all')"
        class="px-4 py-2 bg-app-accent text-white rounded-xl text-xs font-bold shadow-accent touch-active inline-flex items-center gap-1.5"
      >
        <Plus class="w-4 h-4" />
        <span>Duyệt Kho NCC Để Chọn Bán</span>
      </button>
    </div>

    <!-- Product Grid / List -->
    <div v-else class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
      <div
        v-for="item in filteredProducts"
        :key="item.id"
        class="bg-app-surface border border-app-border rounded-2xl p-3 sm:p-3.5 shadow-xs hover:border-app-accent/40 transition-all flex flex-col justify-between gap-3 relative"
        :class="{ 'opacity-65 bg-app-bg/50': !item.is_active }"
      >
        <!-- Hàng 1: [Vendor Badge] [Category] - [Trạng thái Active] -->
        <div class="flex items-center justify-between gap-2">
          <div class="flex items-center gap-1.5 min-w-0 flex-wrap">
            <span
              class="text-[9.5px] font-bold px-1.5 py-0.5 rounded-md border inline-flex items-center gap-1 shrink-0"
              :class="directory.displayInfo(item.provider_id).badgeClass"
            >
              <img
                v-if="directory.displayInfo(item.provider_id).avatarUrl"
                :src="directory.displayInfo(item.provider_id).avatarUrl || ''"
                referrerpolicy="no-referrer"
                alt=""
                class="w-3 h-3 rounded-full object-cover"
              />
              <span class="truncate max-w-[80px]">{{ directory.displayInfo(item.provider_id).name }}</span>
            </span>

            <span class="text-[9.5px] font-semibold px-1.5 py-0.5 rounded bg-app-bg border border-app-border text-app-text-sub shrink-0">
              {{ item.category || 'Khác' }}
            </span>

            <span
              class="text-[9.5px] font-bold px-1.5 py-0.5 rounded shrink-0"
              :class="item.in_stock ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'bg-rose-500/10 text-rose-500'"
            >
              {{ item.in_stock ? 'Còn hàng' : 'Hết hàng' }}
            </span>
          </div>

          <!-- Trạng thái hiển thị trên /product -->
          <button
            type="button"
            @click="handleToggleStatus(item)"
            class="text-[10px] font-bold px-2 py-0.5 rounded-full border transition-all touch-active flex items-center gap-1 shrink-0"
            :class="
              item.is_active
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400'
                : 'bg-slate-500/10 border-slate-500/30 text-slate-500'
            "
            :title="item.is_active ? 'Đang hiển thị trên /product (Bấm để ẩn)' : 'Đang ẩn khỏi /product (Bấm để hiển thị)'"
          >
            <Eye v-if="item.is_active" class="w-3 h-3" />
            <EyeOff v-else class="w-3 h-3" />
            <span>{{ item.is_active ? 'Đang hiện' : 'Đang ẩn' }}</span>
          </button>
        </div>

        <!-- Hàng 2: Tên sản phẩm hiển thị & Tên gốc -->
        <div class="space-y-1">
          <h4 class="font-bold text-xs sm:text-sm text-app-text-base leading-snug line-clamp-2">
            {{ item.name }}
          </h4>
          <p
            v-if="item.name !== item.original_name"
            class="text-[11px] text-app-text-sub font-mono truncate"
            :title="`Tên gốc: ${item.original_name}`"
          >
            Gốc: {{ item.original_name }}
          </p>
        </div>

        <!-- Hàng 3: So sánh Giá vốn vs Giá bán & Lãi gộp -->
        <div class="p-2.5 bg-app-bg border border-app-border/70 rounded-xl flex items-center justify-between gap-2">
          <div>
            <span class="text-[10px] text-app-text-sub block">Giá vốn NCC:</span>
            <span class="text-xs font-mono font-semibold text-app-text-sub">
              {{ (item.original_price || 0).toLocaleString('vi-VN') }} đ
            </span>
          </div>

          <div class="text-center">
            <span class="text-[10px] text-app-text-sub block">Lãi gộp:</span>
            <span
              class="text-xs font-mono font-bold"
              :class="(item.profit_vnd || 0) >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500'"
            >
              {{ (item.profit_vnd || 0) >= 0 ? '+' : '' }}{{ (item.profit_vnd || 0).toLocaleString('vi-VN') }} đ
            </span>
          </div>

          <div class="text-right">
            <span class="text-[10px] text-app-text-sub block">Giá niêm yết:</span>
            <span class="text-sm font-mono font-bold text-app-accent">
              {{ item.selling_price.toLocaleString('vi-VN') }} đ
            </span>
          </div>
        </div>

        <!-- Hàng 4: Thao tác Sửa / Xóa -->
        <div class="flex items-center justify-end gap-2 pt-1 border-t border-app-border/40">
          <button
            type="button"
            @click="openEditModal(item)"
            class="px-3 py-1.5 rounded-xl bg-app-bg hover:bg-app-surface-hover border border-app-border text-xs font-semibold text-app-text inline-flex items-center gap-1.5 transition-colors touch-active"
          >
            <Edit2 class="w-3.5 h-3.5 text-app-accent" />
            <span>Sửa giá & mô tả</span>
          </button>

          <button
            type="button"
            @click="handleDelete(item)"
            class="p-1.5 rounded-xl text-app-text-sub hover:text-rose-500 hover:bg-rose-500/10 transition-colors touch-active"
            title="Gỡ khỏi kệ bán lẻ"
          >
            <Trash2 class="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>

    <!-- Modal Chỉnh Sửa Sản Phẩm Bán Lẻ -->
    <RetailProductModal
      :is-open="isEditModalOpen"
      :existing-retail-product="editingProduct"
      @close="isEditModalOpen = false"
      @saved="catalogStore.fetchAdminCatalog"
    />
  </div>
</template>
