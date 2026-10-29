import { createApp } from 'vue';
import { createPinia } from 'pinia';
import { createRouter, createWebHashHistory } from 'vue-router';
import App from './App.vue';
import { useAuthStore as authStore } from './stores/auth.store';
import './styles/main.css';

const router = createRouter({ history: createWebHashHistory(), routes: [
  { path: '/', component: () => import('./views/mmo/MmoView.vue') },
  { path: '/settings/mmo', component: () => import('./views/settings/MmoSettingsView.vue') },
  { path: '/product', component: () => import('./views/mmo/ProductCatalogView.vue') },
  { path: '/product/swagger', component: () => import('./views/mmo/ProductSwaggerView.vue') },
] });
async function start() {
  const pinia = createPinia();
  const app = createApp(App).use(pinia).use(router);
  await authStore(pinia).load();
  await router.isReady();
  app.mount('#app');
}
start().catch(() => {
  document.getElementById('app')!.textContent = 'Không mở được MMO. Vui lòng đăng nhập lại hoặc kiểm tra quyền Owner.';
});
