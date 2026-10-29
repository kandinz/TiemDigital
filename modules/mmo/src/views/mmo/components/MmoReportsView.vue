<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { apiClient } from '@/services/api.client';
import { useToastStore } from '@/stores/toast.store';
import { useExpenseParser } from '@/composables/useExpenseParser';
import { useMmoMoneyStore } from '@/stores/mmoMoney.store';
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  Percent,
  Calendar,
  BarChart3,
  ShoppingBag,
} from 'lucide-vue-next';

const toast = useToastStore();
const money = useMmoMoneyStore();
const { formatMoney } = useExpenseParser();

const getTodayDate = () => new Date().toISOString().split('T')[0];

const isLoading = ref(false);
const activePeriod = ref<'month' | 'day' | 'year' | 'custom'>('month');
const filterDate = ref<string>(getTodayDate());
const filterMonth = ref<string>(getTodayDate().slice(0, 7));
const filterYear = ref<string>(String(new Date().getFullYear()));
const filterFromDate = ref<string>(getTodayDate());
const filterToDate = ref<string>(getTodayDate());

// Summary KPIs
const summary = ref({
  totalRevenue: 0,
  totalCost: 0,
  totalOtherExpense: 0,
  totalExpense: 0,
  netProfit: 0,
  profitMargin: 0,
  countSales: 0,
  countExpenses: 0,
  totalCount: 0,
});

// 12-Month Stats
const chartYear = ref<number>(new Date().getFullYear());
const monthlyStats = ref<any[]>([]);
const yearSummary = ref<any>({});
const activeHoverMonth = ref<any>(null);

const loadSummary = async () => {
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

    const { data } = await apiClient.get('/mmo/reports/summary', { params });
    if (data?.success && data?.summary) {
      summary.value = data.summary;
    }
  } catch (err: any) {
    console.error('Failed to load report summary:', err);
  } finally {
    isLoading.value = false;
  }
};

const loadMonthly = async () => {
  try {
    const { data } = await apiClient.get('/mmo/reports/monthly', {
      params: { year: chartYear.value },
    });
    if (data?.success) {
      monthlyStats.value = data.months || [];
      yearSummary.value = data.yearSummary || {};
    }
  } catch (err: any) {
    console.error('Failed to load monthly stats:', err);
  }
};

const maxMonthlyValue = computed(() => {
  let max = 0;
  for (const m of monthlyStats.value) {
    if (m.revenue > max) max = m.revenue;
    if (m.totalExpense > max) max = m.totalExpense;
  }
  return max > 0 ? max : 1000000;
});

const formatCompactMoney = (amount: number): string => {
  if (!amount || amount <= 0) return '';
  if (money.currency === 'USD') {
    const rate = money.usdRate && money.usdRate > 0 ? money.usdRate : 25500;
    const usd = amount / rate;
    if (usd >= 1000) return `$${(usd / 1000).toFixed(1)}k`;
    return `$${Math.round(usd)}`;
  }
  if (amount >= 1000000000) {
    const val = amount / 1000000000;
    return `${val >= 10 ? Math.round(val) : val.toFixed(1).replace(/\.0$/, '')}tỷ`;
  }
  if (amount >= 1000000) {
    const val = amount / 1000000;
    return `${val >= 10 ? Math.round(val) : val.toFixed(1).replace(/\.0$/, '')}tr`;
  }
  if (amount >= 1000) {
    return `${Math.round(amount / 1000)}k`;
  }
  return String(amount);
};

const selectMonthFromChart = (monthKey: string) => {
  activePeriod.value = 'month';
  filterMonth.value = monthKey;
};

const refreshAll = async () => {
  await Promise.all([loadSummary(), loadMonthly()]);
};

watch(
  [activePeriod, filterDate, filterMonth, filterYear, filterFromDate, filterToDate],
  () => {
    loadSummary();
  }
);

watch(chartYear, () => {
  loadMonthly();
});

onMounted(() => {
  refreshAll();
});

defineExpose({
  refreshAll,
});
</script>

