<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { apiClient } from '@/services/api.client';
import { useToastStore } from '@/stores/toast.store';
import { useExpenseParser } from '@/composables/useExpenseParser';
import {
  X,
  TrendingUp,
  TrendingDown,
  Calendar,
  DollarSign,
  ShieldCheck,
  User,
  Package,
  ShoppingBag,
  FileText,
  Loader2,
  Check,
  ExternalLink,
} from 'lucide-vue-next';

const props = defineProps<{
  isOpen: boolean;
  prefillData?: {
    productName?: string;
    costPrice?: number;
    currency?: string;
    deliveredData?: string;
    purchaseOrderId?: string;
  } | null;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'saved'): void;
}>();

const toast = useToastStore();
const { formatMoney } = useExpenseParser();

const getTodayDate = () => new Date().toISOString().split('T')[0];

const formType = ref<'sale' | 'expense'>('sale');
const inputDate = ref<string>(getTodayDate());
const productName = ref<string>('');
const customerInfo = ref<string>('');
const costPriceRaw = ref<string>('');
const salePriceRaw = ref<string>('');
const deliveredData = ref<string>('');
const warrantyPeriod = ref<'none' | '1m' | '6m' | '12m' | '18m' | 'lifetime' | 'custom'>('none');
const isCustomWarranty = ref(false);
const customWarrantyValue = ref<number | ''>(7);
const customWarrantyUnit = ref<'d' | 'm'>('d');
const warrantyNote = ref<string>('');
const purchaseOrderId = ref<string | null>(null);

// Chi phí khác: hỗ trợ USD / VNĐ
const expenseCurrency = ref<'vnd' | 'usd'>('vnd');
const savedRate = Number(localStorage.getItem('mmo_usd_rate')) || 25500;
const exchangeRate = ref<number>(savedRate > 0 ? savedRate : 25500);

const isSubmitting = ref(false);

const WARRANTY_OPTIONS = [
  { id: 'none', label: 'Không bảo hành' },
  { id: '1m', label: '1 tháng' },
  { id: '6m', label: '6 tháng' },
  { id: '12m', label: '12 tháng' },
  { id: '18m', label: '18 tháng' },
  { id: 'lifetime', label: 'Vĩnh viễn' },
  { id: 'custom', label: 'Tùy chỉnh' },
];

const selectWarranty = (id: string) => {
  warrantyPeriod.value = id as any;
  isCustomWarranty.value = id === 'custom';
};

const parseSmartAmount = (raw: string): number => {
  if (!raw) return 0;
  const clean = raw.trim().toLowerCase().replace(/,/g, '');
  const m = clean.match(/^([\d.]+)\s*(k|tr|trieu|triệu|m|đ|vnd)?$/i);
  if (!m) {
    const num = Number(clean.replace(/[^\d.]/g, ''));
    return isNaN(num) ? 0 : Math.round(num);
  }
  const val = parseFloat(m[1]);
  if (isNaN(val)) return 0;
  const unit = (m[2] || '').toLowerCase();
  if (unit === 'k') return Math.round(val * 1000);
  if (unit === 'tr' || unit === 'trieu' || unit === 'triệu' || unit === 'm') return Math.round(val * 1000000);
  return Math.round(val);
};

const numCostPrice = computed(() => {
  if (formType.value === 'expense' && expenseCurrency.value === 'usd') {
    const rawNum = parseFloat(costPriceRaw.value.replace(/[^0-9.]/g, '')) || 0;
    return Math.round(rawNum * (exchangeRate.value > 0 ? exchangeRate.value : 25500));
  }
  return parseSmartAmount(costPriceRaw.value);
});

const numSalePrice = computed(() => parseSmartAmount(salePriceRaw.value));

const estimatedProfit = computed(() => {
  if (formType.value !== 'sale') return 0;
  return numSalePrice.value - numCostPrice.value;
});

