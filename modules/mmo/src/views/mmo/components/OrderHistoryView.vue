<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { apiClient } from '@/services/api.client';
import { useToastStore } from '@/stores/toast.store';
import { useAuthStore } from '@/stores/auth.store';
import { useMmoProvidersStore } from '@/stores/mmoProviders.store';
import { useMmoMoneyStore } from '@/stores/mmoMoney.store';
import PurchaseOrderDetailModal from './PurchaseOrderDetailModal.vue';
import { 
  Receipt, 
  RefreshCw, 
  Search, 
  ShoppingBag,
  Clock,
  TrendingUp,
  ChevronRight,
  ExternalLink,
  X,
} from 'lucide-vue-next';

const emit = defineEmits<{
  (e: 'resell-order', order: any): void;
  (e: 'view-transaction', transactionId: number): void;
}>();

const toast = useToastStore();
const authStore = useAuthStore();
const isAdmin = computed(() => authStore.user?.role === 'admin');

const isLoading = ref(false);
const isSyncing = ref(false);
const orders = ref<any[]>([]);
const totalOrders = ref(0);
const searchQuery = ref('');
const selectedProvider = ref('Tất cả');

// Detail Modal
const isDetailModalOpen = ref(false);
const selectedOrder = ref<any>(null);

const directory = useMmoProvidersStore();
const money = useMmoMoneyStore();
const providers = computed(() => ['Tất cả', ...directory.providerIds]);

onMounted(() => {
  fetchOrders();
  directory.load().catch(() => undefined);
});

const fetchOrders = async () => {
  isLoading.value = true;
  try {
    const params: any = { limit: 100 };
    if (selectedProvider.value !== 'Tất cả') {
      params.provider_id = selectedProvider.value;
    }
    if (searchQuery.value.trim()) {
      params.search = searchQuery.value.trim();
    }

    const { data } = await apiClient.get('/mmo/orders', { params });
    if (data?.success) {
      orders.value = data.orders || [];
      totalOrders.value = data.total || 0;
    }
  } catch (err: any) {
    toast.error('Lỗi tải lịch sử đơn hàng', err.message);
  } finally {
    isLoading.value = false;
  }
};

const syncAllOrders = async () => {
  isSyncing.value = true;
  try {
    const { data } = await apiClient.post('/mmo/orders/sync-all');
    if (data?.success) {
      const count = data.total_synced ?? 0;
      toast.success(data.message || `Đã đồng bộ ${count} đơn hàng`);
      await fetchOrders();
    } else {
      toast.error('Đồng bộ thất bại', data?.message);
    }
  } catch (err: any) {
    toast.error('Lỗi khi đồng bộ đơn hàng', err.message);
  } finally {
    isSyncing.value = false;
  }
};

const openOrderDetail = (order: any) => {
  selectedOrder.value = order;
  isDetailModalOpen.value = true;
};

