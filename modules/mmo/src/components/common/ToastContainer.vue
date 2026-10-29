<script setup lang="ts">
import { useToastStore } from '@/stores/toast.store';
import { CheckCircle2, AlertCircle, AlertTriangle, Info, X } from 'lucide-vue-next';

const toastStore = useToastStore();
</script>

<template>
  <div class="fixed bottom-6 right-4 left-4 sm:left-1/2 sm:-translate-x-1/2 sm:w-96 sm:right-auto z-50 flex flex-col-reverse gap-2 pointer-events-none pb-safe-bottom">
    <transition-group
      enter-active-class="transform ease-out duration-300 transition"
      enter-from-class="translate-y-4 opacity-0 scale-95"
      enter-to-class="translate-y-0 opacity-100 scale-100"
      leave-active-class="transition ease-in duration-200"
      leave-from-class="opacity-100 scale-100"
      leave-to-class="opacity-0 scale-90 translate-y-2"
    >
      <div
        v-for="item in toastStore.toasts"
        :key="item.id"
        class="pointer-events-auto flex items-center gap-3 p-3.5 rounded-app shadow-surface border text-sm font-medium backdrop-blur-md transition-all"
        :class="{
          'bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400': item.type === 'success',
          'bg-rose-500/10 border-rose-500/30 text-rose-600 dark:text-rose-400': item.type === 'error',
          'bg-amber-500/10 border-amber-500/30 text-amber-600 dark:text-amber-400': item.type === 'warning',
          'bg-sky-500/10 border-sky-500/30 text-sky-600 dark:text-sky-400': item.type === 'info',
        }"
      >
        <CheckCircle2 v-if="item.type === 'success'" class="w-5 h-5 shrink-0" />
        <AlertCircle v-else-if="item.type === 'error'" class="w-5 h-5 shrink-0" />
        <AlertTriangle v-else-if="item.type === 'warning'" class="w-5 h-5 shrink-0" />
        <Info v-else class="w-5 h-5 shrink-0" />

        <div class="flex-1 text-xs sm:text-sm break-words leading-snug">
          {{ item.message }}
        </div>

        <button
          @click="toastStore.remove(item.id)"
          class="p-1 rounded-md opacity-70 hover:opacity-100 transition-opacity"
        >
          <X class="w-4 h-4" />
        </button>
      </div>
    </transition-group>
  </div>
</template>

