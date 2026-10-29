<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import BottomSheet from '@/components/common/BottomSheet.vue';
import { useMmoCatalogStore, type RetailProduct } from '@/stores/mmoCatalog.store';
import { useMmoMoneyStore } from '@/stores/mmoMoney.store';
import { useMmoProvidersStore } from '@/stores/mmoProviders.store';
import { formatProductDescription } from '@/utils/textFormatter';
import {
  Store,
  DollarSign,
  Tag,
  FileText,
  RotateCcw,
  Check,
  X,
  Trash2,
  ExternalLink,
  Layers,
  Sparkles,
  TrendingUp,
} from 'lucide-vue-next';

const props = defineProps<{
  isOpen: boolean;
  // Có thể truyền vào từ ProductCard / BuyConfirmModal (vendor product) hoặc từ danh sách retail product (admin)
  vendorProduct?: any | null;
  existingRetailProduct?: RetailProduct | null;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'saved'): void;
}>();

const catalogStore = useMmoCatalogStore();
const money = useMmoMoneyStore();
const directory = useMmoProvidersStore();

const isSubmitting = ref(false);

// Form fields
const name = ref('');
const sellingPrice = ref<number | ''>('');
const category = ref('Khác');
const description = ref('');
const isActive = ref(true);

const COMMON_CATEGORIES = ['AI', 'Giải trí', 'Học tập', 'Thiết kế', 'Tiện ích', 'VPN', 'Lưu trữ', 'Khác'];

// Thông tin nhà cung cấp & giá vốn
const providerId = computed(() => {
  return props.existingRetailProduct?.provider_id || props.vendorProduct?.provider_id || '';
});

const providerProductId = computed(() => {
  return (
    props.existingRetailProduct?.provider_product_id ||
    String(props.vendorProduct?.provider_product_id || props.vendorProduct?.id || '')
  );
});

const vendorInfo = computed(() => directory.displayInfo(providerId.value));

const originalName = computed(() => {
  return props.existingRetailProduct?.original_name || props.vendorProduct?.name || '';
});

const originalDescription = computed(() => {
  if (props.existingRetailProduct) {
    return props.existingRetailProduct.original_description || '';
  }
  return formatProductDescription(props.vendorProduct?.extra?.description || '');
});

const originalPriceVnd = computed(() => {
  if (props.existingRetailProduct) {
    return props.existingRetailProduct.original_price || 0;
  }
  if (!props.vendorProduct) return 0;
  if (props.vendorProduct.currency_original === 'VND' && props.vendorProduct.price_original) {
    return Number(props.vendorProduct.price_original) || 0;
  }
  return Math.round((Number(props.vendorProduct.price_usd) || 0) * (money.usdRate || 25500));
});

const originalPriceUsd = computed(() => {
  if (props.existingRetailProduct) {
    return props.existingRetailProduct.original_price_usd || 0;
  }
  return Number(props.vendorProduct?.price_usd) || 0;
});

// Tính toán lợi nhuận dự kiến
const estimatedProfitVnd = computed(() => {
  if (typeof sellingPrice.value !== 'number' || sellingPrice.value <= 0) return 0;
  return sellingPrice.value - originalPriceVnd.value;
});

const estimatedMargin = computed(() => {
  if (typeof sellingPrice.value !== 'number' || sellingPrice.value <= 0) return 0;
  if (originalPriceVnd.value <= 0) return 100;
  return Math.round((estimatedProfitVnd.value / originalPriceVnd.value) * 100);
});