const formatDate = (isoString: string) => {
  if (!isoString) return '';
  try {
    const d = new Date(isoString.endsWith('Z') ? isoString : isoString + 'Z');
    return d.toLocaleString('vi-VN', {
      hour: '2-digit',
      minute: '2-digit',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
  } catch {
    return isoString;
  }
};

defineExpose({
  fetchOrders
});
</script>

<template>
  <div class="flex flex-col gap-4">
    <!-- Filter & Action Bar -->
    <div class="flex flex-col sm:flex-row gap-2.5 items-stretch sm:items-center justify-between">
      <!-- Search -->
      <div class="flex items-center gap-2 flex-1 max-w-md">
        <div class="relative flex-1">
          <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Search class="h-4 w-4 text-app-text-sub" />
          </div>
          <input 
            v-model="searchQuery" 
            @keyup.enter="fetchOrders"
            type="text" 
            placeholder="Tìm đơn theo tên sản phẩm, mã đơn..."
            class="block w-full pl-9 pr-8 py-2 border border-app-border rounded-xl leading-5 bg-app-surface text-app-text placeholder-app-text-sub focus:outline-none focus:ring-1 focus:ring-app-accent focus:border-app-accent text-sm transition-colors"
          />
          <button
            v-if="searchQuery"
            type="button"
            @click="searchQuery = ''; fetchOrders()"
            class="absolute inset-y-0 right-0 pr-2.5 flex items-center text-app-text-sub hover:text-app-text"
            title="Xóa tìm kiếm"
          >
            <X class="h-4 w-4" />
          </button>
        </div>
        <button
          type="button"
          @click="fetchOrders"
          class="px-3.5 py-2 bg-app-accent text-white rounded-xl text-xs font-bold hover:bg-app-accent-hover transition-colors flex items-center gap-1.5 shrink-0 shadow-xs touch-active"
        >
          <Search class="w-3.5 h-3.5" />
          <span>Tìm</span>
        </button>
      </div>

      <!-- Controls -->
      <div class="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0">
        <!-- Provider Filter Dropdown -->
        <select 
          v-model="selectedProvider" 
          @change="fetchOrders"
          class="bg-app-surface border border-app-border rounded-xl px-3 py-2 text-xs font-semibold text-app-text focus:outline-none focus:border-app-accent shrink-0"
        >
          <option v-for="p in providers" :key="p" :value="p">
            {{ p === 'Tất cả' ? 'Tất cả NCC' : directory.displayInfo(p).name }}
          </option>
        </select>

        <!-- Đồng bộ lịch sử tất cả NCC -->
        <button 
          @click="syncAllOrders" 
          :disabled="isSyncing"
          class="px-3 py-2 bg-app-surface border border-app-border rounded-xl hover:bg-app-surface-hover transition-colors text-xs font-semibold text-app-text flex items-center gap-1.5 shrink-0 touch-active disabled:opacity-50"
          title="Đồng bộ lịch sử đơn hàng từ tất cả nhà cung cấp"
        >
          <RefreshCw class="w-3.5 h-3.5" :class="{'animate-spin': isSyncing}" />
          <span>{{ isSyncing ? 'Đang đồng bộ...' : 'Đồng bộ lịch sử' }}</span>
        </button>
      </div>
    </div>

    <!-- Orders List -->
    <div v-if="isLoading" class="text-center py-12 text-app-text-sub">
      <RefreshCw class="w-8 h-8 animate-spin mx-auto mb-2 opacity-50" />
      <p class="text-sm">Đang tải lịch sử mua hàng...</p>
    </div>

    <div v-else-if="orders.length === 0" class="text-center py-16 bg-app-surface border border-app-border rounded-2xl">
      <ShoppingBag class="w-12 h-12 text-app-text-sub mx-auto mb-3 opacity-40" />
      <h3 class="font-bold text-app-text-base text-base mb-1">Chưa có đơn hàng nào</h3>
      <p class="text-xs text-app-text-sub max-w-sm mx-auto">
        Khi bạn đặt mua sản phẩm qua hệ thống MMO hoặc bấm Đồng bộ lịch sử, các đơn mua từ nhà cung cấp sẽ hiển thị tại đây.
      </p>
    </div>

    <!-- Compact Order Cards (3-tier mobile-optimized) -->
    <div v-else class="space-y-2.5">
      <div 
        v-for="order in orders" 
        :key="order.id"
        @click="openOrderDetail(order)"
        class="bg-app-surface border border-app-border hover:border-app-accent/40 rounded-2xl p-3.5 shadow-xs transition-all flex flex-col gap-2.5 cursor-pointer group touch-active"
      >
        <!-- Tầng 1: Header [Avatar + Vendor Name + Order ID] | [Giá tiền] -->
        <div class="flex items-center justify-between gap-2">
          <div class="flex items-center gap-2 min-w-0">
            <div 
              class="w-7 h-7 rounded-lg flex items-center justify-center text-[10px] font-bold text-white shrink-0 shadow-xs overflow-hidden border border-app-border/40"
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

            <span class="text-xs font-bold text-app-accent uppercase tracking-wider truncate">
              {{ directory.displayInfo(order.provider_id).name }}
            </span>

            <span v-if="order.provider_order_id" class="text-[10px] font-mono text-app-text-sub bg-black/5 dark:bg-white/10 px-1.5 py-0.5 rounded shrink-0">
              #{{ order.provider_order_id }}
            </span>
          </div>

          <!-- Giá tiền (tự quy đổi USD/VNĐ theo toggle) -->
          <div class="text-right shrink-0">
            <span class="font-mono font-bold text-sm sm:text-base text-app-accent">
              {{ money.formatOrderPrice(Number(order.total_price) || 0, order.currency) }}
            </span>
            <span v-if="order.quantity > 1" class="text-[10px] text-app-text-sub ml-1">
              (x{{ order.quantity }})
            </span>
          </div>
        </div>

        <!-- Tầng 2: Tên sản phẩm to rõ, trải rộng 100% -->
        <div class="font-bold text-app-text text-sm leading-snug group-hover:text-app-accent transition-colors break-words">
          {{ order.product_name }}
        </div>

        <!-- Tầng 3: Footer [Thời gian + Badge trạng thái + Keys] | Nút hành động [Bán lại / Đã bán] -->
        <div class="flex items-center justify-between gap-2 pt-1.5 border-t border-app-border/50 text-xs">
          <div class="flex items-center gap-2 flex-wrap text-app-text-sub text-[11px]">
            <span class="flex items-center gap-1">
              <Clock class="w-3 h-3 opacity-70" /> {{ formatDate(order.created_at) }}
            </span>
            <span 
              class="text-[10px] px-2 py-0.5 rounded-full font-bold border shrink-0"
              :class="{
                'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20': order.status === 'completed',
                'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20': order.status === 'processing',
                'bg-rose-500/10 text-rose-600 border-rose-500/20': order.status === 'failed'
              }"
            >
              {{ order.status === 'processing' ? 'Đang xử lý' : (order.status === 'failed' ? 'Thất bại' : 'Hoàn thành') }}
            </span>
            <span v-if="order.delivered_items && order.delivered_items.length > 0" class="text-emerald-600 dark:text-emerald-400 font-semibold">
              {{ order.delivered_items.length }} key
            </span>
          </div>

          <!-- Nút hành động: Bán lại vs Đã bán -->
          <div class="shrink-0 flex items-center gap-1.5" @click.stop>
            <button 
              v-if="order.is_sold"
              type="button"
              @click="$emit('view-transaction', order.linked_transaction_id)"
              class="px-2.5 py-1 text-xs font-bold bg-blue-500/10 text-blue-600 dark:text-blue-400 hover:bg-blue-500/20 rounded-xl flex items-center gap-1 border border-blue-500/20 transition-all touch-active"
              title="Đã bán - Bấm để mở chi tiết đơn bán trong sổ bán hàng"
            >
              <ExternalLink class="w-3.5 h-3.5" />
              <span>Đã bán</span>
            </button>
            <button 
              v-else-if="order.status === 'completed'"
              type="button"
              @click="$emit('resell-order', order)"
              class="px-2.5 py-1 text-xs font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20 rounded-xl flex items-center gap-1 border border-emerald-500/20 transition-all touch-active shadow-xs"
              title="Tạo đơn bán lại cho khách"
            >
              <TrendingUp class="w-3.5 h-3.5" />
              <span>Bán lại</span>
            </button>

            <ChevronRight class="w-4 h-4 text-app-text-sub group-hover:text-app-text group-hover:translate-x-0.5 transition-all" />
          </div>
        </div>
      </div>
    </div>

    <!-- Purchase Order Detail Modal -->
    <PurchaseOrderDetailModal
      :is-open="isDetailModalOpen"
      :order="selectedOrder"
      @close="isDetailModalOpen = false"
      @resell="emit('resell-order', $event)"
      @view-transaction="emit('view-transaction', $event)"
      @deleted="fetchOrders"
      @status-updated="fetchOrders"
    />
  </div>
</template>
