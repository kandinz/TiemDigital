<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { apiClient } from '@/services/api.client';
import { useToastStore } from '@/stores/toast.store';
import { useAuthStore } from '@/stores/auth.store';
import { ArrowLeft, Save, RefreshCw, Settings2, ExternalLink, Plus, Trash2, Tag, Key, ChevronUp, ChevronDown } from 'lucide-vue-next';
import AuthGuard from '@/components/common/AuthGuard.vue';
import { useMmoProvidersStore } from '@/stores/mmoProviders.store';
import { BADGE_PALETTE, SELECTABLE_BADGE_COLORS } from '@/utils/providerBadge';

const directory = useMmoProvidersStore();

const router = useRouter();
const toast = useToastStore();
const authStore = useAuthStore();
const isAdmin = authStore.user?.role === 'admin';

const isLoading = ref(false);
const isSavingSettings = ref(false);
const isSyncingTelegram = ref(false);

const isCategoriesExpanded = ref(false);
const isProvidersExpanded = ref(false);

const settings = ref({
  usd_rate: 25500,
});

const categories = ref<{ name: string; rawKeywords: string }[]>([]);
const newCategory = ref({ name: '', keywordInput: '' });

const providers = ref<any[]>([]);

onMounted(() => {
  if (isAdmin) {
    fetchSettings();
    fetchProviders();
  }
});

const fetchSettings = async () => {
  try {
    const { data } = await apiClient.get('/mmo/settings');
    if (data?.success) {
      if (data.settings.usd_rate) settings.value.usd_rate = Number(data.settings.usd_rate);
      if (data.settings.categories) {
        categories.value = data.settings.categories.map((c: any) => ({
          name: c.name,
          rawKeywords: Array.isArray(c.keywords) ? c.keywords.join(', ') : (c.keywords || '')
        }));
      }
    }
  } catch (err: any) {
    console.error(err);
  }
};

const fetchProviders = async () => {
  isLoading.value = true;
  try {
    const { data } = await apiClient.get('/mmo/providers');
    if (data?.success) {
      providers.value = data.providers.map((p: any) => ({
        ...p,
        editName: p.name,
        editBaseUrl: p.base_url,
        editBotUrl: p.bot_url || '',
        editAvatarUrl: p.avatar_url || '',
        editBadgeColor: p.badge_color || '',
        editKey: '',
        isEditingProvider: false,
        isNew: false
      }));
      directory.refresh().catch(() => undefined);
    }
  } catch (err: any) {
    toast.error('Lỗi tải danh sách nhà cung cấp', err.message);
  } finally {
    isLoading.value = false;
  }
};

const addCategory = () => {
  if (!newCategory.value.name.trim()) return;
  categories.value.push({
    name: newCategory.value.name.trim(),
    rawKeywords: newCategory.value.keywordInput.trim()
  });
  newCategory.value.name = '';
  newCategory.value.keywordInput = '';
};

const removeCategory = (index: number) => {
  categories.value.splice(index, 1);
};

const moveCategory = (index: number, direction: 'up' | 'down') => {
  if (direction === 'up' && index > 0) {
    const item = categories.value.splice(index, 1)[0];
    categories.value.splice(index - 1, 0, item);
  } else if (direction === 'down' && index < categories.value.length - 1) {
    const item = categories.value.splice(index, 1)[0];
    categories.value.splice(index + 1, 0, item);
  }
};

const saveSettings = async () => {
  isSavingSettings.value = true;
  try {
    const formattedCategories = categories.value.map(cat => ({
      name: cat.name.trim(),
      keywords: (cat.rawKeywords || '')
        .split(',')
        .map(k => k.trim())
        .filter(Boolean)
    }));

    await apiClient.put('/mmo/settings', {
      usd_rate: Number(settings.value.usd_rate),
      categories: formattedCategories
    });
    toast.success('Đã lưu cấu hình chung');
  } catch (err: any) {
    toast.error('Lỗi lưu cấu hình', err.message);
  } finally {
    isSavingSettings.value = false;
  }
};

