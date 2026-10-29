<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { apiClient } from '@/services/api.client';
import { useToastStore } from '@/stores/toast.store';
import { useExpenseParser } from '@/composables/useExpenseParser';
import PurchaseOrderDetailModal from './PurchaseOrderDetailModal.vue';
import {
  X,
  TrendingUp,
  TrendingDown,
  Calendar,
  ShieldCheck,
  User,
  Check,
  Trash2,
  FileText,
  Loader2,
  ExternalLink,
  ShoppingBag,
  Package,
} from 'lucide-vue-next';

const props = defineProps<{
  isOpen: boolean;
  transaction: any | null;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'updated'): void;
  (e: 'deleted'): void;
}>();

const toast = useToastStore();
const { formatMoney } = useExpenseParser();

const isSaving = ref(false);
const isDeleting = ref(false);

// Local state editable fields
const editProductName = ref('');
const editCustomerInfo = ref('');
const editCostPrice = ref<number>(0);
const editSalePrice = ref<number>(0);
const editWarrantyPeriod = ref<'none' | '1m' | '6m' | '12m' | '18m' | 'lifetime' | 'custom' | string>('none');
const editWarrantyNote = ref('');
const editWarrantyStatus = ref('valid');

// Purchase Order link state
const isPurchaseOrderModalOpen = ref(false);
const linkedPurchaseOrder = ref<any>(null);
const isLoadingPurchaseOrder = ref(false);

const isCustomWarranty = ref(false);
const customWarrantyValue = ref<number | ''>(7);
const customWarrantyUnit = ref<'d' | 'm'>('d');

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
  editWarrantyPeriod.value = id as any;
  isCustomWarranty.value = id === 'custom';
};

watch(
  () => props.transaction,
  (tx) => {
    if (tx) {
      editProductName.value = tx.productName || '';
      editCustomerInfo.value = tx.customerInfo || '';
      editCostPrice.value = tx.costPrice || 0;
      editSalePrice.value = tx.salePrice || 0;
      editWarrantyNote.value = tx.warrantyNote || '';
      editWarrantyStatus.value = tx.warrantyStatus || 'valid';

      const p = tx.warrantyPeriod || 'none';
      const isStandard = ['none', '1m', '6m', '12m', '18m', 'lifetime'].includes(p);
      if (isStandard) {
        editWarrantyPeriod.value = p;
        isCustomWarranty.value = false;
      } else {
        const match = p.match(/^(\d+)([dm])$/);
        if (match) {
          isCustomWarranty.value = true;
          customWarrantyValue.value = parseInt(match[1], 10);
          customWarrantyUnit.value = match[2] as 'd' | 'm';
          editWarrantyPeriod.value = 'custom';
        } else {
          editWarrantyPeriod.value = p;
          isCustomWarranty.value = false;
        }
      }
    }
  },
  { immediate: true }
);

const customerUrl = computed(() => {
  if (!editCustomerInfo.value) return null;
  const match = editCustomerInfo.value.match(/https?:\/\/[^\s]+/i);
  return match ? match[0] : null;
});

const profit = computed(() => editSalePrice.value - editCostPrice.value);
const profitMargin = computed(() => {
  if (editSalePrice.value <= 0) return 0;
  return Math.round((profit.value / editSalePrice.value) * 100);
});

// Tính toán ngày hết hạn dự kiến theo gói đang chọn
const previewExpireDate = computed(() => {
  const currentPeriod = isCustomWarranty.value
    ? (customWarrantyValue.value && Number(customWarrantyValue.value) > 0
        ? `${customWarrantyValue.value}${customWarrantyUnit.value}`
        : 'none')
    : editWarrantyPeriod.value;

  if (!currentPeriod || currentPeriod === 'none' || currentPeriod === 'lifetime') {
    return null;
  }
  const m = currentPeriod.match(/^(\d+)([dm])$/);
  if (!m) return null;
  const num = parseInt(m[1], 10);
  const unit = m[2];
  const d = new Date(props.transaction?.warrantyStartDate || props.transaction?.date || new Date());
  if (isNaN(d.getTime())) return null;
  if (unit === 'd') {
    d.setDate(d.getDate() + num);
  } else {
    d.setMonth(d.getMonth() + num);
  }
  return d.toISOString().split('T')[0];
});