// Đồng bộ form khi modal mở hoặc prop thay đổi
watch(
  () => props.isOpen,
  (open) => {
    if (open) {
      if (props.existingRetailProduct) {
        name.value = props.existingRetailProduct.name;
        sellingPrice.value = props.existingRetailProduct.selling_price;
        category.value = props.existingRetailProduct.category || 'Khác';
        description.value = props.existingRetailProduct.description || '';
        isActive.value = Boolean(props.existingRetailProduct.is_active);
      } else if (props.vendorProduct) {
        // Kiểm tra xem đã có trên kệ chưa
        const found = catalogStore.getByVendorKey(props.vendorProduct.provider_id, props.vendorProduct.provider_product_id);
        if (found) {
          name.value = found.name;
          sellingPrice.value = found.selling_price;
          category.value = found.category || 'Khác';
          description.value = found.description || '';
          isActive.value = Boolean(found.is_active);
        } else {
          name.value = props.vendorProduct.name || '';
          // Gợi ý giá bán = Giá vốn + 20% làm tròn lên hàng nghìn
          const suggested = Math.ceil((originalPriceVnd.value * 1.25) / 1000) * 1000;
          sellingPrice.value = suggested > 0 ? suggested : '';
          category.value = props.vendorProduct.category || 'Khác';
          description.value = formatProductDescription(props.vendorProduct.extra?.description || '');
          isActive.value = true;
        }
      }
    }
  },
  { immediate: true }
);

const restoreDefaults = () => {
  name.value = originalName.value;
  description.value = originalDescription.value;
};

const handleSave = async () => {
  if (typeof sellingPrice.value !== 'number' || sellingPrice.value <= 0) {
    alert('Vui lòng nhập giá bán hợp lệ (lớn hơn 0)');
    return;
  }

  isSubmitting.value = true;
  try {
    if (props.existingRetailProduct) {
      const ok = await catalogStore.updateProduct(props.existingRetailProduct.id, {
        name: name.value.trim() || originalName.value,
        selling_price: Number(sellingPrice.value),
        category: category.value.trim() || 'Khác',
        description: description.value,
        is_active: isActive.value,
      });
      if (ok) {
        emit('saved');
        emit('close');
      }
    } else {
      const ok = await catalogStore.upsertProduct({
        provider_id: providerId.value,
        provider_product_id: providerProductId.value,
        original_name: originalName.value,
        original_description: originalDescription.value,
        original_price_usd: originalPriceUsd.value,
        original_price: originalPriceVnd.value,
        original_currency: props.vendorProduct?.currency_original || 'USD',
        selling_price: Number(sellingPrice.value),
        name: name.value.trim() || originalName.value,
        description: description.value,
        category: category.value.trim() || 'Khác',
        image_url: props.vendorProduct?.extra?.image_url || null,
        in_stock: props.vendorProduct ? (props.vendorProduct.in_stock ? 1 : 0) : 1,
        is_active: isActive.value ? 1 : 0,
      });
      if (ok) {
        emit('saved');
        emit('close');
      }
    }
  } finally {
    isSubmitting.value = false;
  }
};

const handleDelete = async () => {
  if (!props.existingRetailProduct) return;
  if (!confirm('Bạn có chắc chắn muốn gỡ sản phẩm này khỏi kệ bán lẻ?')) return;
  isSubmitting.value = true;
  try {
    const ok = await catalogStore.deleteProduct(props.existingRetailProduct.id);
    if (ok) {
      emit('saved');
      emit('close');
    }
  } finally {
    isSubmitting.value = false;
  }
};
</script>

