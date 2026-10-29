<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { apiClient } from '@/services/api.client';
import { useToastStore } from '@/stores/toast.store';
import { useExpenseParser } from '@/composables/useExpenseParser';
import { useMmoMoneyStore } from '@/stores/mmoMoney.store';
import TransactionFormModal from './TransactionFormModal.vue';
import TransactionDetailModal from './TransactionDetailModal.vue';
import {
  ShoppingCart,
  Search,
  Plus,
  Calendar,
  Filter,
  Loader2,
  ShieldCheck,
  Clock,
  Receipt,
  Tag,
  ChevronRight,
  X,
} from 'lucide-vue-next';

const emit = defineEmits<{
  (e: 'switch-tab', tab: 'products' | 'purchases' | 'sales' | 'reports'): void;
}>();

const toast = useToastStore();
const { formatMoney } = useExpenseParser();

const getTodayDate = () => new Date().toISOString().split('T')[0];

const isLoading = ref(false);
const transactions = ref<any[]>([]);
const totalCount = ref(0);

// Bộ lọc
const searchQuery = ref('');
const activeTypeFilter = ref<'all' | 'sale' | 'expense' | 'purchase'>('all');
const activePeriod = ref<'all' | 'day' | 'month' | 'year' | 'custom'>('month');
const filterDate = ref<string>(getTodayDate());
const filterMonth = ref<string>(getTodayDate().slice(0, 7));
const filterYear = ref<string>(String(new Date().getFullYear()));
const filterFromDate = ref<string>(getTodayDate());
const filterToDate = ref<string>(getTodayDate());
const activeWarrantyFilter = ref<string>('all');

// Modals
const isFormModalOpen = ref(false);
const prefillFormData = ref<any>(null);

const isDetailModalOpen = ref(false);
const selectedTransaction = ref<any>(null);

const fetchTransactions = async () => {
  isLoading.value = true;
  try {
    const params: Record<string, string> = {
      period: activePeriod.value,
    };

    if (activePeriod.value === 'day') params.date = filterDate.value;
    else if (activePeriod.value === 'month') params.month = filterMonth.value;
    else if (activePeriod.value === 'year') params.year = filterYear.value;
    else if (activePeriod.value === 'custom') {
      params.from_date = filterFromDate.value;
      params.to_date = filterToDate.value;
    }

    if (activeTypeFilter.value !== 'all') {
      params.type = activeTypeFilter.value;
    }

    if (searchQuery.value.trim()) {
      params.q = searchQuery.value.trim();
    }

    if (activeWarrantyFilter.value !== 'all') {
      params.warranty = activeWarrantyFilter.value;
    }

    const { data } = await apiClient.get('/mmo/transactions', { params });
    if (data?.success) {
      transactions.value = data.transactions || [];
      totalCount.value = data.total || 0;
    }
  } catch (err: any) {
    toast.error('Lỗi khi tải lịch sử giao dịch', err.message);
  } finally {
    isLoading.value = false;
  }
};

const extractUrl = (text?: string | null): string | null => {
  if (!text) return null;
  const match = text.match(/https?:\/\/[^\s]+/i);
  return match ? match[0] : null;
};

// Mở modal tạo đơn mới (nhập tay)
const openCreateModal = () => {
  prefillFormData.value = null;
  isFormModalOpen.value = true;
};

// Mở modal bán lại từ đơn mua NCC (được gọi từ bên ngoài hoặc từ nút Bán lại)
const openResellFromOrder = (order: {
  product_name: string;
  total_price: number;
  currency?: string;
  delivered_items?: string[];
  id: string;
}) => {
  prefillFormData.value = {
    productName: order.product_name,
    costPrice: order.total_price || 0,
    currency: order.currency || 'USD',
    deliveredData: Array.isArray(order.delivered_items) ? order.delivered_items.join('\n') : '',
    purchaseOrderId: order.id,
  };
  isFormModalOpen.value = true;
};

// Mở modal chi tiết giao dịch
const openDetail = (tx: any) => {
  selectedTransaction.value = tx;
  isDetailModalOpen.value = true;
};

// Thống kê nhanh thanh số dư trong kỳ đang lọc
const periodTotals = computed(() => {
  let rev = 0;
  let cost = 0;
  let exp = 0;
  for (const t of transactions.value) {
    if (t.type === 'sale') {
      rev += t.salePrice;
      cost += t.costPrice;
    } else if (t.type === 'expense') {
      exp += t.costPrice;
    }
  }
  const totalExp = cost + exp;
  const net = rev - totalExp;
  return {
    revenue: rev,
    expense: totalExp,
    profit: net,
  };
});