const openPurchaseOrderDetail = async () => {
  if (!props.transaction?.purchaseOrderId) return;
  isLoadingPurchaseOrder.value = true;
  try {
    const { data } = await apiClient.get(`/mmo/orders/${props.transaction.purchaseOrderId}`);
    if (data?.success && data.order) {
      linkedPurchaseOrder.value = data.order;
      isPurchaseOrderModalOpen.value = true;
    } else {
      toast.error('Không tìm thấy thông tin đơn mua từ nhà cung cấp');
    }
  } catch (err: any) {
    toast.error('Lỗi khi tải đơn mua NCC', err.message);
  } finally {
    isLoadingPurchaseOrder.value = false;
  }
};

const handleSave = async () => {
  if (!props.transaction?.id) return;
  isSaving.value = true;
  try {
    const resolvedWarranty = isCustomWarranty.value
      ? (customWarrantyValue.value && Number(customWarrantyValue.value) > 0
          ? `${customWarrantyValue.value}${customWarrantyUnit.value}`
          : 'none')
      : editWarrantyPeriod.value;

    const payload = {
      product_name: editProductName.value.trim() || props.transaction?.productName || '',
      customer_info: editCustomerInfo.value.trim() || null,
      cost_price: Math.max(0, editCostPrice.value),
      sale_price: Math.max(0, editSalePrice.value),
      warranty_period: resolvedWarranty,
      warranty_note: editWarrantyNote.value.trim() || null,
      warranty_status: editWarrantyStatus.value,
    };

    await apiClient.put(`/mmo/transactions/${props.transaction.id}`, payload);
    toast.success('Đã lưu cập nhật giao dịch');
    emit('updated');
    emit('close');
  } catch (err: any) {
    toast.error(err.response?.data?.message || err.message || 'Lỗi khi cập nhật giao dịch');
  } finally {
    isSaving.value = false;
  }
};

const handleDelete = async () => {
  if (!props.transaction?.id) return;
  if (!confirm('Bạn có chắc chắn muốn xóa bản ghi giao dịch này khỏi hệ thống?')) return;

  isDeleting.value = true;
  try {
    await apiClient.delete(`/mmo/transactions/${props.transaction.id}`);
    toast.success('Đã xóa giao dịch');
    emit('deleted');
    emit('close');
  } catch (err: any) {
    toast.error(err.response?.data?.message || err.message || 'Lỗi khi xóa giao dịch');
  } finally {
    isDeleting.value = false;
  }
};
</script>