const toggleActive = async (provider: any) => {
  const newVal = !provider.is_active;
  try {
    await apiClient.put(`/mmo/providers/${provider.id}`, { is_active: newVal });
    provider.is_active = newVal;
    directory.refresh().catch(() => undefined);
    toast.success(`Đã ${newVal ? 'bật' : 'tắt'} ${provider.name}`);
  } catch (err: any) {
    toast.error('Lỗi', err.message);
  }
};

const formatTelegramUrl = (url?: string | null) => {
  if (!url) return '';
  const trimmed = url.trim();
  if (trimmed.startsWith('@')) return `https://t.me/${trimmed.slice(1)}`;
  if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) return `https://t.me/${trimmed}`;
  return trimmed;
};

const addProvider = () => {
  providers.value.push({
    id: '',
    name: '',
    base_url: '',
    bot_url: '',
    avatar_url: '',
    api_key: '',
    api_key_masked: '',
    is_active: true,
    editName: '',
    editBaseUrl: '',
    editBotUrl: '',
    editAvatarUrl: '',
    editBadgeColor: '',
    editKey: '',
    isEditingProvider: true,
    isNew: true
  });
};

const cancelEditProvider = (p: any) => {
  if (p.isNew) {
    providers.value = providers.value.filter((prov: any) => prov !== p);
  } else {
    p.isEditingProvider = false;
    p.editName = p.name;
    p.editBaseUrl = p.base_url;
    p.editBotUrl = p.bot_url || '';
    p.editAvatarUrl = p.avatar_url || '';
    p.editBadgeColor = p.badge_color || '';
    p.editKey = '';
  }
};

const syncTelegramProviders = async () => {
  isSyncingTelegram.value = true;
  try {
    const { data } = await apiClient.post('/mmo/providers/sync-telegram', {});
    if (data?.success) {
      toast.success(`Đã đồng bộ ${data.updated}/${data.total} nhà cung cấp từ Telegram!`);
      await fetchProviders();
    } else {
      toast.error('Lỗi đồng bộ', data?.message || 'Không thể đồng bộ');
    }
  } catch (err: any) {
    toast.error('Lỗi đồng bộ Telegram', err.response?.data?.message || err.message);
  } finally {
    isSyncingTelegram.value = false;
  }
};

const saveProvider = async (p: any) => {
  try {
    if (!p.id || !p.editName || !p.editBaseUrl) {
      toast.error('Vui lòng điền đủ ID, Tên và Base URL');
      return;
    }
    
    const payload: any = {
      id: p.id,
      name: p.editName,
      base_url: p.editBaseUrl,
      bot_url: p.editBotUrl ? p.editBotUrl.trim() : null,
      avatar_url: p.editAvatarUrl ? p.editAvatarUrl.trim() : null,
      badge_color: p.editBadgeColor || null
    };
    if (p.editKey) payload.api_key = p.editKey;

    if (p.isNew) {
      await apiClient.post('/mmo/providers', payload);
      toast.success('Đã thêm nhà cung cấp');
    } else {
      await apiClient.put(`/mmo/providers/${p.id}`, payload);
      toast.success('Đã cập nhật nhà cung cấp');
    }
    await fetchProviders();
  } catch (err: any) {
    toast.error('Lỗi', err.message);
  }
};

const deleteProvider = async (p: any) => {
  if (!confirm(`Bạn có chắc muốn xóa nhà cung cấp ${p.name}?`)) return;
  try {
    await apiClient.delete(`/mmo/providers/${p.id}`);
    toast.success('Đã xóa nhà cung cấp');
    await fetchProviders();
  } catch (err: any) {
    toast.error('Lỗi', err.message);
  }
};
</script>

