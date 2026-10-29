import { defineStore } from 'pinia';
import { computed, ref, watch } from 'vue';
import { useMmoProvidersStore } from './mmoProviders.store';

export type DisplayCurrency = 'USD' | 'VND';

const STORAGE_KEY = 'mmo_display_currency';

function readStoredCurrency(): DisplayCurrency {
  return localStorage.getItem(STORAGE_KEY) === 'VND' ? 'VND' : 'USD';
}

// Single place that decides how a USD-based amount is shown to the user.
export const useMmoMoneyStore = defineStore('mmoMoney', () => {
  const currency = ref<DisplayCurrency>(readStoredCurrency());
  const usdRate = computed(() => useMmoProvidersStore().usdRate);

  watch(currency, (value) => localStorage.setItem(STORAGE_KEY, value));

  const toggle = () => {
    currency.value = currency.value === 'USD' ? 'VND' : 'USD';
  };

  const formatUsd = (amount: number) =>
    `$${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const formatVnd = (amount: number) => `${Math.round(amount).toLocaleString('vi-VN')} đ`;

  // originalAmount/originalCurrency: what the vendor itself charges, preferred over a converted figure.
  const format = (amountUsd: number, originalAmount?: number | null, originalCurrency?: string | null) => {
    if (currency.value === 'VND') {
      if (originalCurrency === 'VND' && originalAmount) return formatVnd(originalAmount);
      if (usdRate.value) return formatVnd(amountUsd * usdRate.value);
    }
    return formatUsd(amountUsd);
  };

  // Used for Transactions and Reports where figures are stored in VND
  const formatVndAmount = (amountVnd: number) => {
    if (currency.value === 'USD') {
      const rate = usdRate.value && usdRate.value > 0 ? usdRate.value : 25500;
      return formatUsd(amountVnd / rate);
    }
    return formatVnd(amountVnd);
  };

  // Used for Purchase Orders from vendors
  const formatOrderPrice = (totalPrice: number, orderCurrency?: string | null) => {
    const isOrderUsd = orderCurrency === 'USD' || (totalPrice > 0 && totalPrice < 500 && orderCurrency !== 'VND');
    const rate = usdRate.value && usdRate.value > 0 ? usdRate.value : 25500;

    if (currency.value === 'USD') {
      if (isOrderUsd) return formatUsd(totalPrice);
      return formatUsd(totalPrice / rate);
    } else {
      if (isOrderUsd) return formatVnd(totalPrice * rate);
      return formatVnd(totalPrice);
    }
  };

  const refreshSignal = ref(0);
  const isRefreshing = ref(false);

  const triggerRefresh = () => {
    refreshSignal.value++;
  };

  return {
    currency,
    usdRate,
    toggle,
    format,
    formatVndAmount,
    formatOrderPrice,
    formatUsd,
    formatVnd,
    refreshSignal,
    isRefreshing,
    triggerRefresh,
  };
});