// Xem trước ngày hết hạn bảo hành
const computedExpireDate = computed(() => {
  const period = isCustomWarranty.value
    ? `${customWarrantyValue.value || 0}${customWarrantyUnit.value}`
    : warrantyPeriod.value;

  if (!period || period === 'none' || period === 'lifetime') {
    return null;
  }
  const dMatch = period.match(/^(\d+)d$/);
  if (dMatch) {
    const days = parseInt(dMatch[1], 10);
    if (!days) return null;
    const d = new Date(inputDate.value || getTodayDate());
    if (isNaN(d.getTime())) return null;
    d.setDate(d.getDate() + days);
    return d.toISOString().split('T')[0];
  }
  const mMatch = period.match(/^(\d+)m$/);
  if (mMatch) {
    const months = parseInt(mMatch[1], 10);
    if (!months) return null;
    const d = new Date(inputDate.value || getTodayDate());
    if (isNaN(d.getTime())) return null;
    d.setMonth(d.getMonth() + months);
    return d.toISOString().split('T')[0];
  }
  return null;
});

const costPriceConvertedNote = ref<string>('');

const customerUrl = computed(() => {
  if (!customerInfo.value) return null;
  const match = customerInfo.value.match(/https?:\/\/[^\s]+/i);
  return match ? match[0] : null;
});

watch(
  () => props.prefillData,
  (val) => {
    if (val) {
      formType.value = 'sale';
      productName.value = val.productName || '';
      deliveredData.value = val.deliveredData || '';
      purchaseOrderId.value = val.purchaseOrderId || null;
      warrantyPeriod.value = 'none';
      isCustomWarranty.value = false;

      const rawCost = Number(val.costPrice) || 0;
      const isUsd = val.currency === 'USD' || (rawCost > 0 && rawCost < 500 && val.currency !== 'VND');
      const rate = exchangeRate.value > 0 ? exchangeRate.value : 25500;

      if (isUsd && rawCost > 0) {
        const vnd = Math.round(rawCost * rate);
        costPriceRaw.value = String(vnd);
        costPriceConvertedNote.value = `Quy đổi từ $${rawCost} × ${rate.toLocaleString('vi-VN')} ₫`;
      } else {
        costPriceRaw.value = rawCost > 0 ? String(Math.round(rawCost)) : '';
        costPriceConvertedNote.value = '';
      }
    } else {
      costPriceConvertedNote.value = '';
    }
  },
  { immediate: true }
);

const resetForm = () => {
  productName.value = '';
  customerInfo.value = '';
  costPriceRaw.value = '';
  salePriceRaw.value = '';
  deliveredData.value = '';
  warrantyPeriod.value = 'none';
  isCustomWarranty.value = false;
  customWarrantyValue.value = 7;
  customWarrantyUnit.value = 'd';
  warrantyNote.value = '';
  purchaseOrderId.value = null;
  expenseCurrency.value = 'vnd';
  costPriceConvertedNote.value = '';
};

const handleClose = () => {
  resetForm();
  emit('close');
};

const handleSubmit = async () => {
  if (!productName.value.trim()) {
    toast.warning('Vui lòng nhập tên sản phẩm / khoản chi');
    return;
  }

  if (formType.value === 'sale' && numSalePrice.value <= 0) {
    toast.warning('Vui lòng nhập giá bán lớn hơn 0');
    return;
  }

  if (formType.value === 'expense' && numCostPrice.value <= 0) {
    toast.warning('Vui lòng nhập số tiền chi phí lớn hơn 0');
    return;
  }

  isSubmitting.value = true;
  try {
    const resolvedWarranty = isCustomWarranty.value
      ? (customWarrantyValue.value && Number(customWarrantyValue.value) > 0
          ? `${customWarrantyValue.value}${customWarrantyUnit.value}`
          : 'none')
      : warrantyPeriod.value;

    const payload = {
      type: formType.value,
      date: inputDate.value || getTodayDate(),
      product_name: productName.value.trim(),
      customer_info: formType.value === 'sale' ? customerInfo.value.trim() : null,
      cost_price: numCostPrice.value,
      sale_price: formType.value === 'sale' ? numSalePrice.value : 0,
      delivered_data: deliveredData.value.trim() || null,
      warranty_period: formType.value === 'sale' ? resolvedWarranty : 'none',
      warranty_note: warrantyNote.value.trim() || null,
      purchase_order_id: purchaseOrderId.value || null,
    };

    await apiClient.post('/mmo/transactions', payload);
    toast.success(
      formType.value === 'sale'
        ? `Đã tạo đơn bán "${productName.value.trim()}" thành công`
        : `Đã ghi nhận chi phí ${formatMoney(numCostPrice.value)}`
    );
    emit('saved');
    handleClose();
  } catch (err: any) {
    toast.error(err.response?.data?.message || err.message || 'Lỗi khi lưu giao dịch');
  } finally {
    isSubmitting.value = false;
  }
};
</script>

