<script setup lang="ts">
import { computed } from 'vue';
import { ExternalLink, Store } from 'lucide-vue-next';
import { useAuthStore } from '@/stores/auth.store';
import { useMmoProvidersStore } from '@/stores/mmoProviders.store';
import { useMmoMoneyStore } from '@/stores/mmoMoney.store';
import { useMmoCatalogStore } from '@/stores/mmoCatalog.store';

const props = defineProps<{
  product: any;
}>();

const emit = defineEmits<{
  (e: 'buy', product: any): void;
  (e: 'retail', product: any): void;
}>();

const authStore = useAuthStore();
const isAdmin = computed(() => authStore.user?.role === 'admin');

const directory = useMmoProvidersStore();
const vendor = computed(() => directory.displayInfo(props.product.provider_id));
const catalogStore = useMmoCatalogStore();

const retailInfo = computed(() => {
  return catalogStore.getByVendorKey(props.product.provider_id, props.product.provider_product_id);
});

const openBot = (e: MouseEvent) => {
  e.stopPropagation();
  directory.openBot(props.product.provider_id);
};

const money = useMmoMoneyStore();
const formatPrice = (product: any) =>
  money.format(product.price_usd || 0, product.price_original, product.currency_original);

const handleRowClick = () => {
  if (props.product.in_stock) {
    emit('buy', props.product);
  }
};
</script>

<template>
  <div class="bg-app-surface border border-app-border rounded-xl p-2 sm:p-2.5 shadow-xs hover:border-app-accent/50 hover:shadow-sm transition-all flex flex-col justify-between">
    <div
      @click="handleRowClick"
      class="flex flex-col gap-1 sm:gap-1.5 transition-colors rounded-lg flex-1 justify-between"
      :class="product.in_stock ? 'cursor-pointer group' : 'opacity-50 cursor-not-allowed'"
    >
      <!-- Dòng 1: [Avatar vendor name] [Tag kho / Tag bán lẻ] -->
      <div class="flex items-center justify-between gap-1">
        <div class="flex items-center gap-1 min-w-0">
          <button
            v-if="vendor.botUrl"
            type="button"
            @click="openBot"
            :title="`Mở Telegram Bot: ${vendor.name}`"
            class="text-[9px] sm:text-[9.5px] font-bold px-1.5 py-0.5 rounded-md border shrink-0 inline-flex items-center gap-1 hover:brightness-110 active:scale-95 transition-all cursor-pointer z-10"
            :class="vendor.badgeClass"
          >
            <img v-if="vendor.avatarUrl" :src="vendor.avatarUrl" referrerpolicy="no-referrer" alt="" class="w-3.5 h-3.5 rounded-full object-cover shrink-0" />
            <span class="truncate max-w-[65px] sm:max-w-[80px]">{{ vendor.name }}</span>
            <ExternalLink class="w-2.5 h-2.5 opacity-70 shrink-0" />
          </button>
          <span 
            v-else
            class="text-[9px] sm:text-[9.5px] font-bold px-1.5 py-0.5 rounded-md border shrink-0 inline-flex items-center gap-1"
            :class="vendor.badgeClass"
          >
            <img v-if="vendor.avatarUrl" :src="vendor.avatarUrl" referrerpolicy="no-referrer" alt="" class="w-3.5 h-3.5 rounded-full object-cover shrink-0" />
            <span class="truncate max-w-[65px] sm:max-w-[80px]">{{ vendor.name }}</span>
          </span>
        </div>

        <div class="flex items-center gap-1 shrink-0">
          <!-- Tag Bán Lẻ hoặc Nút cấu hình kệ dành cho Admin -->
          <button
            v-if="isAdmin"
            type="button"
            @click.stop="emit('retail', product)"
            class="text-[8.5px] sm:text-[9px] font-bold px-1.5 py-0.5 rounded border flex items-center gap-0.5 transition-all touch-active z-10 cursor-pointer"
            :class="retailInfo ? 'bg-teal-500/15 text-teal-600 dark:text-teal-400 border-teal-500/30 hover:bg-teal-500/25' : 'bg-app-border/40 text-app-text-sub hover:text-app-accent hover:border-app-accent/40'"
            :title="retailInfo ? `Đang bán lẻ: ${retailInfo.selling_price.toLocaleString('vi-VN')} đ (Bấm để sửa)` : 'Đưa lên kệ bán lẻ'"
          >
            <Store class="w-2.5 h-2.5" />
            <span>{{ retailInfo ? 'Kệ' : '+ Kệ' }}</span>
          </button>
          <span
            v-else-if="retailInfo"
            class="text-[8.5px] sm:text-[9px] font-bold px-1 py-0.2 rounded bg-teal-500/10 text-teal-600 dark:text-teal-400 border border-teal-500/20 flex items-center gap-0.5"
            :title="`Đang bán lẻ: ${retailInfo.selling_price.toLocaleString('vi-VN')} đ`"
          >
            <Store class="w-2.5 h-2.5" />
            <span>Kệ</span>
          </span>

          <span 
            v-if="!product.in_stock" 
            class="text-[8.5px] sm:text-[9px] font-bold text-rose-500 px-1 py-0.2 bg-rose-500/10 rounded"
          >
            Hết
          </span>
          <span 
            v-else-if="typeof product.extra?.stock === 'number'" 
            class="text-[8.5px] sm:text-[9px] font-medium text-app-text-sub px-1 py-0.2 bg-app-border/40 rounded border border-app-border/50"
            title="Số lượng tồn kho"
          >
            Kho: {{ product.extra.stock }}
          </span>
        </div>
      </div>

      <!-- Dòng 2: Tên sản phẩm -->
      <div class="text-[11px] sm:text-xs font-semibold text-app-text-base leading-snug line-clamp-2 group-hover:text-app-accent transition-colors min-h-[2rem]">
        {{ product.name }}
      </div>

      <!-- Dòng 3: Giá tiền & thao tác -->
      <div class="flex items-center justify-between pt-1 border-t border-app-border/30">
        <span class="text-xs sm:text-sm font-mono font-bold text-app-accent whitespace-nowrap">
          {{ formatPrice(product) }}
        </span>
        <span 
          v-if="product.in_stock" 
          class="text-[9.5px] sm:text-[10px] text-app-accent group-hover:underline font-semibold"
        >
          Mua
        </span>
      </div>
    </div>
  </div>
</template>
