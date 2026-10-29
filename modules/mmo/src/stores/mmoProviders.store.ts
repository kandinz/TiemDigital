import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { apiClient } from '@/services/api.client';
import { badgeStyle } from '@/utils/providerBadge';

export interface MmoProvider {
  id: string;
  name: string;
  base_url: string;
  is_active: boolean;
  sort_order: number;
  bot_url: string | null;
  avatar_url: string | null;
  badge_color: string | null;
  api_key_masked: string | null;
  balance: number | null;
  balance_currency: string | null;
  balance_cached_at: string | null;
}

export interface ProviderDisplayInfo {
  name: string;
  avatarUrl: string | null;
  botUrl: string | null;
  badgeClass: string;
  solidClass: string;
}

function botLink(raw: string): string {
  const url = raw.trim();
  if (url.startsWith('@')) return `https://t.me/${url.slice(1)}`;
  if (!url.startsWith('http://') && !url.startsWith('https://')) return `https://t.me/${url}`;
  return url;
}

// Provider directory: the single source for how a vendor looks and where its bot lives.
export const useMmoProvidersStore = defineStore('mmoProviders', () => {
  const providers = ref<MmoProvider[]>([]);
  const usdRate = ref<number | null>(null);
  let loading: Promise<void> | null = null;

  const fetchAll = async () => {
    const { data } = await apiClient.get('/mmo/providers');
    providers.value = data?.providers || [];
    usdRate.value = Number(data?.usd_rate) || null;
  };

  const load = () => {
    if (!loading) {
      loading = fetchAll().catch((err) => {
        loading = null;
        throw err;
      });
    }
    return loading;
  };

  const refresh = () => {
    loading = null;
    return load();
  };

  const activeProviders = computed(() => providers.value.filter((p) => p.is_active));
  const providerIds = computed(() => providers.value.map((p) => p.id));

  const displayInfo = (providerId: string): ProviderDisplayInfo => {
    const p = providers.value.find((x) => x.id === providerId);
    const style = badgeStyle(p?.badge_color);
    return {
      name: p?.name ?? (providerId ? providerId.charAt(0).toUpperCase() + providerId.slice(1) : ''),
      avatarUrl: p?.avatar_url || null,
      botUrl: p?.bot_url || null,
      badgeClass: style.badge,
      solidClass: style.solid,
    };
  };

  const openBot = (providerId: string) => {
    const { botUrl } = displayInfo(providerId);
    if (!botUrl) return;
    window.open(botLink(botUrl), '_blank', 'noopener,noreferrer');
  };

  return { providers, usdRate, activeProviders, providerIds, load, refresh, displayInfo, openBot };
});
