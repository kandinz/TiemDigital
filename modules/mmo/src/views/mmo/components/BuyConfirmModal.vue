<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { apiClient } from '@/services/api.client';
import BottomSheet from '@/components/common/BottomSheet.vue';
import { useAuthStore } from '@/stores/auth.store';
import { useMmoCatalogStore } from '@/stores/mmoCatalog.store';
import { Store, ShoppingCart, RefreshCw, CheckCircle2, AlertTriangle, Key, ExternalLink, X, Copy, Check, ChevronDown, ChevronUp } from 'lucide-vue-next';
import { formatProductDescription } from '@/utils/textFormatter';
import { useMmoProvidersStore } from '@/stores/mmoProviders.store';
import { useMmoMoneyStore } from '@/stores/mmoMoney.store';
import { useToastStore } from '@/stores/toast.store';

const props = defineProps<{
  isOpen: boolean;
  product: any | null;
  providerBalance?: string | null;
}>();

const money = useMmoMoneyStore();
const formatMoney = money.format;

const directory = useMmoProvidersStore();
const vendor = computed(() => directory.displayInfo(props.product?.provider_id ?? ''));
const botUrl = computed(() => vendor.value.botUrl);
const avatarUrl = computed(() => vendor.value.avatarUrl);
const providerName = computed(() => (props.product ? vendor.value.name : ''));
const vendorBadgeClass = computed(() => vendor.value.badgeClass);

const displayVendorBalance = computed(() => {
  if (props.providerBalance) return props.providerBalance;
  if (!props.product?.provider_id) return null;
  const p = directory.providers.find(x => x.id === props.product.provider_id);
  if (p && p.balance !== null && p.balance !== undefined) {
    return money.format(Number(p.balance) || 0, p.balance, p.balance_currency || 'USD');
  }
  return null;
});

const openTelegramBot = (e?: MouseEvent) => {
  e?.stopPropagation();
  directory.openBot(props.product?.provider_id ?? '');
};

const stockDisplay = computed(() => {
  if (!props.product) return '';
  const rawStock = props.product.extra?.stock;
  if (typeof rawStock === 'number') {
    return `Kho: ${rawStock}`;
  }
  if (typeof rawStock === 'string' && rawStock.trim() !== '' && !isNaN(Number(rawStock))) {
    return `Kho: ${rawStock}`;
  }
  return props.product.in_stock ? 'Còn hàng' : 'Hết hàng';
});

const formattedDescription = computed(() => {
  return formatProductDescription(props.product?.extra?.description);
});

const formattedRequirements = computed(() => {
  return formatProductDescription(props.product?.extra?.purchaseRequirements);
});

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'order-success', order: any): void;
  (e: 'retail-config', product: any): void;
}>();

const toast = useToastStore();
const authStore = useAuthStore();
const isAdmin = computed(() => authStore.user?.role === 'admin');
const catalogStore = useMmoCatalogStore();
const retailItem = computed(() => {
  if (!props.product?.provider_id) return null;
  return catalogStore.getByVendorKey(props.product.provider_id, props.product.provider_product_id);
});
const quantity = ref(1);
const email = ref('');
const isSubmitting = ref(false);
const submitError = ref('');
const orderResult = ref<any>(null);
const copiedIndex = ref<string | null>(null);
const showRawJson = ref(false);

const isUrl = (val: string): boolean => {
  return /^https?:\/\//i.test(String(val || '').trim());
};

const cleanItemValue = (item: any): string => {
  if (item == null) return '';
  if (typeof item === 'object') {
    return (
      item.account_data ||
      item.key ||
      item.link ||
      item.url ||
      item.account ||
      item.data ||
      item.content ||
      item.code ||
      item.token ||
      item.serial ||
      JSON.stringify(item)
    );
  }
  if (typeof item === 'string') {
    const trimmed = item.trim();
    if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
      try {
        const parsed = JSON.parse(trimmed);
        if (parsed && typeof parsed === 'object') {
          return cleanItemValue(parsed);
        }
      } catch {}
    }
    return item;
  }
  return String(item);
};