<template>
  <div class="flex flex-col gap-5">
    <!-- Toolbar Điều Khiển Kỳ Báo Cáo -->
    <div class="flex flex-wrap items-center justify-between gap-3 p-3 rounded-2xl bg-app-surface border border-app-border shadow-xs">
      <div class="flex items-center gap-2">
        <BarChart3 class="w-5 h-5 text-app-accent" />
        <span class="font-bold text-sm text-app-text">Báo Cáo Hiệu Quả Kinh Doanh</span>
      </div>

      <div class="flex items-center gap-2">
        <select
          v-model="activePeriod"
          class="px-3 py-1.5 rounded-xl bg-app-bg border border-app-border text-app-text text-xs font-bold focus:outline-none focus:border-app-accent transition-all"
        >
          <option value="month">Theo Tháng</option>
          <option value="day">Theo Ngày</option>
          <option value="year">Cả Năm</option>
          <option value="custom">Khoảng Tùy Chọn</option>
        </select>

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

    <!-- Khối 5 Thẻ KPI Bento -->
    <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
      <!-- KPI 1: Doanh thu -->
      <div class="p-4 rounded-3xl bg-app-surface border border-app-border shadow-xs flex flex-col justify-between gap-2">
        <div class="flex items-center justify-between">
          <span class="text-xs font-bold text-app-text-sub uppercase tracking-wider">Tổng Doanh Thu</span>
          <div class="w-8 h-8 rounded-xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center">
            <TrendingUp class="w-4 h-4" />
          </div>
        </div>
        <div class="flex flex-col">
          <span class="text-xl sm:text-2xl font-extrabold text-emerald-600 dark:text-emerald-400">
            {{ money.formatVndAmount(summary.totalRevenue) }}
          </span>
          <span class="text-[11px] text-app-text-sub font-medium mt-0.5">
            {{ summary.countSales }} đơn bán thành công
          </span>
        </div>
      </div>

      <!-- KPI 2: Tổng Đơn Hàng Bán -->
      <div class="p-4 rounded-3xl bg-app-surface border border-app-border shadow-xs flex flex-col justify-between gap-2">
        <div class="flex items-center justify-between">
          <span class="text-xs font-bold text-app-text-sub uppercase tracking-wider">Tổng Đơn Bán</span>
          <div class="w-8 h-8 rounded-xl bg-blue-500/10 text-blue-500 flex items-center justify-center">
            <ShoppingBag class="w-4 h-4" />
          </div>
        </div>
        <div class="flex flex-col">
          <span class="text-xl sm:text-2xl font-extrabold text-blue-600 dark:text-blue-400">
            {{ summary.countSales }}
          </span>
          <span class="text-[11px] text-app-text-sub font-medium mt-0.5">
            Đơn hàng trong kỳ
          </span>
        </div>
      </div>

      <!-- KPI 3: Tổng chi phí (Vốn + Chi phí khác) -->
      <div class="p-4 rounded-3xl bg-app-surface border border-app-border shadow-xs flex flex-col justify-between gap-2">
        <div class="flex items-center justify-between">
          <span class="text-xs font-bold text-app-text-sub uppercase tracking-wider">Tổng Chi Phí</span>
          <div class="w-8 h-8 rounded-xl bg-rose-500/10 text-rose-500 flex items-center justify-center">
            <TrendingDown class="w-4 h-4" />
          </div>
        </div>
        <div class="flex flex-col">
          <span class="text-xl sm:text-2xl font-extrabold text-rose-500">
            {{ money.formatVndAmount(summary.totalExpense) }}
          </span>
          <span class="text-[11px] text-app-text-sub font-medium mt-0.5">
            Vốn: {{ money.formatVndAmount(summary.totalCost) }} • Khác: {{ money.formatVndAmount(summary.totalOtherExpense) }}
          </span>
        </div>
      </div>

      <!-- KPI 4: Lợi nhuận ròng -->
      <div class="p-4 rounded-3xl bg-app-surface border border-app-border shadow-xs flex flex-col justify-between gap-2">
        <div class="flex items-center justify-between">
          <span class="text-xs font-bold text-app-text-sub uppercase tracking-wider">Lợi Nhuận Ròng</span>
          <div
            class="w-8 h-8 rounded-xl flex items-center justify-center"
            :class="summary.netProfit >= 0 ? 'bg-emerald-500/10 text-emerald-500' : 'bg-rose-500/10 text-rose-500'"
          >
            <DollarSign class="w-4 h-4" />
          </div>
        </div>
        <div class="flex flex-col">
          <span
            class="text-xl sm:text-2xl font-extrabold"
            :class="summary.netProfit >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500'"
          >
            {{ summary.netProfit >= 0 ? '+' : '' }}{{ money.formatVndAmount(summary.netProfit) }}
          </span>
          <span class="text-[11px] text-app-text-sub font-medium mt-0.5">
            {{ summary.netProfit >= 0 ? 'Dương dòng tiền (Lãi)' : 'Âm dòng tiền (Lỗ)' }}
          </span>
        </div>
      </div>

      <!-- KPI 5: Tỷ suất lợi nhuận -->
      <div class="p-4 rounded-3xl bg-app-surface border border-app-border shadow-xs flex flex-col justify-between gap-2 col-span-2 sm:col-span-1">
        <div class="flex items-center justify-between">
          <span class="text-xs font-bold text-app-text-sub uppercase tracking-wider">Tỷ Suất Lợi Nhuận</span>
          <div class="w-8 h-8 rounded-xl bg-app-accent/10 text-app-accent flex items-center justify-center">
            <Percent class="w-4 h-4" />
          </div>
        </div>
        <div class="flex flex-col">
          <span class="text-xl sm:text-2xl font-extrabold text-app-accent">
            {{ summary.profitMargin }}%
          </span>
          <span class="text-[11px] text-app-text-sub font-medium mt-0.5">
            {{ summary.totalCount }} tổng bản ghi
          </span>
        </div>
      </div>
    </div>

    <!-- Khối Biểu Đồ 12 Tháng -->
    <div class="p-4 sm:p-5 rounded-3xl bg-app-surface border border-app-border shadow-xs flex flex-col gap-4">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2">
          <span class="font-bold text-sm text-app-text">Tương Quan Thu - Chi 12 Tháng</span>
          <span class="text-xs text-app-text-sub font-medium">Năm {{ chartYear }}</span>
        </div>

        <div class="flex items-center gap-2">
          <div class="flex items-center gap-3 text-xs font-bold mr-2">
            <span class="flex items-center gap-1.5 text-emerald-500">
              <span class="w-2.5 h-2.5 rounded-full bg-emerald-500"></span> Thu
            </span>
            <span class="flex items-center gap-1.5 text-rose-500">
              <span class="w-2.5 h-2.5 rounded-full bg-rose-500"></span> Chi
            </span>
          </div>

          <select
            v-model.number="chartYear"
            class="px-2.5 py-1 rounded-xl bg-app-bg border border-app-border text-app-text text-xs font-bold"
          >
            <option :value="2024">2024</option>
            <option :value="2025">2025</option>
            <option :value="2026">2026</option>
          </select>
        </div>
      </div>

      <!-- Chart Bars -->
      <div class="pt-6 pb-2 flex items-end justify-between gap-1 sm:gap-2 h-56 border-b border-app-border">
        <div
          v-for="m in monthlyStats"
          :key="m.month"
          @click="selectMonthFromChart(m.monthKey)"
          class="flex-1 flex flex-col items-center h-full justify-end group cursor-pointer relative"
        >
          <!-- Tooltip khi hover -->
          <div
            class="absolute -top-14 z-20 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity bg-black/85 text-white text-[10px] py-1.5 px-2.5 rounded-xl whitespace-nowrap shadow-lg flex flex-col items-center gap-0.5"
          >
            <span class="font-bold">{{ m.label }} ({{ m.countSales || 0 }} đơn bán)</span>
            <span>Thu: {{ money.formatVndAmount(m.revenue) }}</span>
            <span>Chi: {{ money.formatVndAmount(m.totalExpense) }}</span>
          </div>

          <!-- Cặp cột Thu - Chi kèm giá trị trực tiếp trên đỉnh -->
          <div class="w-full flex items-end justify-center gap-0.5 sm:gap-1.5 h-36">
            <!-- Cột Thu -->
            <div class="flex flex-col items-center justify-end h-full w-2.5 sm:w-4 min-w-0">
              <span
                v-if="m.revenue > 0"
                class="text-[8px] sm:text-[9px] font-bold text-emerald-600 dark:text-emerald-400 whitespace-nowrap mb-0.5 leading-none"
              >
                {{ formatCompactMoney(m.revenue) }}
              </span>
              <div
                class="w-full rounded-t-md bg-emerald-500 transition-all duration-300 group-hover:bg-emerald-400"
                :style="{ height: `${Math.max(4, (m.revenue / maxMonthlyValue) * 100)}%` }"
                :title="`Thu: ${money.formatVndAmount(m.revenue)}`"
              ></div>
            </div>

            <!-- Cột Chi -->
            <div class="flex flex-col items-center justify-end h-full w-2.5 sm:w-4 min-w-0">
              <span
                v-if="m.totalExpense > 0"
                class="text-[8px] sm:text-[9px] font-bold text-rose-500 whitespace-nowrap mb-0.5 leading-none"
              >
                {{ formatCompactMoney(m.totalExpense) }}
              </span>
              <div
                class="w-full rounded-t-md bg-rose-500 transition-all duration-300 group-hover:bg-rose-400"
                :style="{ height: `${Math.max(4, (m.totalExpense / maxMonthlyValue) * 100)}%` }"
                :title="`Chi: ${money.formatVndAmount(m.totalExpense)}`"
              ></div>
            </div>
          </div>

          <!-- Nhãn tháng bên dưới -->
          <span class="text-[11px] font-bold text-app-text-sub mt-2 group-hover:text-app-accent">
            {{ m.shortLabel }}
          </span>

          <!-- Huy hiệu số đơn bán của tháng -->
          <span
            v-if="m.countSales > 0"
            class="text-[9px] px-1 py-0.5 rounded font-bold bg-blue-500/10 text-blue-600 dark:text-blue-400 mt-1 whitespace-nowrap inline-flex items-center gap-0.5 border border-blue-500/20 shadow-xs"
            :title="`${m.countSales} đơn bán`"
          >
            <span>{{ m.countSales }} đơn</span>
          </span>
          <span v-else class="text-[9px] text-transparent mt-1 select-none py-0.5 leading-none">-</span>
        </div>
      </div>
    </div>

  </div>
</template>