watch(
  [activeTypeFilter, activePeriod, filterDate, filterMonth, filterYear, filterFromDate, filterToDate, activeWarrantyFilter],
  () => {
    fetchTransactions();
  }
);

onMounted(() => {
  fetchTransactions();
});

const money = useMmoMoneyStore();

const openDetailById = async (id: number) => {
  let tx = transactions.value.find((t) => t.id === id);
  if (!tx) {
    try {
      const { data } = await apiClient.get(`/mmo/transactions?q=${id}`);
      if (data?.success && data.transactions?.length > 0) {
        tx = data.transactions.find((t: any) => t.id === id) || data.transactions[0];
      }
    } catch {
      // ignore
    }
  }
  if (tx) {
    openDetail(tx);
  }
};

defineExpose({
  fetchTransactions,
  openResellFromOrder,
  openDetailById,
});
</script>

<template>
  <div class="flex flex-col gap-4">
    <!-- Hàng trên cùng: Toolbar Tìm kiếm & Nút Tạo mới -->
    <div class="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
      <!-- Ô Tìm kiếm thông minh -->
      <div class="flex-1 flex items-center gap-2">
        <div class="relative flex-1">
          <Search class="w-4 h-4 text-app-text-sub absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            v-model="searchQuery"
            @keydown.enter="fetchTransactions"
            type="text"
            placeholder="Tìm sản phẩm, khách hàng, key hoặc ghi chú bảo hành..."
            class="w-full pl-10 pr-8 py-2.5 rounded-2xl bg-app-surface border border-app-border text-app-text text-sm placeholder:text-app-text-sub/50 focus:outline-none focus:border-app-accent transition-all shadow-xs"
          />
          <button
            v-if="searchQuery"
            type="button"
            @click="searchQuery = ''; fetchTransactions()"
            class="absolute inset-y-0 right-0 pr-3 flex items-center text-app-text-sub hover:text-app-text"
            title="Xóa tìm kiếm"
          >
            <X class="w-4 h-4" />
          </button>
        </div>
        <button
          type="button"
          @click="fetchTransactions"
          class="px-4 py-2.5 rounded-xl bg-app-accent text-white text-xs font-bold hover:bg-app-accent-strong transition-colors flex items-center gap-1.5 shrink-0 shadow-xs touch-active"
        >
          <Search class="w-3.5 h-3.5" />
          <span>Tìm</span>
        </button>
      </div>

      <!-- Hàng nút thao tác -->
      <div class="flex items-center gap-2 shrink-0">
        <button
          type="button"
          @click="openCreateModal"
          class="flex-1 sm:flex-initial px-4 py-2.5 rounded-xl bg-app-accent hover:bg-app-accent-strong text-white font-bold text-sm flex items-center justify-center gap-2 transition-all shadow-accent touch-active"
        >
          <Plus class="w-4 h-4" />
          <span>Ghi Nhận Giao Dịch</span>
        </button>
      </div>
    </div>

    <!-- Thanh Lọc: Loại Giao Dịch & Kỳ Thời Gian -->
    <div class="flex flex-wrap items-center justify-between gap-2.5 p-2 rounded-2xl bg-app-surface border border-app-border shadow-xs">
      <!-- Bộ lọc loại -->
      <div class="flex items-center gap-1 overflow-x-auto p-0.5">
        <button
          v-for="t in [
            { id: 'all', label: 'Tất cả' },
            { id: 'sale', label: 'Đơn bán (+)' },
            { id: 'expense', label: 'Chi phí (-)' },
          ]"
          :key="t.id"
          type="button"
          @click="activeTypeFilter = t.id as any"
          class="px-3 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0"
          :class="
            activeTypeFilter === t.id
              ? 'bg-app-accent text-white shadow-xs'
              : 'text-app-text-sub hover:text-app-text'
          "
        >
          {{ t.label }}
        </button>
      </div>

      <!-- Bộ lọc Kỳ -->
      <div class="flex items-center gap-2 shrink-0">
        <select
          v-model="activePeriod"
          class="px-3 py-1.5 rounded-xl bg-app-bg border border-app-border text-app-text text-xs font-bold focus:outline-none focus:border-app-accent transition-all"
        >
          <option value="month">Tháng này</option>
          <option value="day">Hôm nay</option>
          <option value="year">Năm nay</option>
          <option value="all">Tất cả kỳ</option>
          <option value="custom">Tùy chọn...</option>
        </select>

        <!-- Input ngày/tháng cụ thể -->
        <input
          v-if="activePeriod === 'day'"
          type="date"
          v-model="filterDate"
          class="px-2.5 py-1.5 rounded-xl bg-app-bg border border-app-border text-app-text text-xs font-medium focus:outline-none"
        />
        <input
          v-else-if="activePeriod === 'month'"
          type="month"
          v-model="filterMonth"
          class="px-2.5 py-1.5 rounded-xl bg-app-bg border border-app-border text-app-text text-xs font-medium focus:outline-none"
        />
        <input
          v-else-if="activePeriod === 'year'"
          type="number"
          v-model="filterYear"
          min="2024"
          max="2030"
          class="w-20 px-2.5 py-1.5 rounded-xl bg-app-bg border border-app-border text-app-text text-xs font-bold focus:outline-none"
        />
        <div v-else-if="activePeriod === 'custom'" class="flex items-center gap-1.5">
          <input
            type="date"
            v-model="filterFromDate"
            class="px-2 py-1 rounded-xl bg-app-bg border border-app-border text-app-text text-xs"
          />
          <span class="text-app-text-sub text-xs">➔</span>
          <input
            type="date"
            v-model="filterToDate"
            class="px-2 py-1 rounded-xl bg-app-bg border border-app-border text-app-text text-xs"
          />
        </div>
      </div>
    </div>

    <!-- Thanh Thống Kê Nhanh Trong Kỳ Lọc -->
    <div class="grid grid-cols-3 gap-2 sm:gap-3">
      <div class="p-3 sm:p-3.5 rounded-2xl bg-app-surface border border-app-border shadow-xs flex flex-col">
        <span class="text-[11px] font-bold text-app-text-sub uppercase tracking-wider">Doanh Thu</span>
        <span class="text-sm sm:text-base font-extrabold text-emerald-600 dark:text-emerald-400 mt-0.5 truncate">
          {{ money.formatVndAmount(periodTotals.revenue) }}
        </span>
      </div>

      <div class="p-3 sm:p-3.5 rounded-2xl bg-app-surface border border-app-border shadow-xs flex flex-col">
        <span class="text-[11px] font-bold text-app-text-sub uppercase tracking-wider">Tổng Chi Phí</span>
        <span class="text-sm sm:text-base font-extrabold text-rose-500 mt-0.5 truncate">
          {{ money.formatVndAmount(periodTotals.expense) }}
        </span>
      </div>

      <div class="p-3 sm:p-3.5 rounded-2xl bg-app-surface border border-app-border shadow-xs flex flex-col">
        <span class="text-[11px] font-bold text-app-text-sub uppercase tracking-wider">Lợi Nhuận Ròng</span>
        <span
          class="text-sm sm:text-base font-extrabold mt-0.5 truncate"
          :class="periodTotals.profit >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500'"
        >
          {{ periodTotals.profit >= 0 ? '+' : '' }}{{ money.formatVndAmount(periodTotals.profit) }}
        </span>
      </div>
    </div>

    <!-- Bộ Lọc Trạng Thái Bảo Hành (Chips) -->
    <div class="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs font-bold">
      <span class="text-app-text-sub shrink-0 flex items-center gap-1 mr-1">
        <ShieldCheck class="w-3.5 h-3.5 text-app-accent" />
        <span>Bảo hành:</span>
      </span>
      <button
        v-for="w in [
          { id: 'all', label: 'Tất cả' },
          { id: 'valid', label: '🟢 Còn hạn' },
          { id: 'expiring_soon', label: '🟡 Sắp hết' },
          { id: 'expired', label: '🔴 Đã hết' },
          { id: 'lifetime', label: '🟣 Vĩnh viễn' },
        ]"
        :key="w.id"
        type="button"
        @click="activeWarrantyFilter = w.id"
        class="px-2.5 py-1 rounded-xl border transition-all shrink-0"
        :class="
          activeWarrantyFilter === w.id
            ? 'bg-app-accent text-white border-app-accent shadow-xs'
            : 'bg-app-surface border-app-border text-app-text-sub hover:text-app-text'
        "
      >
        {{ w.label }}
      </button>
    </div>

    <!-- Danh sách giao dịch dạng dòng (Compact Rows) -->
    <div class="flex flex-col gap-2">
      <!-- Loading state -->
      <div v-if="isLoading" class="py-12 flex flex-col items-center justify-center gap-3">
        <Loader2 class="w-6 h-6 animate-spin text-app-accent" />
        <span class="text-xs font-semibold text-app-text-sub">Đang tải lịch sử giao dịch...</span>
      </div>

      <!-- Empty state -->
      <div
        v-else-if="transactions.length === 0"
        class="py-12 rounded-3xl bg-app-surface border border-app-border flex flex-col items-center justify-center gap-3 text-center px-4"
      >
        <div class="w-12 h-12 rounded-2xl bg-app-bg flex items-center justify-center text-app-text-sub">
          <Receipt class="w-6 h-6" />
        </div>
        <div class="flex flex-col">
          <span class="font-bold text-sm text-app-text">Chưa có giao dịch nào</span>
          <span class="text-xs text-app-text-sub max-w-sm">
            Không tìm thấy bản ghi giao dịch trong kỳ đã chọn. Bấm "Ghi Nhận Giao Dịch" để tạo đơn đầu tiên.
          </span>
        </div>
        <button
          type="button"
          @click="openCreateModal"
          class="mt-2 px-4 py-2 rounded-xl bg-app-accent text-white text-xs font-bold shadow-accent"
        >
          + Thêm Giao Dịch Mới
        </button>
      </div>

      <!-- Transaction Cards/Rows -->
      <div
        v-else
        v-for="tx in transactions"
        :key="tx.id"
        @click="openDetail(tx)"
        class="p-3 sm:p-3.5 rounded-2xl bg-app-surface border border-app-border hover:border-app-accent/50 transition-all cursor-pointer shadow-xs hover:shadow-sm flex flex-col gap-2 touch-active group"
      >
        <!-- Hàng 1: Tên đầy đủ wrap xuống dòng không ẩn -->
        <div class="w-full">
          <span class="font-bold text-sm sm:text-base text-app-text leading-snug break-words whitespace-normal group-hover:text-app-accent transition-colors">
            {{ tx.productName }}
          </span>
        </div>

        <!-- Hàng 2: Dàn đều 2 bên (Bên trái: Ngày giao dịch + BH; Bên phải: Giá tiền) -->
        <div class="flex items-center justify-between gap-2 pt-1 border-t border-app-border/40">
          <div class="flex items-center gap-2 text-xs text-app-text-sub flex-wrap">
            <span class="font-medium">{{ tx.date }}</span>

            <!-- Badge số ngày bảo hành còn lại -->
            <span
              v-if="tx.type === 'sale' && tx.warrantyPeriod !== 'none'"
              class="px-2 py-0.5 rounded-lg text-[10px] font-bold shrink-0"
              :class="{
                'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400': tx.warrantyStatus === 'valid',
                'bg-amber-500/10 text-amber-600 dark:text-amber-400': tx.warrantyStatus === 'expiring_soon',
                'bg-rose-500/10 text-rose-600 dark:text-rose-400': tx.warrantyStatus === 'expired',
                'bg-purple-500/10 text-purple-600 dark:text-purple-400': tx.warrantyStatus === 'lifetime',
              }"
            >
              {{
                tx.warrantyStatus === 'valid'
                  ? `Còn ${tx.warrantyDaysLeft} ngày`
                  : tx.warrantyStatus === 'expiring_soon'
                  ? `Sắp hết (${tx.warrantyDaysLeft} ngày)`
                  : tx.warrantyStatus === 'expired'
                  ? 'Hết BH'
                  : 'BH: Vĩnh viễn'
              }}
            </span>
          </div>

          <!-- Bên phải: Giá tiền & Icon chuyển hướng nhỏ -->
          <div class="flex items-center gap-1.5 shrink-0">
            <span
              class="font-extrabold text-sm sm:text-base font-mono"
              :class="tx.type === 'sale' ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500'"
            >
              {{ tx.type === 'sale' ? '+' : '-' }}{{ money.formatVndAmount(tx.type === 'sale' ? tx.salePrice : tx.costPrice) }}
            </span>
            <ChevronRight class="w-3.5 h-3.5 text-app-text-sub opacity-50 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all" />
          </div>
        </div>
      </div>
    </div>

    <!-- Modals -->
    <TransactionFormModal
      :is-open="isFormModalOpen"
      :prefill-data="prefillFormData"
      @close="isFormModalOpen = false"
      @saved="fetchTransactions"
    />

    <TransactionDetailModal
      :is-open="isDetailModalOpen"
      :transaction="selectedTransaction"
      @close="isDetailModalOpen = false"
      @updated="fetchTransactions"
      @deleted="fetchTransactions"
    />
  </div>
</template>