const extractKeysFromPayload = (payload: any): string[] => {
  if (!payload) return [];
  if (Array.isArray(payload)) {
    return payload.map(p => (typeof p === 'string' ? p : JSON.stringify(p)));
  }
  if (typeof payload === 'string') return [payload];

  const listKeys = [
    'deliveredKey', 'deliveredKeys',
    'key', 'keys',
    'deliveredAccount', 'deliveredAccounts',
    'account', 'accounts',
    'licenseKey', 'license_key', 'license',
    'deliveredFileRef', 'deliveredFile',
    'code', 'codes',
    'token', 'tokens',
    'serial', 'serials',
    'delivered_items', 'delivered_data'
  ];

  const containers = [payload, payload.order, payload.data, payload.result].filter(
    c => c && typeof c === 'object' && !Array.isArray(c)
  );

  for (const k of listKeys) {
    for (const c of containers) {
      if (c[k] != null) {
        const val = c[k];
        if (Array.isArray(val)) return val.map(v => (typeof v === 'string' ? v : JSON.stringify(v)));
        if (typeof val === 'string') return [val];
        return [JSON.stringify(val)];
      }
    }
  }

  if (Array.isArray(payload.delivered_items) && payload.delivered_items.length > 0) {
    return payload.delivered_items;
  }

  return [];
};

const copyToClipboard = async (text: string, id: string) => {
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
    copiedIndex.value = id;
    toast.success('Đã sao chép');
    setTimeout(() => {
      if (copiedIndex.value === id) copiedIndex.value = null;
    }, 2000);
  } catch {
    toast.error('Không thể sao chép');
  }
};

const copyAllKeys = () => {
  if (extractedKeys.value.length > 0) {
    copyToClipboard(extractedKeys.value.join('\n'), 'all-keys');
  }
};

const requiresEmail = computed(() => {
  if (!props.product) return false;
  const extra = props.product.extra || {};
  return extra.requiresEmailActivation === true || 
         extra.productType === 'slot' || 
         extra.requiresCustomerEmail === true ||
         props.product.delivery_type === 'invite' ||
         !!extra.purchaseRequirements;
});

const isEmailValid = computed(() => {
  if (!requiresEmail.value) return true;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value);
});

const canSubmit = computed(() => {
  const q = Number(quantity.value);
  return q > 0 && 
         isEmailValid.value && 
         !isSubmitting.value && 
         !orderResult.value && 
         props.product?.in_stock;
});

const onQuantityBlur = () => {
  if (!quantity.value || quantity.value < 1) {
    quantity.value = 1;
  }
};

watch(() => props.isOpen, (newVal) => {
  if (newVal) {
    quantity.value = 1;
    email.value = '';
    isSubmitting.value = false;
    submitError.value = '';
    orderResult.value = null;
    showRawJson.value = false;
  }
});

const submitOrder = async () => {
  if (!canSubmit.value || !props.product) return;
  
  isSubmitting.value = true;
  submitError.value = '';
  
  try {
    const qty = Math.max(1, Number(quantity.value) || 1);
    const payload: any = {
      provider_id: props.product.provider_id,
      product_id: props.product.provider_product_id,
      product_name: props.product.name,
      unit_price: props.product.price_usd,
      total_price: Number((props.product.price_usd * qty).toFixed(2)),
      quantity: qty
    };
    
    if (requiresEmail.value && email.value) {
      payload.email = email.value;
    }
    
    const { data } = await apiClient.post('/mmo/order', payload);
    if (data?.success) {
      orderResult.value = data;
      emit('order-success', data);
    } else {
      submitError.value = data?.message || 'Có lỗi xảy ra khi đặt hàng';
    }
  } catch (err: any) {
    submitError.value = err.response?.data?.message || err.message || 'Lỗi mạng, vui lòng thử lại';
  } finally {
    isSubmitting.value = false;
  }
};

const extractedKeys = computed<string[]>(() => {
  if (!orderResult.value) return [];
  let items: string[] = [];
  if (Array.isArray(orderResult.value.delivered_items) && orderResult.value.delivered_items.length > 0) {
    items = orderResult.value.delivered_items;
  } else {
    items = extractKeysFromPayload(orderResult.value);
  }
  return items.map(cleanItemValue).filter((str) => str.trim().length > 0);
});
</script>

