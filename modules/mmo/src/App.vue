<script setup lang="ts">
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useMmoMoneyStore } from './stores/mmoMoney.store';
import ToastContainer from './components/common/ToastContainer.vue';
const route = useRoute(), router = useRouter(), money = useMmoMoneyStore();
const tabs = [['products', 'Kho sản phẩm'], ['purchases', 'Đơn mua'], ['sales', 'Bán hàng & chi phí'], ['reports', 'Báo cáo & bảo hành']];
const active = computed(() => route.query.tab ?? 'products');
const theme = window.parent.document.documentElement.classList.contains('dark') ? 'dark' : 'light';
document.documentElement.dataset.appTheme = theme;
document.documentElement.classList.toggle('dark', theme === 'dark');
</script>
<template>
  <header class="sticky top-0 z-30 bg-app-surface border-b border-app-border p-3 flex flex-wrap items-center gap-2">
    <nav aria-label="MMO" class="flex flex-wrap gap-1 basis-full sm:basis-auto sm:flex-1">
      <button v-for="[id, label] in tabs" :key="id" type="button" :aria-pressed="route.path === '/' && active === id" class="px-3 py-2 rounded-xl text-sm" :class="route.path === '/' && active === id ? 'bg-app-accent text-white' : 'text-app-text-sub hover:bg-app-surface-hover'" @click="router.push({ path: '/', query: { tab: id } })">{{ label }}</button>
      <button type="button" class="px-3 py-2 text-sm text-app-accent" @click="router.push('/settings/mmo')">Cấu hình NCC</button>
    </nav>
    <button type="button" class="px-3 py-2 border border-app-border rounded-xl text-sm" @click="money.toggle()">{{ money.currency }}</button>
    <button type="button" class="px-3 py-2 border border-app-border rounded-xl text-sm" :disabled="money.isRefreshing" @click="money.triggerRefresh()">Làm mới</button>
  </header>
  <main><router-view /></main>
  <ToastContainer />
</template>
