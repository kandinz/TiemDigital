import { defineStore } from 'pinia';
import { ref } from 'vue';
import { apiClient } from '@/services/api.client';

export const useAuthStore = defineStore('auth', () => {
  const user = ref<{ id: string; role: string } | null>(null);
  const isLoggedIn = ref(false);
  const load = async () => {
    const { data } = await apiClient.get('/me');
    user.value = { id: data.userId ?? data.email, role: data.role === 'owner' ? 'admin' : data.role };
    isLoggedIn.value = true;
  };
  return { user, isLoggedIn, load, hasPermission: (_name: string) => user.value?.role === 'admin', openLoginModal: () => window.parent.location.assign('/admin') };
});