<template>
  <BottomSheet :is-open="isOpen" @close="emit('close')">
    <!-- Header: Thông tin sản phẩm & Nút đóng -->
    <template #header>
      <div v-if="product" class="flex flex-col gap-2 w-full">
        <div class="flex items-start gap-3">
          <!-- Product Image -->
          <div v-if="product.extra?.image_url" class="shrink-0">
            <img :src="product.extra.image_url" alt="" class="w-12 h-12 sm:w-14 sm:h-14 object-cover rounded-lg border border-app-border bg-white" />
          </div>
          
          <div class="flex-1 min-w-0 flex flex-col justify-center gap-1.5">
            <!-- Hàng 1: [avatar] [vendor name] [Số dư vendor] + Nút đóng ✕ -->
            <div class="flex items-center justify-between gap-2 min-w-0">
              <div class="flex items-center gap-1.5 min-w-0 flex-wrap">
                <button
                  v-if="botUrl"
                  type="button"
                  @click="openTelegramBot"
                  :title="`Mở Telegram Bot: ${providerName}`"
                  class="text-[10px] font-bold px-1.5 py-0.5 rounded border shrink-0 inline-flex items-center gap-1 hover:brightness-110 active:scale-95 transition-all cursor-pointer shadow-xs"
                  :class="vendorBadgeClass"
                >
                  <img v-if="avatarUrl" :src="avatarUrl" referrerpolicy="no-referrer" alt="" class="w-3.5 h-3.5 rounded-full object-cover shrink-0" />
                  <span>{{ providerName }}</span>
                  <ExternalLink class="w-2.5 h-2.5 opacity-70" />
                </button>
                <span 
                  v-else
                  class="text-[10px] font-bold px-1.5 py-0.5 rounded border shrink-0 inline-flex items-center gap-1"
                  :class="vendorBadgeClass"
                >
                  <img v-if="avatarUrl" :src="avatarUrl" referrerpolicy="no-referrer" alt="" class="w-3.5 h-3.5 rounded-full object-cover shrink-0" />
                  <span>{{ providerName }}</span>
                </span>

                <!-- [Số dư vendor] -->
                <span 
                  v-if="displayVendorBalance" 
                  class="font-mono font-medium text-[11px] bg-black/5 dark:bg-white/10 px-1.5 py-0.5 rounded text-app-text-sub shrink-0"
                  title="Số dư hiện tại của nhà cung cấp"
                >
                  {{ displayVendorBalance }}
                </span>
              </div>

              <!-- Nút đóng ✕ -->
              <button
                type="button"
                @click="emit('close')"
                class="text-app-text-sub hover:text-app-text p-1 -mr-1 -mt-0.5 rounded-full touch-active shrink-0 transition-colors"
                title="Đóng"
              >
                <X class="w-5 h-5" />
              </button>
            </div>

            <!-- Hàng 2: Tên sản phẩm -->
            <div class="w-full">
              <h3 class="font-bold text-app-text-base text-sm sm:text-base leading-snug break-words whitespace-normal">
                {{ product.name }}
              </h3>
            </div>

            <!-- Hàng 3: bên trái [Kho] [Loại] - bên phải: [Giá bán] (bỏ dấu -) -->
            <div class="flex items-center justify-between gap-2 text-xs flex-wrap">
              <!-- Bên trái: [Kho] [Loại] -->
              <div class="flex items-center gap-1.5 shrink-0">
                <span 
                  class="text-[11px] font-semibold px-1.5 py-0.5 rounded border shrink-0"
                  :class="product.in_stock ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400' : 'bg-rose-500/10 border-rose-500/20 text-rose-500'"
                >
                  {{ stockDisplay }}
                </span>
                <span class="text-[11px] font-semibold px-1.5 py-0.5 rounded bg-app-accent/10 text-app-accent border border-app-accent/20 shrink-0">
                  {{ product.delivery_type || 'Tự động' }}
                </span>

                <button
                  v-if="isAdmin"
                  type="button"
                  @click="emit('retail-config', product)"
                  class="text-[10px] font-bold px-2 py-0.5 rounded-lg border transition-all touch-active inline-flex items-center gap-1 shadow-xs cursor-pointer"
                  :class="retailItem ? 'bg-teal-500/15 border-teal-500/30 text-teal-600 dark:text-teal-400 hover:bg-teal-500/25' : 'bg-app-accent/10 border-app-accent/30 text-app-accent hover:bg-app-accent/20'"
                  :title="retailItem ? `Đang bán lẻ: ${retailItem.selling_price.toLocaleString('vi-VN')} đ (Bấm để sửa)` : 'Cấu hình giá và đưa sản phẩm lên kệ bán lẻ'"
                >
                  <Store class="w-3 h-3" />
                  <span>{{ retailItem ? 'Sửa kệ bán' : 'Lên kệ bán' }}</span>
                </button>
              </div>

              <!-- Bên phải: [Giá bán] -->
              <div class="shrink-0 ml-auto">
                <span class="text-sm font-mono font-bold text-app-accent">
                  {{ formatMoney(product.price_usd, product.price_original, product.currency_original) }}
                </span>
              </div>
            </div>
          </div>
        </div>
        
        <!-- Yêu cầu bổ sung nếu có (Cố định ở header) -->
        <div v-if="product.extra?.requiresEmailActivation" class="text-xs text-amber-500 font-semibold bg-amber-500/10 border border-amber-500/20 px-2.5 py-1.5 rounded-lg mt-0.5">
          ⚠️ Sản phẩm này cần email kích hoạt
        </div>
        <div v-if="formattedRequirements" class="text-xs text-app-text-sub bg-black/5 dark:bg-white/5 border border-app-border/40 p-2 rounded-lg whitespace-pre-wrap break-words mt-0.5">
          <span class="font-bold text-app-text">Yêu cầu:</span> {{ formattedRequirements }}
        </div>
      </div>
      <div v-else class="flex justify-end w-full">
        <button
          type="button"
          @click="emit('close')"
          class="text-app-text-sub hover:text-app-text p-1 -mr-1 rounded-full touch-active"
          title="Đóng"
        >
          <X class="w-5 h-5" />
        </button>
      </div>
    </template>

    <div v-if="product" class="space-y-3 pb-2">
      <!-- Không gian xem mô tả chi tiết sản phẩm trải phẳng (Flat Harmonic) -->
      <div 
        v-if="formattedDescription && !orderResult" 
        class="whitespace-pre-wrap break-words [overflow-wrap:anywhere] font-mono text-xs leading-relaxed text-app-text-base select-text"
      >
        {{ formattedDescription }}
      </div>

      <!-- Result State: Status mỏng gọn & Tối đa diện tích hiển thị key/link -->
      <div v-if="orderResult" class="flex flex-col gap-3">
        <!-- Compact Status Banner -->
        <div class="flex items-center justify-between px-3 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400">
          <div class="flex items-center gap-1.5 min-w-0">
            <CheckCircle2 class="w-4 h-4 shrink-0" />
            <span class="text-xs font-bold truncate">Đặt hàng thành công!</span>
          </div>
          <span v-if="product" class="text-[11px] font-semibold text-emerald-700/80 dark:text-emerald-300/80 truncate">
            x{{ quantity }} {{ product.name }}
          </span>
        </div>

        <div
          v-if="orderResult.persisted === false"
          class="text-xs font-semibold text-amber-700 bg-amber-500/10 border border-amber-500/30 rounded-xl px-3 py-2"
        >
          ⚠️ Đơn đã mua nhưng chưa lưu được vào lịch sử. Vui lòng sao chép dữ liệu bên dưới ngay!
        </div>
        
        <div v-if="orderResult.status === 'pending' || orderResult.status === 'processing'" class="p-3 text-xs text-amber-700 bg-amber-500/10 border border-amber-500/20 rounded-xl">
          Đơn hàng đang được nhà cung cấp xử lý cấp tài khoản. Bạn có thể kiểm tra trạng thái trong tab Lịch sử.
        </div>
        
        <!-- Khối Dữ liệu / Keys đã nhận (Inputs với nút copy nhanh 1 chạm & mở link) -->
        <div v-if="extractedKeys.length > 0" class="flex flex-col gap-2">
          <div class="flex items-center justify-between text-xs font-bold text-app-text px-0.5">
            <span class="flex items-center gap-1.5 text-app-accent">
              <Key class="w-3.5 h-3.5" />
              <span>Nội dung sản phẩm / Key gửi khách:</span>
            </span>

            <button
              v-if="extractedKeys.length > 1"
              type="button"
              @click="copyAllKeys"
              class="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-emerald-700 dark:text-emerald-300 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 rounded-lg transition-colors touch-active"
            >
              <Check v-if="copiedIndex === 'all-keys'" class="w-3.5 h-3.5 text-emerald-600" />
              <Copy v-else class="w-3.5 h-3.5" />
              <span>{{ copiedIndex === 'all-keys' ? 'Đã sao chép tất cả' : 'Sao chép tất cả' }}</span>
            </button>
          </div>

          <div class="flex flex-col gap-3">
            <div 
              v-for="(key, i) in extractedKeys" 
              :key="i" 
              class="flex flex-col rounded-2xl bg-app-surface border border-app-border shadow-xs overflow-hidden focus-within:border-app-accent focus-within:ring-1 focus-within:ring-app-accent transition-all"
            >
              <!-- Card Header with Action Buttons -->
              <div class="flex items-center justify-between px-3.5 py-2 bg-app-bg/50 border-b border-app-border/60">
                <span class="text-[11px] font-bold text-app-text-sub uppercase tracking-wider flex items-center gap-1">
                  <span>Mục {{ i + 1 }}</span>
                  <span v-if="extractedKeys.length > 1">/ {{ extractedKeys.length }}</span>
                </span>

                <div class="flex items-center gap-1.5">
                  <!-- Nút mở liên kết nếu là URL -->
                  <a
                    v-if="isUrl(key)"
                    :href="key"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="px-2.5 py-1 rounded-lg text-xs font-semibold text-app-accent hover:bg-app-accent/10 border border-app-accent/20 transition-colors inline-flex items-center gap-1"
                    title="Mở liên kết"
                  >
                    <ExternalLink class="w-3.5 h-3.5" />
                    <span>Mở link</span>
                  </a>

                  <!-- Nút sao chép 1 chạm -->
                  <button
                    type="button"
                    @click="copyToClipboard(key, 'key-' + i)"
                    class="px-2.5 py-1 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 transition-colors touch-active flex items-center gap-1 font-bold text-xs"
                    :title="'Sao chép mục ' + (i + 1)"
                  >
                    <Check v-if="copiedIndex === 'key-' + i" class="w-3.5 h-3.5 text-emerald-600" />
                    <Copy v-else class="w-3.5 h-3.5" />
                    <span>{{ copiedIndex === 'key-' + i ? 'Đã chép' : 'Sao chép' }}</span>
                  </button>
                </div>
              </div>

              <!-- Textarea to rộng, wrap xuống dòng -->
              <div class="p-2.5">
                <textarea
                  readonly
                  :value="key"
                  rows="4"
                  @focus="($event.target as HTMLTextAreaElement).select()"
                  @click="($event.target as HTMLTextAreaElement).select()"
                  class="w-full p-3 bg-app-bg rounded-xl font-mono text-xs sm:text-sm text-app-text select-all focus:outline-none resize-y border border-app-border/40 leading-relaxed whitespace-pre-wrap break-all min-h-[90px]"
                  placeholder="Nội dung sản phẩm..."
                ></textarea>
              </div>
            </div>
          </div>
        </div>

        <!-- Phản hồi kỹ thuật JSON (Accordion thu gọn ở dưới) -->
        <div class="border-t border-app-border pt-2 mt-1">
          <button
            type="button"
            @click="showRawJson = !showRawJson"
            class="flex items-center justify-between w-full text-xs text-app-text-sub hover:text-app-text font-semibold py-1 transition-colors"
          >
            <span>Phản hồi kỹ thuật JSON từ NCC</span>
            <div class="flex items-center gap-2">
              <button
                v-if="showRawJson"
                type="button"
                @click.stop="copyToClipboard(JSON.stringify(orderResult.order || orderResult, null, 2), 'raw-json')"
                class="px-2 py-0.5 text-[10px] bg-black/5 dark:bg-white/10 rounded hover:bg-black/10 transition-colors flex items-center gap-1 font-semibold"
              >
                <Check v-if="copiedIndex === 'raw-json'" class="w-3 h-3 text-emerald-500" />
                <Copy v-else class="w-3 h-3" />
                <span>{{ copiedIndex === 'raw-json' ? 'Đã sao chép' : 'Sao chép' }}</span>
              </button>
              <ChevronUp v-if="showRawJson" class="w-3.5 h-3.5" />
              <ChevronDown v-else class="w-3.5 h-3.5" />
            </div>
          </button>

          <pre
            v-if="showRawJson"
            class="mt-1 p-2.5 bg-black/5 dark:bg-white/5 rounded-xl border border-app-border text-[11px] font-mono text-app-text-sub overflow-x-auto max-h-40 whitespace-pre-wrap select-all"
          >{{ JSON.stringify(orderResult.order || orderResult, null, 2) }}</pre>
        </div>
      </div>

      <!-- Input Form: Email Input (nếu cần) & Lỗi (Đã bỏ tag số lượng ở đây) -->
      <div v-else-if="requiresEmail || submitError" class="space-y-3">
        <div v-if="requiresEmail">
          <label class="block text-sm font-semibold text-app-text-base mb-1.5">
            Email của bạn <span class="text-rose-500">*</span>
          </label>
          <input 
            v-model="email" 
            type="email" 
            placeholder="nhap-email@example.com"
            class="block w-full px-3 py-2 border border-app-border rounded-xl leading-5 bg-app-surface text-app-text placeholder-app-text-sub focus:outline-none focus:ring-1 focus:ring-app-accent focus:border-app-accent sm:text-sm"
          >
          <p class="text-[10px] text-app-text-sub mt-1">Sản phẩm này yêu cầu email để nhà cung cấp kích hoạt.</p>
        </div>
        
        <div v-if="submitError" class="p-3 bg-rose-500/10 border border-rose-500/20 rounded-lg text-rose-600 text-sm flex items-start gap-2">
          <AlertTriangle class="w-4 h-4 mt-0.5 shrink-0" />
          <span>{{ submitError }}</span>
        </div>
      </div>
    </div>

    <!-- Fixed Bottom Actions Footer -->
    <template #footer v-if="product">
      <div v-if="orderResult" class="w-full">
        <button 
          @click="emit('close')"
          class="w-full py-3 bg-app-surface border border-app-border rounded-xl font-semibold hover:bg-app-surface-hover transition-colors touch-active text-app-text-base"
        >
          Đóng
        </button>
      </div>
      <div v-else class="flex flex-col gap-3 w-full">
        <!-- Dòng tổng thanh toán thêm input số lượng ở giữa, xóa tag số lượng -->
        <div class="flex items-center justify-between gap-3 px-1">
          <span class="text-sm font-semibold text-app-text-sub shrink-0">Tổng thanh toán:</span>

          <!-- Input số lượng ở giữa -->
          <div class="flex items-center border border-app-border rounded-xl bg-app-surface overflow-hidden shadow-sm">
            <button 
              type="button"
              @click="quantity > 1 && quantity--" 
              :disabled="quantity <= 1 || isSubmitting"
              class="w-8 h-8 flex items-center justify-center text-lg font-bold text-app-text-sub hover:text-app-text hover:bg-app-surface-hover touch-active disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >-</button>
            <input 
              v-model.number="quantity" 
              type="number" 
              min="1" 
              :max="product.extra?.max_quantity || 100"
              :disabled="isSubmitting"
              @blur="onQuantityBlur"
              class="w-12 h-8 text-center font-bold text-sm bg-transparent border-x border-app-border focus:outline-none text-app-text [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            />
            <button 
              type="button"
              @click="quantity++" 
              :disabled="isSubmitting || (product.extra?.max_quantity && quantity >= product.extra.max_quantity)"
              class="w-8 h-8 flex items-center justify-center text-lg font-bold text-app-text-sub hover:text-app-text hover:bg-app-surface-hover touch-active disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >+</button>
          </div>

          <span class="font-mono font-bold text-xl text-app-accent shrink-0">
            {{ formatMoney((product.price_usd || 0) * (quantity || 1), (product.currency_original === 'VND' && product.price_original ? product.price_original * (quantity || 1) : undefined), product.currency_original) }}
          </span>
        </div>

        <div class="flex gap-3">
          <button 
            @click="emit('close')"
            :disabled="isSubmitting"
            class="flex-1 py-3 bg-app-surface border border-app-border rounded-xl font-semibold hover:bg-app-surface-hover transition-colors touch-active disabled:opacity-50 text-app-text-base"
          >
            Hủy
          </button>
          <button 
            @click="submitOrder"
            :disabled="!canSubmit"
            class="flex-1 py-3 bg-app-accent text-white rounded-xl font-semibold hover:bg-app-accent-hover transition-colors touch-active disabled:opacity-50 flex items-center justify-center gap-2 shadow-accent"
          >
            <RefreshCw v-if="isSubmitting" class="w-4 h-4 animate-spin" />
            <ShoppingCart v-else class="w-4 h-4" />
            {{ isSubmitting ? 'Đang xử lý...' : 'Xác nhận Mua' }}
          </button>
        </div>
      </div>
    </template>
  </BottomSheet>
</template>

