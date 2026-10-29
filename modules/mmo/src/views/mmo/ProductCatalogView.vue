<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { apiClient } from '@/services/api.client';
import BottomSheet from '@/components/common/BottomSheet.vue';
import { formatProductDescription } from '@/utils/textFormatter';
import {
  Search,
  ShoppingBag,
  Tag,
  Copy,
  Check,
  ExternalLink,
  ChevronRight,
  Info,
  X,
  Sparkles,
  Layers,
  Store,
  FileCode2,
} from 'lucide-vue-next';

interface PublicProduct {
  id: number;
  name: string;
  description: string;
  selling_price: number;
  category: string;
  image_url: string | null;
  in_stock: boolean;
  updated_at: string;
}

const products = ref<PublicProduct[]>([]);
const categories = ref<string[]>(['Tất cả']);
const activeCategory = ref('Tất cả');
const searchQuery = ref('');
const isLoading = ref(true);

const selectedProduct = ref<PublicProduct | null>(null);
const isDetailOpen = ref(false);
const copiedId = ref<number | string | null>(null);

onMounted(() => {
  fetchPublicCatalog();
});

const fetchPublicCatalog = async () => {
  isLoading.value = true;
  try {
    const { data } = await apiClient.get('/mmo/catalog');
    if (data?.success) {
      products.value = data.products || [];
      if (Array.isArray(data.categories) && data.categories.length > 0) {
        categories.value = ['Tất cả', ...data.categories];
      }
    }
  } catch (err) {
    console.error('Failed to load public catalog:', err);
  } finally {
    isLoading.value = false;
  }
};

const filteredProducts = computed(() => {
  return products.value.filter((p) => {
    if (activeCategory.value !== 'Tất cả' && p.category !== activeCategory.value) {
      return false;
    }
    if (searchQuery.value.trim()) {
      const q = searchQuery.value.trim().toLowerCase();
      const matchName = p.name.toLowerCase().includes(q);
      const matchDesc = p.description?.toLowerCase().includes(q);
      const matchCat = p.category?.toLowerCase().includes(q);
      return matchName || matchDesc || matchCat;
    }
    return true;
  });
});

const openDetail = (product: PublicProduct) => {
  selectedProduct.value = product;
  isDetailOpen.value = true;
};

const copyProductInfo = async (product: PublicProduct, idKey: number | string) => {
  const text = `${product.name} - Giá: ${product.selling_price.toLocaleString('vi-VN')} đ\n${formatProductDescription(product.description)}`;
  try {
    await navigator.clipboard.writeText(text);
    copiedId.value = idKey;
    setTimeout(() => {
      if (copiedId.value === idKey) copiedId.value = null;
    }, 2000);
  } catch {
    // Fallback
    const input = document.createElement('textarea');
    input.value = text;
    document.body.appendChild(input);
    input.select();
    document.execCommand('copy');
    document.body.removeChild(input);
    copiedId.value = idKey;
    setTimeout(() => {
      if (copiedId.value === idKey) copiedId.value = null;
    }, 2000);
  }
};
</script>