<template>
  <div class="px-4 py-4 max-w-3xl mx-auto flex flex-col gap-6 min-h-[calc(100vh-64px)]">
    <!-- Header -->
    <div class="flex items-center gap-3">
      <button 
        @click="router.back()" 
        class="w-10 h-10 flex items-center justify-center bg-app-surface border border-app-border rounded-xl hover:bg-app-surface-hover transition-colors touch-active"
      >
        <ArrowLeft class="w-5 h-5 text-app-text-base" />
      </button>
      <div>
        <h1 class="text-xl font-bold text-app-text-base leading-tight">Cấu hình MMO</h1>
        <p class="text-sm text-app-text-sub">Quản lý nhà cung cấp và danh mục</p>
      </div>
    </div>

    <!-- Auth Guard -->
    <AuthGuard
      v-if="!isAdmin"
      module-name="Quản trị MMO"
      type="forbidden"
    />

    <template v-else>
      <div class="space-y-5 pb-10">
        
        <!-- Khối 1: Thông số chung -->
        <div class="bg-app-surface border border-app-border rounded-2xl p-5 shadow-sm">
          <div class="flex items-center justify-between mb-4">
            <div class="flex items-center gap-2">
              <Settings2 class="w-5 h-5 text-app-accent" />
              <h3 class="font-bold text-app-text-base">Thông số chung</h3>
            </div>
            <button 
              @click="saveSettings" 
              :disabled="isSavingSettings" 
              class="px-4 py-2 bg-app-accent text-white font-bold rounded-xl shadow-accent hover:bg-app-accent-hover transition-colors flex items-center gap-1.5 text-xs touch-active"
            >
              <Save class="w-4 h-4" /> 
              {{ isSavingSettings ? 'Đang lưu...' : 'Lưu cấu hình' }}
            </button>
          </div>
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="block text-sm font-semibold text-app-text-base mb-1.5">Tỷ giá USD/VND</label>
              <input type="number" v-model="settings.usd_rate" class="w-full bg-app-bg border border-app-border rounded-xl px-4 py-2 text-sm focus:border-app-accent focus:outline-none focus:ring-1 focus:ring-app-accent" />
            </div>
          </div>
        </div>

        <!-- Khối 2: Quản lý Danh mục & Keyword (Thu gọn / Mở rộng, mặc định thu gọn) -->
        <div class="bg-app-surface border border-app-border rounded-2xl overflow-hidden shadow-sm transition-all">
          <button 
            @click="isCategoriesExpanded = !isCategoriesExpanded" 
            class="w-full p-5 flex items-center justify-between hover:bg-app-surface-hover/50 transition-colors text-left"
          >
            <div class="flex items-center gap-2.5">
              <Tag class="w-5 h-5 text-app-accent shrink-0" />
              <h3 class="font-bold text-app-text-base">Quản lý Danh mục & Keyword</h3>
              <span class="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-app-border/40 text-app-text-sub">
                {{ categories.length }} danh mục
              </span>
            </div>
            
            <div class="flex items-center gap-1.5 text-xs font-semibold text-app-text-sub">
              <span>{{ isCategoriesExpanded ? 'Thu gọn' : 'Mở rộng' }}</span>
              <ChevronUp v-if="isCategoriesExpanded" class="w-4 h-4" />
              <ChevronDown v-else class="w-4 h-4" />
            </div>
          </button>
          
          <div v-show="isCategoriesExpanded" class="p-5 pt-0 border-t border-app-border/50">
            <div class="space-y-3 mb-4 mt-4">
              <div v-for="(cat, idx) in categories" :key="idx" class="flex gap-2 items-start bg-app-bg p-3 rounded-xl border border-app-border">
                <div class="flex flex-col gap-0.5 mt-4 shrink-0">
                  <button 
                    @click="moveCategory(idx, 'up')" 
                    :disabled="idx === 0" 
                    class="p-1 text-app-text-sub hover:text-app-text disabled:opacity-20 disabled:cursor-not-allowed hover:bg-black/5 dark:hover:bg-white/5 rounded transition-colors"
                    title="Di chuyển lên"
                  >
                    <ChevronUp class="w-4 h-4" />
                  </button>
                  <button 
                    @click="moveCategory(idx, 'down')" 
                    :disabled="idx === categories.length - 1" 
                    class="p-1 text-app-text-sub hover:text-app-text disabled:opacity-20 disabled:cursor-not-allowed hover:bg-black/5 dark:hover:bg-white/5 rounded transition-colors"
                    title="Di chuyển xuống"
                  >
                    <ChevronDown class="w-4 h-4" />
                  </button>
                </div>
                <div class="w-1/3">
                  <label class="block text-xs font-medium text-app-text-sub mb-1">Tên danh mục (#{{ idx + 1 }})</label>
                  <input type="text" v-model="cat.name" class="w-full bg-white dark:bg-black border border-app-border rounded-lg px-3 py-1.5 text-sm" />
                </div>
                <div class="flex-1">
                  <label class="block text-xs font-medium text-app-text-sub mb-1">Keywords (cách nhau dấu phẩy)</label>
                  <input 
                    type="text" 
                    v-model="cat.rawKeywords" 
                    placeholder="VD: chatgpt, openai, gpt..."
                    class="w-full bg-white dark:bg-black border border-app-border rounded-lg px-3 py-1.5 text-sm" 
                  />
                </div>
                <button @click="removeCategory(idx)" class="mt-5 p-2 text-rose-500 hover:bg-rose-500/10 rounded-lg">
                  <Trash2 class="w-4 h-4" />
                </button>
              </div>
            </div>
            
            <!-- Add New Category -->
            <div class="flex gap-2 items-end mb-4">
              <div class="w-1/3">
                <input type="text" v-model="newCategory.name" placeholder="Tên danh mục mới" class="w-full bg-app-bg border border-app-border rounded-lg px-3 py-2 text-sm focus:border-app-accent focus:outline-none focus:ring-1 focus:ring-app-accent" />
              </div>
              <div class="flex-1">
                <input type="text" v-model="newCategory.keywordInput" placeholder="VD: chatgpt, openai, ..." class="w-full bg-app-bg border border-app-border rounded-lg px-3 py-2 text-sm focus:border-app-accent focus:outline-none focus:ring-1 focus:ring-app-accent" @keyup.enter="addCategory" />
              </div>
              <button @click="addCategory" class="p-2 bg-app-accent text-white rounded-lg hover:bg-app-accent-hover transition-colors" title="Thêm danh mục">
                <Plus class="w-5 h-5" />
              </button>
            </div>

            <button @click="saveSettings" :disabled="isSavingSettings" class="w-full py-3 bg-app-accent text-white font-bold rounded-xl shadow-accent hover:bg-app-accent-hover transition-colors flex items-center justify-center gap-2">
              <Save class="w-5 h-5" /> 
              {{ isSavingSettings ? 'Đang lưu...' : 'Lưu cấu hình danh mục' }}
            </button>
          </div>
        </div>

        <!-- Khối 3: Nhà cung cấp (Thu gọn / Mở rộng, mặc định thu gọn) -->
        <div class="bg-app-surface border border-app-border rounded-2xl overflow-hidden shadow-sm transition-all">
          <button 
            @click="isProvidersExpanded = !isProvidersExpanded" 
            class="w-full p-5 flex items-center justify-between hover:bg-app-surface-hover/50 transition-colors text-left"
          >
            <div class="flex items-center gap-2.5">
              <Key class="w-5 h-5 text-app-accent shrink-0" />
              <h3 class="font-bold text-app-text-base">Nhà cung cấp</h3>
              <span class="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-app-border/40 text-app-text-sub">
                {{ providers.length }} nhà cung cấp
              </span>
            </div>
            
            <div class="flex items-center gap-2">
              <button 
                type="button"
                @click.stop="syncTelegramProviders" 
                :disabled="isSyncingTelegram" 
                class="px-2.5 py-1 bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/20 font-bold rounded-lg hover:bg-sky-500/20 transition-all flex items-center gap-1.5 text-xs touch-active disabled:opacity-50"
                title="Tự động đồng bộ Tên và Avatar từ Telegram cho toàn bộ nhà cung cấp"
              >
                <RefreshCw class="w-3.5 h-3.5" :class="{ 'animate-spin': isSyncingTelegram }" /> 
                <span>{{ isSyncingTelegram ? 'Đang sync...' : 'Sync Telegram' }}</span>
              </button>
              <div class="flex items-center gap-1.5 text-xs font-semibold text-app-text-sub">
                <span>{{ isProvidersExpanded ? 'Thu gọn' : 'Mở rộng' }}</span>
                <ChevronUp v-if="isProvidersExpanded" class="w-4 h-4" />
                <ChevronDown v-else class="w-4 h-4" />
              </div>
            </div>
          </button>
          
          <div v-show="isProvidersExpanded" class="p-5 pt-0 border-t border-app-border/50">
            <div v-if="isLoading" class="text-center py-8 text-app-text-sub">
              <RefreshCw class="w-6 h-6 animate-spin mx-auto mb-2 opacity-50" />
              <p class="text-sm">Đang tải...</p>
            </div>
            
            <div v-else class="space-y-4 mt-4">
              <div v-for="p in providers" :key="p.id" class="bg-app-bg border border-app-border rounded-xl overflow-hidden mb-4">
                <div v-if="!p.isEditingProvider">
                  <!-- Header -->
                  <div class="p-3 border-b border-app-border flex items-start justify-between bg-black/5 dark:bg-white/5">
                    <div class="flex-1 min-w-0 pr-3 flex items-start gap-2.5">
                      <!-- Avatar -->
                      <img 
                        v-if="p.avatar_url" 
                        :src="p.avatar_url" 
                        referrerpolicy="no-referrer"
                        alt="" 
                        class="w-9 h-9 rounded-full object-cover border border-app-border shrink-0 bg-black/5 dark:bg-white/5 mt-0.5" 
                      />
                      <div v-else class="w-9 h-9 rounded-full bg-app-accent/10 border border-app-accent/20 text-app-accent flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">
                        {{ (p.name || p.id).charAt(0).toUpperCase() }}
                      </div>

                      <div class="flex-1 min-w-0">
                        <div class="flex items-center gap-2">
                          <h4 class="font-bold text-app-text-base truncate">{{ p.name }}</h4>
                          <span v-if="p.is_active" class="shrink-0 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">Active</span>
                          <span v-else class="shrink-0 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/10 text-rose-600 border border-rose-500/20">Inactive</span>
                        </div>
                        <div class="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1">
                          <a :href="p.base_url" target="_blank" class="text-xs text-app-accent hover:underline flex items-center gap-1">
                            {{ p.base_url }} <ExternalLink class="w-3 h-3" />
                          </a>
                          <a v-if="p.bot_url" :href="formatTelegramUrl(p.bot_url)" target="_blank" class="text-xs text-sky-500 hover:underline flex items-center gap-1">
                            Bot Tele: {{ p.bot_url }} <ExternalLink class="w-3 h-3" />
                          </a>
                        </div>
                      </div>
                    </div>
                    
                    <div class="flex items-center gap-2">
                      <button @click="p.isEditingProvider = true" class="p-1.5 text-app-text-sub hover:text-app-accent bg-app-surface rounded-lg text-xs font-semibold">Sửa</button>
                      <!-- Toggle -->
                      <button 
                        @click="toggleActive(p)"
                        class="relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center justify-center rounded-full focus:outline-none transition-colors"
                        :class="p.is_active ? 'bg-app-accent' : 'bg-app-border'"
                      >
                        <span class="inline-block h-4 w-4 transform rounded-full bg-white transition-transform" :class="p.is_active ? 'translate-x-2.5' : '-translate-x-2.5'"></span>
                      </button>
                    </div>
                  </div>
                  
                  <!-- Body (Key) -->
                  <div class="p-3 bg-app-surface/50 flex flex-col gap-2">
                    <div class="text-xs text-app-text-sub flex justify-between">
                      <span>API Key ({{ p.auth_type }})</span>
                    </div>
                    <div class="bg-app-surface px-3 py-2 rounded-lg border border-app-border text-sm font-mono text-app-text-sub">
                      {{ p.api_key_masked || 'Chưa cấu hình' }}
                    </div>
                  </div>
                </div>
                
                <!-- Edit Form -->
                <div v-else class="p-4 space-y-3">
                  <div>
                    <label class="block text-xs font-medium text-app-text-sub mb-1">ID (Mã rút gọn, không dấu)</label>
                    <input type="text" v-model="p.id" :disabled="!p.isNew" class="w-full bg-app-surface border border-app-border rounded-lg px-3 py-2 text-sm" />
                  </div>
                  <div>
                    <label class="block text-xs font-medium text-app-text-sub mb-1">Tên nhà cung cấp</label>
                    <input type="text" v-model="p.editName" class="w-full bg-app-surface border border-app-border rounded-lg px-3 py-2 text-sm" />
                  </div>
                  <div>
                    <label class="block text-xs font-medium text-app-text-sub mb-1">Base URL</label>
                    <input type="text" v-model="p.editBaseUrl" class="w-full bg-app-surface border border-app-border rounded-lg px-3 py-2 text-sm" />
                  </div>
                  <div>
                    <label class="block text-xs font-medium text-app-text-sub mb-1">Link Bot Telegram (Tùy chọn)</label>
                    <input type="text" v-model="p.editBotUrl" placeholder="VD: https://t.me/your_bot hoặc @your_bot" class="w-full bg-app-surface border border-app-border rounded-lg px-3 py-2 text-sm" />
                  </div>
                  <div>
                    <label class="block text-xs font-medium text-app-text-sub mb-1">Avatar URL (Tùy chọn)</label>
                    <div class="flex items-center gap-2">
                      <div class="w-8 h-8 rounded-full overflow-hidden border border-app-border bg-black/5 dark:bg-white/5 shrink-0 flex items-center justify-center">
                        <img v-if="p.editAvatarUrl" :src="p.editAvatarUrl" referrerpolicy="no-referrer" alt="" class="w-full h-full object-cover" />
                        <span v-else class="text-[9px] text-app-text-sub font-mono">None</span>
                      </div>
                      <input type="text" v-model="p.editAvatarUrl" placeholder="Link ảnh avatar hoặc sync từ Telegram" class="flex-1 bg-app-surface border border-app-border rounded-lg px-3 py-2 text-sm" />
                    </div>
                  </div>
                  <div>
                    <label class="block text-xs font-medium text-app-text-sub mb-1">Màu badge</label>
                    <div class="flex items-center gap-2">
                      <span class="text-[10px] font-bold px-1.5 py-0.5 rounded border" :class="(BADGE_PALETTE[p.editBadgeColor as keyof typeof BADGE_PALETTE] ?? BADGE_PALETTE.slate).badge">{{ p.editName || p.id || 'Vendor' }}</span>
                      <select v-model="p.editBadgeColor" class="flex-1 bg-app-surface border border-app-border rounded-lg px-3 py-2 text-sm">
                        <option value="">Mặc định (xám)</option>
                        <option v-for="color in SELECTABLE_BADGE_COLORS" :key="color" :value="color">{{ color }}</option>
                      </select>
                    </div>
                  </div>
                  <div>
                    <label class="block text-xs font-medium text-app-text-sub mb-1">API Key</label>
                    <input type="text" v-model="p.editKey" placeholder="Để trống nếu không đổi..." class="w-full bg-app-surface border border-app-border rounded-lg px-3 py-2 text-sm font-mono" />
                  </div>
                  
                  <div class="flex items-center justify-between pt-2">
                    <button v-if="!p.isNew" @click="deleteProvider(p)" class="px-4 py-2 bg-rose-500/10 text-rose-500 hover:bg-rose-500/20 rounded-lg text-sm font-semibold">Xóa</button>
                    <div v-else></div>
                    <div class="flex gap-2">
                      <button @click="cancelEditProvider(p)" class="px-4 py-2 bg-app-surface border border-app-border text-app-text-base rounded-lg text-sm font-semibold hover:bg-app-surface-hover">Hủy</button>
                      <button @click="saveProvider(p)" class="px-4 py-2 bg-app-accent text-white rounded-lg text-sm font-semibold hover:bg-app-accent-hover shadow-accent">Lưu</button>
                    </div>
                  </div>
                </div>
              </div>
              
              <button @click="addProvider" class="w-full py-3 mt-2 border-2 border-dashed border-app-border rounded-xl text-app-text-sub hover:text-app-accent hover:border-app-accent/50 font-semibold text-sm transition-colors flex items-center justify-center gap-2">
                <Plus class="w-5 h-5" /> Thêm nhà cung cấp mới
              </button>
            </div>
          </div>
        </div>

      </div>
    </template>
  </div>
</template>
