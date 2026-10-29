<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { apiClient } from '@/services/api.client';
import { useToastStore } from '@/stores/toast.store';
import { useMmoProvidersStore } from '@/stores/mmoProviders.store';
import { useMmoMoneyStore } from '@/stores/mmoMoney.store';
import { useAuthStore } from '@/stores/auth.store';
import {
  X,
  Copy,
  Check,
  RefreshCw,
  Trash2,
  TrendingUp,
  Clock,
  Key,
  ShoppingBag,
  ExternalLink,
  ChevronDown,
  ChevronUp,
} from 'lucide-vue-next';

const props = defineProps<{
  isOpen: boolean;
  order: any | null;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'resell', order: any): void;
  (e: 'view-transaction', transactionId: number): void;
  (e: 'deleted', orderId: string): void;
  (e: 'status-updated', updatedOrder: any): void;
}>();

const toast = useToastStore();
const directory = useMmoProvidersStore();
const money = useMmoMoneyStore();
const authStore = useAuthStore();
const isAdmin = computed(() => authStore.user?.role === 'admin');

const copiedKey = ref<string | null>(null);
const isCheckingStatus = ref(false);
const isDeleting = ref(false);
const showRawJson = ref(false);
const isUpdatingStatus = ref(false);

const displayOrderId = computed(() => {
  if (!props.order) return '';
  if (props.order.provider_order_id) return String(props.order.provider_order_id);
  // Thử trích xuất từ response_raw nếu provider_order_id đang rỗng
  if (props.order.response_raw) {
    try {
      const raw = typeof props.order.response_raw === 'string' ? JSON.parse(props.order.response_raw) : props.order.response_raw;
      const found = raw?.order?.order_id || raw?.order?.id || raw?.order_id || raw?.id || raw?.data?.id || raw?.data?.order_id || (Array.isArray(raw?.items) && raw.items[0]?.id) || (Array.isArray(raw?.products) && raw.products[0]?.id);
      if (found) return String(found);
    } catch {}
  }
  return props.order.id ? String(props.order.id) : '';
});

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

const formatRawJson = (raw: any): string => {
  if (!raw) return '';
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return JSON.stringify(parsed, null, 2);
    } catch {
      return raw;
    }
  }
  return JSON.stringify(raw, null, 2);
};

const copyToClipboard = async (text: string, keyId: string) => {
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
    copiedKey.value = keyId;
    toast.success('Đã sao chép vào bộ nhớ đệm');
    setTimeout(() => {
      if (copiedKey.value === keyId) copiedKey.value = null;
    }, 2000);
  } catch {
    toast.error('Không thể sao chép');
  }
};

const isUrl = (val: string): boolean => {
  return /^https?:\/\//i.test(String(val || '').trim());
};

const extractKeysFromOrder = (order: any): string[] => {
  if (!order) return [];
  if (Array.isArray(order.delivered_items) && order.delivered_items.length > 0) {
    return order.delivered_items;
  }

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

  const parseObj = (raw: any) => {
    if (typeof raw !== 'string') return raw;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  };

  const parsedRaw = parseObj(order.response_raw);
  const parsedData = parseObj(order.delivered_data);

  const containers = [
    parsedRaw,
    parsedRaw?.order,
    parsedRaw?.data,
    parsedRaw?.result,
    parsedData,
    parsedData?.order,
    parsedData?.data,
    order
  ].filter(c => c && typeof c === 'object' && !Array.isArray(c));

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

  return [];
};

const effectiveDeliveredItems = computed<string[]>(() => {
  const items = extractKeysFromOrder(props.order);
  return items.map(cleanItemValue).filter((str) => str.trim().length > 0);
});

const handleMarkCompleted = async () => {
  if (!props.order?.id) return;
  isUpdatingStatus.value = true;
  try {
    const { data } = await apiClient.patch(`/mmo/orders/${props.order.id}/status`, {
      status: 'completed',
    });
    if (data?.success) {
      props.order.status = 'completed';
      emit('status-updated', props.order);
      toast.success('Đã cập nhật trạng thái đơn thành Đã hoàn thành');
    } else {
      toast.error('Cập nhật trạng thái thất bại', data?.message);
    }
  } catch (err: any) {
    toast.error('Lỗi khi cập nhật trạng thái', err.message);
  } finally {
    isUpdatingStatus.value = false;
  }
};

watch(
  () => props.isOpen,
  async (isOpen) => {
    if (isOpen && props.order?.id) {
      showRawJson.value = false;
      if (!props.order.response_raw) {
        try {
          const { data } = await apiClient.get(`/mmo/orders/${props.order.id}`);
          if (data?.success && data?.order) {
            props.order.response_raw = data.order.response_raw;
            props.order.delivered_data = data.order.delivered_data;
          }
        } catch {
          // Bỏ qua lỗi nạp chi tiết JSON nếu xảy ra
        }
      }
    }
  },
  { immediate: true }
);