<template>
  <div
    v-if="isOpen"
    class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fade-in"
    @click.self="handleClose"
  >
    <div
      class="bg-app-surface border border-app-border rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
    >
      <!-- Modal Header -->
      <div class="flex items-center justify-between px-5 py-4 border-b border-app-border">
        <div class="flex items-center gap-2">
          <div
            class="w-9 h-9 rounded-xl flex items-center justify-center font-bold text-white shadow-xs"
            :class="formType === 'sale' ? 'bg-emerald-500 shadow-emerald-500/20' : 'bg-rose-500 shadow-rose-500/20'"
          >
            <TrendingUp v-if="formType === 'sale'" class="w-5 h-5" />
            <TrendingDown v-else class="w-5 h-5" />
          </div>
          <div class="flex flex-col">
            <h3 class="font-bold text-base text-app-text">
              {{ formType === 'sale' ? 'Ghi Nhận Đơn Bán Hàng' : 'Ghi Nhận Chi Phí Phát Sinh' }}
            </h3>
            <span class="text-xs text-app-text-sub">
              {{ formType === 'sale' ? 'Lưu trữ giá vốn, giá bán và bảo hành' : 'Chi phí proxy, server, tool...' }}
            </span>
          </div>
        </div>
        <button
          @click="handleClose"
          class="p-2 rounded-xl text-app-text-sub hover:text-app-text hover:bg-app-bg transition-colors"
        >
          <X class="w-5 h-5" />
        </button>
      </div>

      <!-- Modal Body (Scrollable) -->
      <div class="p-5 overflow-y-auto flex flex-col gap-4">
        <!-- Bộ chọn Loại: Bán hàng vs Chi phí khác -->
        <div class="grid grid-cols-2 gap-2 p-1 rounded-2xl bg-app-bg border border-app-border">
          <button
            type="button"
            @click="formType = 'sale'"
            class="py-2.5 px-3 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-all touch-active"
            :class="
              formType === 'sale'
                ? 'bg-emerald-500 text-white shadow-md shadow-emerald-500/20'
                : 'text-app-text-sub hover:text-emerald-500'
            "
          >
            <TrendingUp class="w-4 h-4" />
            <span>Đơn Bán Hàng (+)</span>
          </button>
          <button
            type="button"
            @click="formType = 'expense'"
            class="py-2.5 px-3 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-all touch-active"
            :class="
              formType === 'expense'
                ? 'bg-rose-500 text-white shadow-md shadow-rose-500/20'
                : 'text-app-text-sub hover:text-rose-500'
            "
          >
            <TrendingDown class="w-4 h-4" />
            <span>Chi Phí Khác (-)</span>
          </button>
        </div>

        <!-- Hàng: Ngày ghi nhận -->
        <div class="flex items-center gap-2">
          <div class="relative flex-1">
            <Calendar class="w-4 h-4 text-app-text-sub absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="date"
              v-model="inputDate"
              class="w-full pl-10 pr-3 py-2.5 rounded-xl bg-app-bg border border-app-border text-app-text text-sm font-medium focus:outline-none focus:border-app-accent transition-all"
            />
          </div>
          <button
            type="button"
            @click="inputDate = getTodayDate()"
            class="px-3.5 py-2.5 rounded-xl border border-app-border text-xs font-semibold text-app-text-sub hover:text-app-text hover:bg-app-bg transition-all shrink-0"
          >
            Hôm nay
          </button>
        </div>

        <!-- CÁC TRƯỜNG KHI LÀ ĐƠN BÁN HÀNG -->
        <template v-if="formType === 'sale'">
          <!-- Hàng 1: Tên sản phẩm / tài khoản (kèm mã đơn mua NCC nếu có) -->
          <div class="flex flex-col gap-1.5">
            <div class="flex items-center justify-between">
              <label class="text-xs font-bold text-app-text-sub flex items-center gap-1.5">
                <Package class="w-3.5 h-3.5" />
                <span>Tên Sản Phẩm / Tài Khoản</span>
              </label>
              <span
                v-if="purchaseOrderId"
                class="inline-flex items-center gap-1 text-[11px] font-mono font-bold text-blue-600 dark:text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded-lg border border-blue-500/20"
                title="Đơn mua NCC liên kết"
              >
                <ShoppingBag class="w-3 h-3" />
                #{{ purchaseOrderId }}
              </span>
            </div>
            <input
              type="text"
              v-model="productName"
              placeholder="VD: Netflix Premium 1T, ChatGPT Plus, YouTube..."
              class="w-full px-3.5 py-2.5 rounded-xl bg-app-bg border border-app-border text-app-text text-sm font-semibold placeholder:text-app-text-sub/50 focus:outline-none focus:border-app-accent transition-all"
            />
          </div>

          <!-- Hàng 2: Khách Hàng (Tên / SĐT / Zalo / Email) -->
          <div class="flex flex-col gap-1.5">
            <div class="flex items-center justify-between">
              <label class="text-xs font-bold text-app-text-sub flex items-center gap-1.5">
                <User class="w-3.5 h-3.5" />
                <span>Khách hàng</span>
              </label>
              <a
                v-if="customerUrl"
                :href="customerUrl"
                target="_blank"
                class="inline-flex items-center gap-1 text-[11px] text-app-accent hover:underline font-semibold"
                title="Mở liên kết trang cá nhân"
              >
                <span>Mở trang cá nhân</span>
                <ExternalLink class="w-3 h-3" />
              </a>
            </div>
            <input
              type="text"
              v-model="customerInfo"
              placeholder="Tên / SĐT / Zalo / Link Facebook..."
              class="w-full px-3.5 py-2.5 rounded-xl bg-app-bg border border-app-border text-app-text text-sm font-medium placeholder:text-app-text-sub/50 focus:outline-none focus:border-app-accent transition-all"
            />
          </div>

          <!-- Hàng 3: Ghi Chú Đơn Hàng / Nhật ký (Ngay dưới Khách hàng giống Detail) -->
          <div class="flex flex-col gap-1.5">
            <label class="text-xs font-bold text-app-text-sub flex items-center gap-1.5">
              <FileText class="w-3.5 h-3.5" />
              <span>Ghi chú</span>
            </label>
            <textarea
              v-model="warrantyNote"
              rows="2"
              placeholder="Ghi chú đơn hàng hoặc nhật ký bảo hành..."
              class="w-full px-3.5 py-2 rounded-xl bg-app-bg border border-app-border text-app-text text-xs focus:outline-none focus:border-app-accent transition-all resize-y"
            ></textarea>
          </div>

          <!-- Hàng 4: Khối Tài Chính (Giá vốn, Giá bán, Lợi nhuận) trong thẻ hộp -->
          <div class="p-3.5 rounded-2xl bg-app-bg border border-app-border flex flex-col gap-2.5">
            <div class="grid grid-cols-2 gap-3">
              <!-- Giá vốn -->
              <div class="flex flex-col gap-1">
                <label class="text-[11px] font-bold text-app-text-sub">Giá vốn (₫)</label>
                <div class="relative">
                  <span class="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-app-text-sub">₫</span>
                  <input
                    type="text"
                    v-model="costPriceRaw"
                    placeholder="VD: 50k, 120000"
                    class="w-full pl-7 pr-3 py-1.5 rounded-xl bg-app-surface border border-app-border text-app-text text-sm font-bold placeholder:text-app-text-sub/50 focus:outline-none focus:border-app-accent transition-all"
                  />
                </div>
                <span v-if="costPriceConvertedNote" class="text-[10px] text-amber-600 dark:text-amber-400 font-semibold">
                  {{ costPriceConvertedNote }}
                </span>
                <span v-else-if="numCostPrice > 0" class="text-[10px] text-app-text-sub font-medium">
                  = {{ formatMoney(numCostPrice) }}
                </span>
              </div>

              <!-- Giá bán -->
              <div class="flex flex-col gap-1">
                <label class="text-[11px] font-bold text-emerald-600 dark:text-emerald-400">Giá bán (₫)</label>
                <div class="relative">
                  <span class="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-emerald-600">₫</span>
                  <input
                    type="text"
                    v-model="salePriceRaw"
                    placeholder="VD: 99k, 150000"
                    class="w-full pl-7 pr-3 py-1.5 rounded-xl bg-app-surface border border-app-border text-emerald-600 dark:text-emerald-400 text-sm font-bold placeholder:text-app-text-sub/50 focus:outline-none focus:border-emerald-500 transition-all"
                  />
                </div>
                <span v-if="numSalePrice > 0" class="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">
                  = {{ formatMoney(numSalePrice) }}
                </span>
              </div>
            </div>

            <!-- Thước đo Lợi Nhuận Dự Kiến -->
            <div class="flex items-center justify-between pt-2 border-t border-app-border/60 text-xs font-bold">
              <span class="text-app-text-sub font-medium">Lợi nhuận dự kiến:</span>
              <span :class="estimatedProfit >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'">
                {{ estimatedProfit >= 0 ? '+' : '' }}{{ formatMoney(estimatedProfit) }}
                ({{ numSalePrice > 0 ? Math.round((estimatedProfit / numSalePrice) * 100) : 0 }}%)
              </span>
            </div>
          </div>

          <!-- Hàng 5: Gói Bảo Hành (Grid 3 cột) -->
          <div class="flex flex-col gap-1.5">
            <div class="flex items-center justify-between">
              <label class="text-xs font-bold text-app-text-sub flex items-center gap-1.5">
                <ShieldCheck class="w-3.5 h-3.5 text-app-accent" />
                <span>Gói bảo hành</span>
              </label>
              <span v-if="computedExpireDate" class="text-app-accent font-semibold text-[11px]">
                Hạn: {{ computedExpireDate }}
              </span>
            </div>
            <div class="grid grid-cols-3 sm:grid-cols-4 gap-1.5">
              <button
                v-for="opt in WARRANTY_OPTIONS"
                :key="opt.id"
                type="button"
                @click="selectWarranty(opt.id)"
                class="py-1.5 px-2 rounded-xl border text-xs font-bold transition-all touch-active flex items-center justify-center gap-1 text-center"
                :class="
                  (isCustomWarranty ? opt.id === 'custom' : warrantyPeriod === opt.id)
                    ? 'bg-app-accent text-white border-app-accent shadow-xs'
                    : 'bg-app-bg border-app-border text-app-text hover:border-app-accent/60'
                "
              >
                <Check v-if="isCustomWarranty ? opt.id === 'custom' : warrantyPeriod === opt.id" class="w-3 h-3" />
                <span>{{ opt.label }}</span>
              </button>
            </div>

            <!-- Tùy chỉnh thời gian bảo hành (số ngày / số tháng) -->
            <div
              v-if="isCustomWarranty"
              class="flex items-center gap-2 p-2 mt-1 rounded-xl bg-app-bg border border-app-border animate-fade-in"
            >
              <span class="text-xs font-bold text-app-text-sub shrink-0">Thời gian BH:</span>
              <input
                type="number"
                min="1"
                max="3650"
                v-model.number="customWarrantyValue"
                placeholder="Nhập số"
                class="w-24 px-2.5 py-1.5 rounded-lg bg-app-surface border border-app-border text-app-text text-xs font-bold focus:outline-none focus:border-app-accent"
              />
              <select
                v-model="customWarrantyUnit"
                class="px-2.5 py-1.5 rounded-lg bg-app-surface border border-app-border text-app-text text-xs font-bold focus:outline-none focus:border-app-accent"
              >
                <option value="d">Ngày</option>
                <option value="m">Tháng</option>
              </select>
            </div>
          </div>
        </template>

        <!-- CÁC TRƯỜNG KHI LÀ CHI PHÍ KHÁC -->
        <template v-else-if="formType === 'expense'">
          <div class="flex flex-col gap-1.5">
            <label class="text-xs font-bold text-app-text-sub flex items-center gap-1.5">
              <Package class="w-3.5 h-3.5" />
              <span>Tên khoản chi</span>
            </label>
            <input
              type="text"
              v-model="productName"
              placeholder="VD: Mua 10 Proxy socks5, Thuê server..."
              class="w-full px-3.5 py-2.5 rounded-xl bg-app-bg border border-app-border text-app-text text-sm font-semibold placeholder:text-app-text-sub/50 focus:outline-none focus:border-app-accent transition-all"
            />
          </div>

          <div class="flex flex-col gap-2">
            <div class="flex items-center justify-between">
              <label class="text-xs font-bold text-rose-500">Số tiền chi phí</label>
              <div class="flex items-center gap-1 p-0.5 rounded-xl bg-app-bg border border-app-border">
                <button
                  type="button"
                  @click="expenseCurrency = 'vnd'"
                  class="px-2.5 py-0.5 rounded-lg text-xs font-bold transition-all"
                  :class="expenseCurrency === 'vnd' ? 'bg-rose-500 text-white shadow-xs' : 'text-app-text-sub'"
                >
                  ₫ VNĐ
                </button>
                <button
                  type="button"
                  @click="expenseCurrency = 'usd'"
                  class="px-2.5 py-0.5 rounded-lg text-xs font-bold transition-all"
                  :class="expenseCurrency === 'usd' ? 'bg-rose-500 text-white shadow-xs' : 'text-app-text-sub'"
                >
                  $ USD
                </button>
              </div>
            </div>

            <div class="relative">
              <span class="absolute left-3.5 top-1/2 -translate-y-1/2 font-bold text-sm text-app-text-sub">
                {{ expenseCurrency === 'usd' ? '$' : '₫' }}
              </span>
              <input
                type="text"
                v-model="costPriceRaw"
                :placeholder="expenseCurrency === 'usd' ? 'Nhập số USD (vd: 5, 10, 25.5)' : 'Nhập số tiền (vd: 150k, 500000)'"
                class="w-full pl-9 pr-3 py-2.5 rounded-xl bg-app-bg border border-app-border text-rose-500 text-base font-bold placeholder:text-app-text-sub/50 focus:outline-none focus:border-rose-500 transition-all"
              />
            </div>

            <div v-if="expenseCurrency === 'usd' && numCostPrice > 0" class="text-xs text-app-text-sub font-medium">
              Quy đổi (tỷ giá {{ exchangeRate.toLocaleString('vi-VN') }}): <strong class="text-rose-500">{{ formatMoney(numCostPrice) }}</strong>
            </div>
          </div>

          <div class="flex flex-col gap-1.5">
            <label class="text-xs font-bold text-app-text-sub flex items-center gap-1.5">
              <FileText class="w-3.5 h-3.5" />
              <span>Ghi chú</span>
            </label>
            <textarea
              v-model="warrantyNote"
              rows="2"
              placeholder="Ghi chú chi tiết về khoản chi..."
              class="w-full px-3.5 py-2 rounded-xl bg-app-bg border border-app-border text-app-text text-xs focus:outline-none focus:border-app-accent transition-all resize-y"
            ></textarea>
          </div>
        </template>
      </div>

      <!-- Modal Footer -->
      <div class="px-5 py-3.5 border-t border-app-border bg-app-bg/50 flex items-center justify-end gap-2.5">
        <button
          type="button"
          @click="handleClose"
          class="px-4 py-2.5 rounded-xl border border-app-border text-sm font-semibold text-app-text-sub hover:text-app-text hover:bg-app-surface transition-colors"
        >
          Hủy Bỏ
        </button>
        <button
          type="button"
          @click="handleSubmit"
          :disabled="isSubmitting"
          class="px-5 py-2.5 rounded-xl text-white font-bold text-sm flex items-center gap-2 transition-all shadow-md touch-active disabled:opacity-50"
          :class="formType === 'sale' ? 'bg-emerald-500 shadow-emerald-500/20 hover:bg-emerald-600' : 'bg-rose-500 shadow-rose-500/20 hover:bg-rose-600'"
        >
          <Loader2 v-if="isSubmitting" class="w-4 h-4 animate-spin" />
          <span>{{ formType === 'sale' ? 'Lưu Đơn Bán' : 'Lưu Chi Phí' }}</span>
        </button>
      </div>
    </div>
  </div>
</template>