<template>
  <div class="min-h-[calc(100vh-64px)] pb-16 px-3 sm:px-6 lg:px-8 max-w-7xl mx-auto flex flex-col gap-4 sm:gap-6 pt-2">
    <!-- Header Hero Banner -->
    <div class="relative overflow-hidden rounded-3xl bg-gradient-to-br from-app-surface to-app-bg border border-app-border p-4 sm:p-6 shadow-sm">
      <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 relative z-10">
        <div class="space-y-1">
          <div class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-app-accent/10 text-app-accent border border-app-accent/20 text-xs font-bold tracking-tight">
            <Sparkles class="w-3.5 h-3.5" />
            <span>Bảng Giá & Danh Mục Sản Phẩm</span>
          </div>
          <h1 class="text-xl sm:text-2xl font-black text-app-text-base tracking-tight">
            Tài Khoản & Dịch Vụ MMO Bản Quyền
          </h1>
          <p class="text-xs sm:text-sm text-app-text-sub max-w-xl">
            Danh mục sản phẩm chọn lọc chất lượng cao, kích hoạt nhanh chóng, bảo hành chu đáo.
          </p>
        </div>

        <div class="flex items-center gap-2 self-stretch sm:self-auto shrink-0 flex-wrap">
          <router-link
            to="/product/swagger"
            class="px-3 py-2 rounded-2xl bg-app-bg hover:bg-app-surface-hover border border-app-border text-app-text-sub hover:text-app-text transition-colors flex items-center gap-1.5 shadow-2xs text-xs font-bold touch-active"
            title="Tài liệu Swagger API của Danh mục Sản phẩm"
          >
            <FileCode2 class="w-4 h-4 text-app-accent" />
            <span class="hidden sm:inline">Swagger API</span>
            <span class="sm:hidden">API</span>
          </router-link>

          <div class="px-3.5 py-2 rounded-2xl bg-app-bg border border-app-border text-center shadow-2xs">
            <span class="text-[10px] text-app-text-sub uppercase font-bold block tracking-wider">Đang cung cấp</span>
            <span class="text-sm sm:text-base font-black font-mono text-app-accent">{{ products.length }}</span>
            <span class="text-[10px] text-app-text-sub ml-1">sản phẩm</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Search & Category Filters Bar -->
    <div class="flex flex-col gap-2.5">
      <!-- Search Input -->
      <div class="relative w-full">
        <div class="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
          <Search class="h-4 w-4 text-app-text-sub" />
        </div>
        <input
          v-model="searchQuery"
          type="text"
          placeholder="Tìm kiếm tài khoản, gói cước, dịch vụ... (vd: Netflix, ChatGPT, Gemini)"
          class="block w-full pl-10 pr-9 py-2.5 sm:py-3 text-xs sm:text-sm bg-app-surface border border-app-border rounded-2xl text-app-text placeholder-app-text-sub focus:outline-none focus:ring-1 focus:ring-app-accent focus:border-app-accent shadow-xs transition-colors"
        />
        <button
          v-if="searchQuery"
          type="button"
          @click="searchQuery = ''"
          class="absolute inset-y-0 right-0 pr-3 flex items-center text-app-text-sub hover:text-app-text"
        >
          <X class="w-4 h-4" />
        </button>
      </div>

      <!-- Horizontal Scrollable Category Chips -->
      <div class="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-hide pt-0.5">
        <button
          v-for="cat in categories"
          :key="cat"
          type="button"
          @click="activeCategory = cat"
          class="px-3 py-1.5 rounded-xl text-xs font-bold transition-all touch-active shrink-0 border select-none"
          :class="
            activeCategory === cat
              ? 'bg-app-accent text-white border-app-accent shadow-accent'
              : 'bg-app-surface border-app-border text-app-text-sub hover:text-app-text hover:bg-app-surface-hover shadow-2xs'
          "
        >
          {{ cat }}
        </button>
      </div>
    </div>

    <!-- Loading Skeleton -->
    <div v-if="isLoading && products.length === 0" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4">
      <div v-for="i in 8" :key="i" class="bg-app-surface border border-app-border rounded-2xl p-4 flex flex-col justify-between h-[160px] animate-pulse">
        <div class="h-4 bg-app-border rounded w-1/3 mb-2"></div>
        <div class="h-5 bg-app-border rounded w-3/4 mb-1"></div>
        <div class="h-3 bg-app-border rounded w-full mb-3"></div>
        <div class="flex justify-between items-center pt-2 border-t border-app-border/40">
          <div class="h-5 bg-app-border rounded w-24"></div>
          <div class="h-7 bg-app-border rounded w-16"></div>
        </div>
      </div>
    </div>

    <!-- Empty State -->
    <div
      v-else-if="filteredProducts.length === 0"
      class="flex flex-col items-center justify-center p-12 text-center bg-app-surface border border-app-border rounded-3xl border-dashed my-4"
    >
      <div class="w-16 h-16 rounded-2xl bg-slate-500/10 text-slate-500 flex items-center justify-center mb-3">
        <ShoppingBag class="w-8 h-8 opacity-40" />
      </div>
      <h3 class="text-base font-bold text-app-text-base mb-1">Không tìm thấy sản phẩm</h3>
      <p class="text-xs text-app-text-sub max-w-sm">
        {{ searchQuery ? `Không có sản phẩm nào khớp với từ khóa "${searchQuery}".` : 'Chưa có sản phẩm nào trong danh mục này.' }}
      </p>
    </div>

    <!-- Product Grid (Responsive PC & Mobile) -->
    <div v-else class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4">
      <div
        v-for="product in filteredProducts"
        :key="product.id"
        @click="openDetail(product)"
        class="bg-app-surface border border-app-border hover:border-app-accent/60 rounded-2xl p-3.5 sm:p-4 shadow-xs hover:shadow-md transition-all flex flex-col justify-between gap-3 cursor-pointer group"
      >
        <!-- Top: Category Tag + Stock Status -->
        <div class="flex items-center justify-between gap-2">
          <span class="text-[10px] font-bold px-2 py-0.5 rounded-lg bg-app-bg border border-app-border text-app-text-sub uppercase tracking-wider">
            {{ product.category || 'Khác' }}
          </span>

          <span
            class="text-[10px] font-bold px-2 py-0.5 rounded-full"
            :class="product.in_stock ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'bg-rose-500/10 text-rose-500'"
          >
            {{ product.in_stock ? 'Còn hàng' : 'Tạm hết' }}
          </span>
        </div>

        <!-- Middle: Product Name & Description Excerpt -->
        <div class="space-y-1.5 flex-1 flex flex-col justify-start">
          <h3 class="font-bold text-sm sm:text-base text-app-text-base leading-snug group-hover:text-app-accent transition-colors line-clamp-2">
            {{ product.name }}
          </h3>

          <p
            v-if="product.description"
            class="text-xs text-app-text-sub line-clamp-3 leading-relaxed whitespace-pre-wrap select-text"
          >
            {{ formatProductDescription(product.description) }}
          </p>
        </div>

        <!-- Bottom: Price & Quick Action Buttons -->
        <div class="pt-2.5 border-t border-app-border/40 flex items-center justify-between gap-2 mt-auto">
          <div>
            <span class="text-[10px] text-app-text-sub block font-medium">Giá niêm yết:</span>
            <span class="text-base sm:text-lg font-mono font-black text-app-accent">
              {{ product.selling_price.toLocaleString('vi-VN') }}
              <span class="text-xs font-bold text-app-text-sub">đ</span>
            </span>
          </div>

          <div class="flex items-center gap-1.5">
            <!-- Nút Sao Chép -->
            <button
              type="button"
              @click.stop="copyProductInfo(product, product.id)"
              class="p-2 rounded-xl bg-app-bg hover:bg-app-surface-hover border border-app-border text-app-text-sub hover:text-app-text transition-colors touch-active"
              :title="copiedId === product.id ? 'Đã sao chép' : 'Sao chép thông tin sản phẩm'"
            >
              <Check v-if="copiedId === product.id" class="w-4 h-4 text-emerald-500" />
              <Copy v-else class="w-4 h-4" />
            </button>

            <!-- Nút Xem Chi Tiết -->
            <button
              type="button"
              class="px-2.5 py-1.5 rounded-xl bg-app-accent/10 hover:bg-app-accent/20 text-app-accent font-bold text-xs transition-colors touch-active flex items-center gap-1"
            >
              <span>Xem</span>
              <ChevronRight class="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Product Detail BottomSheet / Modal -->
    <BottomSheet :is-open="isDetailOpen" @close="isDetailOpen = false">
      <template #header>
        <div v-if="selectedProduct" class="flex items-center justify-between w-full">
          <div class="flex items-center gap-2">
            <span class="text-[10px] font-bold px-2 py-0.5 rounded-lg bg-app-bg border border-app-border text-app-text-sub uppercase tracking-wider">
              {{ selectedProduct.category || 'Khác' }}
            </span>
            <span
              class="text-[10px] font-bold px-2 py-0.5 rounded-full"
              :class="selectedProduct.in_stock ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'bg-rose-500/10 text-rose-500'"
            >
              {{ selectedProduct.in_stock ? 'Còn hàng' : 'Tạm hết' }}
            </span>
          </div>

          <button
            type="button"
            @click="isDetailOpen = false"
            class="p-1 text-app-text-sub hover:text-app-text rounded-full touch-active"
          >
            <X class="w-5 h-5" />
          </button>
        </div>
      </template>

      <div v-if="selectedProduct" class="space-y-4 pb-2 select-text">
        <!-- Tên sản phẩm & Giá bán to rõ -->
        <div class="space-y-2 p-3.5 bg-app-surface border border-app-border rounded-2xl">
          <h2 class="text-base sm:text-lg font-black text-app-text-base leading-snug">
            {{ selectedProduct.name }}
          </h2>

          <div class="flex items-baseline gap-1.5 pt-1">
            <span class="text-xs text-app-text-sub font-semibold">Giá niêm yết:</span>
            <span class="text-2xl font-mono font-black text-app-accent">
              {{ selectedProduct.selling_price.toLocaleString('vi-VN') }}
            </span>
            <span class="text-sm font-bold text-app-text">VNĐ</span>
          </div>
        </div>

        <!-- Khối Mô Tả Sản Phẩm Chi Tiết (Full formatted) -->
        <div class="space-y-1.5">
          <span class="text-xs font-bold text-app-text uppercase tracking-wider block px-1">
            Mô Tả & Hướng Dẫn Sử Dụng
          </span>

          <div
            v-if="selectedProduct.description"
            class="p-3.5 sm:p-4 bg-app-bg border border-app-border rounded-2xl font-mono text-xs leading-relaxed text-app-text whitespace-pre-wrap break-words select-text max-h-[50vh] overflow-y-auto"
          >
            {{ formatProductDescription(selectedProduct.description) }}
          </div>
          <div v-else class="p-4 bg-app-bg border border-app-border rounded-2xl text-xs text-app-text-sub text-center italic">
            Chưa có mô tả chi tiết cho sản phẩm này.
          </div>
        </div>
      </div>

      <template #footer v-if="selectedProduct">
        <div class="flex items-center justify-between gap-2 w-full">
          <button
            type="button"
            @click="copyProductInfo(selectedProduct, 'detail')"
            class="flex-1 py-2.5 rounded-xl border border-app-border bg-app-surface hover:bg-app-surface-hover text-app-text font-bold text-xs transition-colors touch-active flex items-center justify-center gap-1.5 shadow-xs"
          >
            <Check v-if="copiedId === 'detail'" class="w-4 h-4 text-emerald-500" />
            <Copy v-else class="w-4 h-4" />
            <span>{{ copiedId === 'detail' ? 'Đã sao chép' : 'Sao chép thông tin' }}</span>
          </button>

          <button
            type="button"
            @click="isDetailOpen = false"
            class="px-5 py-2.5 rounded-xl bg-app-accent text-white font-bold text-xs hover:bg-app-accent-hover transition-colors touch-active shadow-accent"
          >
            Đóng
          </button>
        </div>
      </template>
    </BottomSheet>
  </div>
</template>

<style scoped>
.scrollbar-hide::-webkit-scrollbar {
  display: none;
}
.scrollbar-hide {
  -ms-overflow-style: none;
  scrollbar-width: none;
}
</style>