<template>
  <BottomSheet :is-open="isOpen" @close="emit('close')">
    <template #header>
      <div class="flex items-center justify-between w-full">
        <div class="flex items-center gap-2">
          <div class="w-8 h-8 rounded-xl bg-app-accent/10 text-app-accent flex items-center justify-center">
            <Store class="w-4 h-4" />
          </div>
          <div>
            <h3 class="font-bold text-sm sm:text-base text-app-text-base">
              {{ existingRetailProduct ? 'Cập Nhật Sản Phẩm Bán Lẻ' : 'Đưa Sản Phẩm Lên Kệ Bán Lẻ' }}
            </h3>
            <p class="text-[11px] text-app-text-sub">
              Sản phẩm sẽ được hiển thị công khai trên trang <span class="font-mono text-app-accent">/product</span>
            </p>
          </div>
        </div>

        <button
          type="button"
          @click="emit('close')"
          class="p-1 text-app-text-sub hover:text-app-text rounded-full touch-active"
        >
          <X class="w-5 h-5" />
        </button>
      </div>
    </template>

    <div class="space-y-4 pb-4 select-text">
      <!-- Card Thông Tin Gốc Từ Vendor -->
      <div class="p-3 bg-app-bg border border-app-border rounded-2xl flex flex-col gap-2">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-1.5">
            <span
              class="text-[10px] font-bold px-2 py-0.5 rounded-md border inline-flex items-center gap-1"
              :class="vendorInfo.badgeClass"
            >
              <img
                v-if="vendorInfo.avatarUrl"
                :src="vendorInfo.avatarUrl"
                referrerpolicy="no-referrer"
                alt=""
                class="w-3.5 h-3.5 rounded-full object-cover"
              />
              <span>{{ vendorInfo.name }}</span>
            </span>
            <span class="text-[10px] font-mono text-app-text-sub">#{{ providerProductId }}</span>
          </div>

          <!-- Giá vốn -->
          <div class="text-right">
            <span class="text-[10px] text-app-text-sub block">Giá vốn nhập:</span>
            <span class="text-xs font-mono font-bold text-app-text-base">
              {{ originalPriceVnd.toLocaleString('vi-VN') }} đ
              <span v-if="originalPriceUsd > 0" class="text-[10px] text-app-text-sub font-normal">
                (${{ originalPriceUsd }})
              </span>
            </span>
          </div>
        </div>

        <div class="text-xs text-app-text-sub font-medium line-clamp-1">
          <span class="font-semibold text-app-text">Gốc:</span> {{ originalName }}
        </div>
      </div>

      <!-- Trường 1: Giá Bán Lẻ (VNĐ) & Tính Lãi -->
      <div class="p-3 bg-app-surface border border-app-border rounded-2xl space-y-2">
        <label class="block text-xs font-bold text-app-text">
          Giá bán niêm yết (VNĐ) <span class="text-rose-500">*</span>
        </label>
        <div class="relative">
          <input
            v-model.number="sellingPrice"
            type="number"
            step="1000"
            min="0"
            placeholder="vd: 65000"
            class="block w-full pl-3 pr-12 py-2.5 text-base sm:text-lg font-mono font-bold bg-app-bg border border-app-border rounded-xl focus:outline-none focus:ring-1 focus:ring-app-accent focus:border-app-accent text-app-accent"
          />
          <span class="absolute inset-y-0 right-0 pr-3 flex items-center text-xs font-bold text-app-text-sub pointer-events-none">
            VNĐ
          </span>
        </div>

        <!-- Preview Lợi Nhuận Dự Kiến -->
        <div
          v-if="typeof sellingPrice === 'number' && sellingPrice > 0"
          class="flex items-center justify-between text-xs px-2.5 py-1.5 rounded-xl border"
          :class="estimatedProfitVnd >= 0 ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400' : 'bg-rose-500/10 border-rose-500/20 text-rose-500'"
        >
          <span class="flex items-center gap-1 font-semibold">
            <TrendingUp class="w-3.5 h-3.5" />
            <span>Lợi nhuận dự kiến:</span>
          </span>
          <span class="font-mono font-bold">
            {{ estimatedProfitVnd >= 0 ? '+' : '' }}{{ estimatedProfitVnd.toLocaleString('vi-VN') }} đ
            ({{ estimatedMargin }}%)
          </span>
        </div>
      </div>

      <!-- Trường 2: Tên Sản Phẩm Tùy Chỉnh -->
      <div class="space-y-1.5">
        <div class="flex items-center justify-between">
          <label class="block text-xs font-bold text-app-text">
            Tên sản phẩm hiển thị
          </label>
          <span class="text-[10px] text-app-text-sub">Mặc định dùng tên gốc</span>
        </div>
        <input
          v-model="name"
          type="text"
          :placeholder="originalName"
          class="block w-full px-3 py-2 text-xs sm:text-sm bg-app-surface border border-app-border rounded-xl focus:outline-none focus:ring-1 focus:ring-app-accent focus:border-app-accent text-app-text"
        />
      </div>

      <!-- Trường 3: Danh Mục -->
      <div class="space-y-1.5">
        <label class="block text-xs font-bold text-app-text">
          Danh mục sản phẩm
        </label>
        <input
          v-model="category"
          type="text"
          placeholder="vd: AI, Giải trí, VPN..."
          class="block w-full px-3 py-2 text-xs sm:text-sm bg-app-surface border border-app-border rounded-xl focus:outline-none focus:ring-1 focus:ring-app-accent focus:border-app-accent text-app-text"
        />
        <!-- Chip gợi ý nhanh -->
        <div class="flex flex-wrap gap-1 pt-0.5">
          <button
            v-for="cat in COMMON_CATEGORIES"
            :key="cat"
            type="button"
            @click="category = cat"
            class="px-2 py-0.5 text-[10px] font-semibold rounded-lg border transition-all touch-active"
            :class="category === cat ? 'bg-app-accent text-white border-app-accent shadow-xs' : 'bg-app-bg border-app-border text-app-text-sub hover:text-app-text'"
          >
            {{ cat }}
          </button>
        </div>
      </div>

      <!-- Trường 4: Mô Tả Sản Phẩm -->
      <div class="space-y-1.5">
        <div class="flex items-center justify-between">
          <label class="block text-xs font-bold text-app-text">
            Mô tả sản phẩm
          </label>
          <button
            type="button"
            @click="restoreDefaults"
            class="text-[10px] font-semibold text-app-accent hover:underline inline-flex items-center gap-0.5"
            title="Lấy lại tên và mô tả gốc từ nhà cung cấp"
          >
            <RotateCcw class="w-3 h-3" />
            <span>Khôi phục mặc định gốc</span>
          </button>
        </div>
        <textarea
          v-model="description"
          rows="6"
          placeholder="Nhập mô tả tính năng, bảo hành, định dạng tài khoản..."
          class="block w-full p-3 font-mono text-xs bg-app-surface border border-app-border rounded-xl focus:outline-none focus:ring-1 focus:ring-app-accent focus:border-app-accent text-app-text leading-relaxed resize-y select-text"
        ></textarea>
        <p class="text-[10px] text-app-text-sub">
          Được hiển thị dạng danh sách xuống dòng sạch đẹp khi khách bấm xem chi tiết trên <span class="font-mono">/product</span>.
        </p>
      </div>

      <!-- Trường 5: Bật/Tắt Trạng Thái Bán -->
      <div class="flex items-center justify-between p-3 bg-app-bg border border-app-border rounded-2xl">
        <div>
          <span class="text-xs font-bold text-app-text block">Hiển thị trên trang /product</span>
          <span class="text-[10px] text-app-text-sub">Tắt nếu bạn muốn tạm ẩn sản phẩm khỏi khách xem</span>
        </div>
        <label class="relative inline-flex items-center cursor-pointer">
          <input v-model="isActive" type="checkbox" class="sr-only peer" />
          <div class="w-10 h-6 bg-slate-300 dark:bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-app-accent"></div>
        </label>
      </div>
    </div>

    <!-- Footer Actions -->
    <template #footer>
      <div class="flex items-center justify-between gap-2 w-full">
        <button
          v-if="existingRetailProduct"
          type="button"
          @click="handleDelete"
          :disabled="isSubmitting"
          class="px-3 py-2.5 rounded-xl border border-rose-500/30 text-rose-500 hover:bg-rose-500/10 font-semibold text-xs transition-colors touch-active flex items-center gap-1.5"
          title="Gỡ khỏi kệ bán lẻ"
        >
          <Trash2 class="w-4 h-4" />
          <span class="hidden sm:inline">Gỡ khỏi kệ</span>
        </button>
        <div v-else />

        <div class="flex items-center gap-2">
          <button
            type="button"
            @click="emit('close')"
            :disabled="isSubmitting"
            class="px-4 py-2.5 rounded-xl border border-app-border font-semibold text-xs hover:bg-app-surface-hover text-app-text transition-colors touch-active"
          >
            Hủy
          </button>
          <button
            type="button"
            @click="handleSave"
            :disabled="isSubmitting"
            class="px-5 py-2.5 rounded-xl bg-app-accent text-white font-bold text-xs hover:bg-app-accent-hover transition-colors touch-active shadow-accent flex items-center gap-1.5 disabled:opacity-50"
          >
            <Check class="w-4 h-4" />
            <span>{{ isSubmitting ? 'Đang lưu...' : existingRetailProduct ? 'Lưu Thay Đổi' : 'Đưa Lên Kệ Bán' }}</span>
          </button>
        </div>
      </div>
    </template>
  </BottomSheet>
</template>