<template>
  <div
    v-if="isOpen && transaction"
    class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fade-in"
    @click.self="$emit('close')"
  >
    <div
      class="bg-app-surface border border-app-border rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col max-h-[92vh]"
    >
      <!-- Modal Header -->
      <div class="flex items-center justify-between px-5 py-4 border-b border-app-border">
        <div class="flex items-center gap-2.5">
          <div
            class="w-9 h-9 rounded-xl flex items-center justify-center font-bold text-white shadow-xs shrink-0"
            :class="
              transaction.type === 'sale'
                ? 'bg-emerald-500 shadow-emerald-500/20'
                : 'bg-rose-500 shadow-rose-500/20'
            "
          >
            <TrendingUp v-if="transaction.type === 'sale'" class="w-4 h-4" />
            <TrendingDown v-else class="w-4 h-4" />
          </div>
          <div class="flex flex-col min-w-0">
            <h3 class="font-bold text-base text-app-text truncate">
              {{ transaction.type === 'sale' ? 'Chi Tiết Đơn Bán' : 'Chi Tiết Khoản Chi' }}
            </h3>
            <span class="text-xs text-app-text-sub flex items-center gap-1.5">
              <span>#{{ transaction.id }}</span>
              <span>•</span>
              <Calendar class="w-3 h-3" />
              <span>{{ transaction.date }}</span>
            </span>
          </div>
        </div>

        <button
          type="button"
          @click="$emit('close')"
          class="p-2 rounded-xl text-app-text-sub hover:text-app-text hover:bg-app-bg transition-colors"
        >
          <X class="w-5 h-5" />
        </button>
      </div>

      <!-- Modal Body (Scrollable) -->
      <div class="p-5 overflow-y-auto flex flex-col gap-3.5">
        <!-- Badge Trạng thái bảo hành -->
        <div
          v-if="transaction.type === 'sale'"
          class="flex items-center gap-1.5 self-start px-3 py-1 rounded-xl text-xs font-bold border"
          :class="{
            'bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400':
              transaction.warrantyStatus === 'valid',
            'bg-amber-500/10 border-amber-500/20 text-amber-600 dark:text-amber-400':
              transaction.warrantyStatus === 'expiring_soon',
            'bg-rose-500/10 border-rose-500/20 text-rose-600 dark:text-rose-400':
              transaction.warrantyStatus === 'expired',
            'bg-purple-500/10 border-purple-500/20 text-purple-600 dark:text-purple-400':
              transaction.warrantyStatus === 'lifetime',
            'bg-app-bg border-app-border text-app-text-sub': transaction.warrantyStatus === 'none',
          }"
        >
          <ShieldCheck class="w-3.5 h-3.5" />
          <span>
            {{
              transaction.warrantyStatus === 'valid'
                ? 'Còn hạn BH'
                : transaction.warrantyStatus === 'expiring_soon'
                ? `Sắp hết hạn (${transaction.warrantyDaysLeft} ngày)`
                : transaction.warrantyStatus === 'expired'
                ? 'Hết hạn BH'
                : transaction.warrantyStatus === 'lifetime'
                ? 'BH Trọn đời'
                : 'Không BH'
            }}
          </span>
        </div>

        <!-- Tên sản phẩm đã bán / khoản chi -->
        <div class="flex flex-col gap-1">
          <div class="flex items-center justify-between">
            <label class="text-xs font-bold text-app-text-sub flex items-center gap-1.5">
              <Package class="w-3.5 h-3.5" />
              <span>{{ transaction.type === 'sale' ? 'Tên sản phẩm' : 'Tên khoản chi' }}</span>
            </label>
            <button
              v-if="transaction.type === 'sale' && transaction.purchaseOrderId"
              type="button"
              @click="openPurchaseOrderDetail"
              :disabled="isLoadingPurchaseOrder"
              class="inline-flex items-center gap-1 text-[11px] text-blue-600 dark:text-blue-400 hover:underline font-semibold touch-active"
              title="Mở chi tiết đơn mua từ NCC"
            >
              <Loader2 v-if="isLoadingPurchaseOrder" class="w-3 h-3 animate-spin" />
              <ExternalLink v-else class="w-3 h-3" />
              <span>Đơn mua NCC #{{ transaction.purchaseOrderId }}</span>
            </button>
          </div>
          <input
            type="text"
            v-model="editProductName"
            :placeholder="transaction.type === 'sale' ? 'Tên sản phẩm...' : 'Tên khoản chi...'"
            class="w-full px-3.5 py-2.5 rounded-xl bg-app-bg border border-app-border text-app-text text-sm font-semibold focus:outline-none focus:border-app-accent transition-all"
          />
        </div>

        <!-- Hàng 2: Khách Hàng (có link mở nhanh) -->
        <div v-if="transaction.type === 'sale'" class="flex flex-col gap-1">
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
            v-model="editCustomerInfo"
            placeholder="Tên / SĐT / Link Facebook/Zalo..."
            class="w-full px-3 py-2 rounded-xl bg-app-bg border border-app-border text-app-text text-sm font-medium focus:outline-none focus:border-app-accent transition-all"
          />
        </div>

        <!-- Hàng 3: Ghi Chú (di chuyển lên ngay dưới Khách hàng) -->
        <div class="flex flex-col gap-1">
          <label class="text-xs font-bold text-app-text-sub flex items-center gap-1.5">
            <FileText class="w-3.5 h-3.5" />
            <span>Ghi chú</span>
          </label>
          <textarea
            v-model="editWarrantyNote"
            rows="2"
            placeholder="Ghi chú đơn hàng hoặc nhật ký đổi tài khoản..."
            class="w-full px-3 py-2 rounded-xl bg-app-bg border border-app-border text-app-text text-xs focus:outline-none focus:border-app-accent transition-all resize-y"
          ></textarea>
        </div>

        <!-- Hàng 4: Khối Tài Chính tinh gọn -->
        <div v-if="transaction.type === 'sale'" class="p-3 rounded-2xl bg-app-bg border border-app-border flex flex-col gap-2">
          <div class="grid grid-cols-2 gap-3">
            <div class="flex flex-col gap-1">
              <label class="text-[11px] font-bold text-app-text-sub">Giá vốn (₫)</label>
              <input
                type="number"
                v-model.number="editCostPrice"
                class="w-full px-3 py-1.5 rounded-xl bg-app-surface border border-app-border text-app-text font-bold text-sm focus:outline-none focus:border-app-accent transition-all"
              />
              <span class="text-[10px] text-app-text-sub font-medium">{{ formatMoney(editCostPrice) }}</span>
            </div>

            <div class="flex flex-col gap-1">
              <label class="text-[11px] font-bold text-emerald-600 dark:text-emerald-400">Giá bán (₫)</label>
              <input
                type="number"
                v-model.number="editSalePrice"
                class="w-full px-3 py-1.5 rounded-xl bg-app-surface border border-app-border text-emerald-600 dark:text-emerald-400 font-bold text-sm focus:outline-none focus:border-emerald-500 transition-all"
              />
              <span class="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">{{ formatMoney(editSalePrice) }}</span>
            </div>
          </div>

          <div class="flex items-center justify-between pt-2 border-t border-app-border/60 text-xs font-bold">
            <span class="text-app-text-sub font-medium">Lợi nhuận:</span>
            <span :class="profit >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'">
              {{ profit >= 0 ? '+' : '' }}{{ formatMoney(profit) }} ({{ profitMargin }}%)
            </span>
          </div>
        </div>

        <!-- Khi là Chi Phí Khác -->
        <div v-if="transaction.type === 'expense'" class="flex flex-col gap-1">
          <label class="text-xs font-bold text-rose-500">Số tiền chi phí (₫)</label>
          <input
            type="number"
            v-model.number="editCostPrice"
            class="w-full px-3 py-2 rounded-xl bg-app-bg border border-app-border text-rose-500 font-bold text-base focus:outline-none focus:border-rose-500 transition-all"
          />
          <span class="text-xs text-rose-500 font-bold">{{ formatMoney(editCostPrice) }}</span>
        </div>

        <!-- Hàng 5: Gói Bảo Hành -->
        <div v-if="transaction.type === 'sale'" class="flex flex-col gap-1">
          <div class="flex items-center justify-between">
            <label class="text-xs font-bold text-app-text-sub flex items-center gap-1.5">
              <ShieldCheck class="w-3.5 h-3.5 text-app-accent" />
              <span>Gói bảo hành</span>
            </label>
            <span v-if="previewExpireDate" class="text-app-accent font-semibold text-[11px]">
              Hạn: {{ previewExpireDate }}
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
                (isCustomWarranty ? opt.id === 'custom' : editWarrantyPeriod === opt.id)
                  ? 'bg-app-accent text-white border-app-accent shadow-xs'
                  : 'bg-app-bg border-app-border text-app-text hover:border-app-accent/60'
              "
            >
              <Check v-if="isCustomWarranty ? opt.id === 'custom' : editWarrantyPeriod === opt.id" class="w-3 h-3" />
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
      </div>

      <!-- Modal Footer tinh gọn -->
      <div class="px-5 py-3 border-t border-app-border bg-app-bg/50 flex items-center justify-between">
        <button
          type="button"
          @click="handleDelete"
          :disabled="isDeleting"
          class="px-3 py-2 rounded-xl border border-rose-500/20 text-rose-500 hover:bg-rose-500/10 text-xs font-bold flex items-center gap-1.5 transition-colors disabled:opacity-50"
        >
          <Trash2 class="w-3.5 h-3.5" />
          <span>{{ isDeleting ? 'Đang xóa...' : 'Xóa' }}</span>
        </button>

        <div class="flex items-center gap-2">
          <button
            type="button"
            @click="$emit('close')"
            class="px-3.5 py-2 rounded-xl border border-app-border text-xs font-bold text-app-text-sub hover:text-app-text hover:bg-app-surface transition-colors"
          >
            Đóng
          </button>
          <button
            type="button"
            @click="handleSave"
            :disabled="isSaving"
            class="px-4 py-2 rounded-xl bg-app-accent hover:bg-app-accent-hover text-white font-bold text-xs flex items-center gap-1.5 transition-all shadow-accent touch-active disabled:opacity-50"
          >
            <Loader2 v-if="isSaving" class="w-3.5 h-3.5 animate-spin" />
            <span>Lưu thay đổi</span>
          </button>
        </div>
      </div>
    </div>

    <!-- Linked Purchase Order Detail Modal -->
    <PurchaseOrderDetailModal
      :is-open="isPurchaseOrderModalOpen"
      :order="linkedPurchaseOrder"
      @close="isPurchaseOrderModalOpen = false"
    />
  </div>
</template>