const formatDate = (isoString?: string) => {
  if (!isoString) return '';
  try {
    const d = new Date(isoString.endsWith('Z') ? isoString : isoString + 'Z');
    return d.toLocaleString('vi-VN', {
      hour: '2-digit',
      minute: '2-digit',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  } catch {
    return isoString;
  }
};

const handleCheckStatus = async () => {
  if (!props.order?.id) return;
  isCheckingStatus.value = true;
  try {
    const { data } = await apiClient.post(`/mmo/orders/${props.order.id}/check-status`);
    if (data?.success) {
      props.order.status = data.status;
      props.order.error_message = data.error_message ?? null;
      emit('status-updated', props.order);
      if (data.status === 'failed') {
        toast.error(`Đơn #${data.provider_order_id || props.order.id} thất bại`, data.error_message || 'Nhà cung cấp báo lỗi');
      } else {
        const label = data.status === 'completed' ? 'Đã hoàn thành' : 'Đang xử lý';
        toast.success(`Trạng thái đơn #${data.provider_order_id || props.order.id}: ${label}`);
      }
    } else {
      toast.error('Kiểm tra trạng thái thất bại', data?.message);
    }
  } catch (err: any) {
    toast.error('Lỗi khi kiểm tra trạng thái', err.message);
  } finally {
    isCheckingStatus.value = false;
  }
};

const handleDelete = async () => {
  if (!props.order?.id) return;
  if (!confirm('Bạn có chắc muốn xóa bản ghi đơn mua này khỏi hệ thống?')) return;

  isDeleting.value = true;
  try {
    const { data } = await apiClient.delete(`/mmo/orders/${props.order.id}`);
    if (data?.success) {
      toast.success('Đã xóa đơn hàng thành công');
      emit('deleted', props.order.id);
      emit('close');
    }
  } catch (err: any) {
    toast.error('Lỗi khi xóa đơn hàng', err.message);
  } finally {
    isDeleting.value = false;
  }
};

const handleResell = () => {
  emit('resell', props.order);
  emit('close');
};

const handleViewTransaction = () => {
  if (props.order?.linked_transaction_id) {
    emit('view-transaction', props.order.linked_transaction_id);
    emit('close');
  }
};
</script>

<template>
  <div
    v-if="isOpen && order"
    class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fade-in"
    @click.self="$emit('close')"
  >
    <div
      class="bg-app-surface border border-app-border rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col max-h-[92vh]"
    >
      <!-- Header -->
      <div class="flex items-center justify-between px-5 py-4 border-b border-app-border">
        <div class="flex items-center gap-3 min-w-0">
          <div
            class="w-10 h-10 rounded-2xl flex items-center justify-center text-xs font-bold text-white shrink-0 shadow-xs overflow-hidden border border-app-border/40"
            :class="directory.displayInfo(order.provider_id).solidClass"
          >
            <img
              v-if="directory.displayInfo(order.provider_id).avatarUrl"
              :src="directory.displayInfo(order.provider_id).avatarUrl!"
              referrerpolicy="no-referrer"
              class="w-full h-full object-cover"
              alt=""
            />
            <span v-else>{{ (order.provider_id || '').slice(0, 2).toUpperCase() }}</span>
          </div>

          <div class="flex flex-col min-w-0">
            <div class="flex items-center gap-1.5 flex-wrap">
              <span class="text-xs font-bold uppercase tracking-wider text-app-accent">
                {{ directory.displayInfo(order.provider_id).name }}
              </span>
              <div
                v-if="displayOrderId"
                class="inline-flex items-center gap-1 text-[11px] font-mono text-app-text-sub bg-black/5 dark:bg-white/10 px-1.5 py-0.5 rounded border border-app-border/40"
              >
                <span class="font-bold">#{{ displayOrderId }}</span>
                <button
                  type="button"
                  @click="copyToClipboard(displayOrderId, 'order-id')"
                  class="text-app-text-sub hover:text-app-accent p-0.5 rounded transition-colors touch-active cursor-pointer"
                  title="Sao chép mã đơn hàng"
                >
                  <Check v-if="copiedKey === 'order-id'" class="w-3 h-3 text-emerald-500" />
                  <Copy v-else class="w-3 h-3" />
                </button>
              </div>
            </div>
            <span class="text-[11px] text-app-text-sub flex items-center gap-1.5 mt-0.5">
              <Clock class="w-3 h-3" />
              <span>{{ formatDate(order.created_at) }}</span>
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

      <!-- Body -->
      <div class="p-5 overflow-y-auto flex flex-col gap-4">
        <!-- Tên sản phẩm & Trạng thái -->
        <div class="flex items-start justify-between gap-3 p-3.5 rounded-2xl bg-app-bg border border-app-border">
          <div class="flex flex-col gap-1 min-w-0 flex-1">
            <span class="text-xs text-app-text-sub font-semibold">Sản phẩm đã mua</span>
            <h4 class="font-bold text-app-text text-sm leading-snug break-words">
              {{ order.product_name }}
            </h4>
          </div>

          <div class="flex flex-col items-end gap-1.5 shrink-0">
            <span
              class="text-xs px-2.5 py-1 rounded-full font-bold border"
              :class="{
                'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20': order.status === 'completed',
                'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20': order.status === 'processing',
                'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20': order.status === 'failed',
              }"
            >
              {{ order.status === 'processing' ? 'Đang xử lý' : (order.status === 'failed' ? 'Thất bại' : 'Đã hoàn thành') }}
            </span>

            <button
              v-if="order.status !== 'completed'"
              type="button"
              @click="handleMarkCompleted"
              :disabled="isUpdatingStatus"
              class="px-2 py-0.5 text-[11px] font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20 rounded-lg flex items-center gap-1 transition-colors border border-emerald-500/20 disabled:opacity-50 touch-active"
              title="Đánh dấu đơn hàng là Đã hoàn thành"
            >
              <Check class="w-3 h-3" />
              <span>{{ isUpdatingStatus ? 'Đang lưu...' : 'Đánh dấu hoàn thành' }}</span>
            </button>

            <button
              v-if="order.can_check_status && order.provider_order_id && order.status === 'processing'"
              type="button"
              @click="handleCheckStatus"
              :disabled="isCheckingStatus"
              class="px-2 py-0.5 text-[11px] font-semibold bg-app-accent/10 text-app-accent hover:bg-app-accent/20 rounded-lg flex items-center gap-1 transition-colors border border-app-accent/20 disabled:opacity-50 touch-active"
            >
              <RefreshCw class="w-3 h-3" :class="{ 'animate-spin': isCheckingStatus }" />
              <span>Cập nhật trạng thái</span>
            </button>
          </div>
        </div>

        <!-- Thông báo lỗi nếu thất bại -->
        <div
          v-if="order.status === 'failed' && order.error_message"
          class="p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-500 text-xs font-semibold"
        >
          Lỗi nhà cung cấp: {{ order.error_message }}
        </div>

        <!-- Khối giá tiền & số lượng -->
        <div class="grid grid-cols-2 gap-3 p-3.5 rounded-2xl bg-app-bg border border-app-border text-xs">
          <div class="flex flex-col gap-0.5">
            <span class="text-app-text-sub font-semibold">Tổng giá mua</span>
            <span class="font-mono font-bold text-base text-app-accent">
              {{ money.formatOrderPrice(Number(order.total_price) || 0, order.currency) }}
            </span>
          </div>

          <div class="flex flex-col gap-0.5 text-right">
            <span class="text-app-text-sub font-semibold">Số lượng</span>
            <span class="font-bold text-app-text text-base">
              {{ order.quantity || 1 }}
            </span>
          </div>
        </div>

        <!-- Email khách nếu có -->
        <div v-if="order.customer_email" class="flex items-center justify-between p-3 rounded-2xl bg-app-bg border border-app-border text-xs">
          <span class="text-app-text-sub font-semibold">Email nhận / kích hoạt:</span>
          <span class="font-medium text-app-text font-mono">{{ order.customer_email }}</span>
        </div>

        <!-- Khối Dữ liệu / Keys đã nhận (Inputs với nút copy nhanh 1 chạm & mở link) -->
        <div v-if="effectiveDeliveredItems && effectiveDeliveredItems.length > 0" class="flex flex-col gap-2">
          <div class="flex items-center justify-between text-xs font-bold text-app-text px-0.5">
            <span class="flex items-center gap-1.5 text-app-accent">
              <Key class="w-3.5 h-3.5" />
              <span>Nội dung sản phẩm / Key đã mua:</span>
            </span>

            <button
              v-if="effectiveDeliveredItems.length > 1"
              type="button"
              @click="copyToClipboard(effectiveDeliveredItems.join('\n'), 'all')"
              class="text-xs text-app-accent hover:underline flex items-center gap-1 font-semibold touch-active"
            >
              <Check v-if="copiedKey === 'all'" class="w-3.5 h-3.5 text-emerald-500" />
              <Copy v-else class="w-3.5 h-3.5" />
              <span>{{ copiedKey === 'all' ? 'Đã chép tất cả' : 'Sao chép tất cả' }}</span>
            </button>
          </div>

          <div class="flex flex-col gap-3">
            <div
              v-for="(keyStr, idx) in effectiveDeliveredItems"
              :key="idx"
              class="flex flex-col rounded-2xl bg-app-surface border border-app-border shadow-xs overflow-hidden focus-within:border-app-accent focus-within:ring-1 focus-within:ring-app-accent transition-all"
            >
              <!-- Card Header with Action Buttons -->
              <div class="flex items-center justify-between px-3.5 py-2 bg-app-bg/50 border-b border-app-border/60">
                <span class="text-[11px] font-bold text-app-text-sub uppercase tracking-wider flex items-center gap-1">
                  <span>Mục {{ idx + 1 }}</span>
                  <span v-if="effectiveDeliveredItems.length > 1">/ {{ effectiveDeliveredItems.length }}</span>
                </span>

                <div class="flex items-center gap-1.5">
                  <!-- Nút mở liên kết nếu là URL -->
                  <a
                    v-if="isUrl(keyStr)"
                    :href="keyStr"
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
                    @click="copyToClipboard(keyStr, `key-${idx}`)"
                    class="px-2.5 py-1 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 transition-colors touch-active flex items-center gap-1 font-bold text-xs"
                    :title="'Sao chép mục ' + (idx + 1)"
                  >
                    <Check v-if="copiedKey === `key-${idx}`" class="w-3.5 h-3.5 text-emerald-600" />
                    <Copy v-else class="w-3.5 h-3.5" />
                    <span>{{ copiedKey === `key-${idx}` ? 'Đã chép' : 'Sao chép' }}</span>
                  </button>
                </div>
              </div>

              <!-- Textarea to rộng, wrap xuống dòng -->
              <div class="p-2.5">
                <textarea
                  readonly
                  :value="keyStr"
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

        <!-- Phản hồi kỹ thuật JSON từ NCC (Collapsible) -->
        <div v-if="order.response_raw || order.delivered_data" class="border-t border-app-border pt-2 mt-1">
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
                @click.stop="copyToClipboard(formatRawJson(order.response_raw || order.delivered_data), 'raw-json')"
                class="px-2 py-0.5 text-[10px] bg-black/5 dark:bg-white/10 rounded hover:bg-black/10 transition-colors flex items-center gap-1 font-semibold"
              >
                <Check v-if="copiedKey === 'raw-json'" class="w-3 h-3 text-emerald-500" />
                <Copy v-else class="w-3 h-3" />
                <span>{{ copiedKey === 'raw-json' ? 'Đã sao chép' : 'Sao chép' }}</span>
              </button>
              <ChevronUp v-if="showRawJson" class="w-3.5 h-3.5" />
              <ChevronDown v-else class="w-3.5 h-3.5" />
            </div>
          </button>

          <pre
            v-if="showRawJson"
            class="mt-1 p-2.5 bg-black/5 dark:bg-white/5 rounded-xl border border-app-border text-[11px] font-mono text-app-text-sub overflow-x-auto max-h-40 whitespace-pre-wrap select-all"
          >{{ formatRawJson(order.response_raw || order.delivered_data) }}</pre>
        </div>
      </div>

      <!-- Footer -->
      <div class="px-5 py-3.5 border-t border-app-border bg-app-bg/50 flex items-center justify-between">
        <button
          v-if="isAdmin"
          type="button"
          @click="handleDelete"
          :disabled="isDeleting"
          class="px-3.5 py-2.5 rounded-xl border border-rose-500/20 text-rose-500 hover:bg-rose-500/10 text-xs font-bold flex items-center gap-1.5 transition-colors disabled:opacity-50"
        >
          <Trash2 class="w-4 h-4" />
          <span>{{ isDeleting ? 'Đang xóa...' : 'Xóa đơn' }}</span>
        </button>
        <div v-else></div>

        <div class="flex items-center gap-2">
          <button
            type="button"
            @click="$emit('close')"
            class="px-4 py-2.5 rounded-xl border border-app-border text-xs font-bold text-app-text-sub hover:text-app-text hover:bg-app-surface transition-colors"
          >
            Đóng
          </button>

          <button
            v-if="order.is_sold"
            type="button"
            @click="handleViewTransaction"
            class="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold flex items-center gap-1.5 transition-all shadow-md touch-active"
            title="Mở chi tiết đơn bán trong sổ bán hàng"
          >
            <ExternalLink class="w-4 h-4" />
            <span>Xem đơn bán</span>
          </button>

          <button
            v-else-if="order.status === 'completed'"
            type="button"
            @click="handleResell"
            class="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5 transition-all shadow-md touch-active"
          >
            <TrendingUp class="w-4 h-4" />
            <span>Tạo đơn bán lại</span>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
