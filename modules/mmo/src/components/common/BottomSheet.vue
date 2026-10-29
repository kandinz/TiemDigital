<script setup lang="ts">
defineProps<{
  isOpen: boolean;
  title?: string;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
}>();
</script>

<template>
  <teleport to="body">
    <transition
      enter-active-class="transition duration-200 ease-out"
      enter-from-class="opacity-0"
      enter-to-class="opacity-100"
      leave-active-class="transition duration-150 ease-in"
      leave-from-class="opacity-100"
      leave-to-class="opacity-0"
    >
      <div
        v-if="isOpen"
        class="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex flex-col justify-end p-2.5 sm:p-4 pb-[calc(env(safe-area-inset-bottom)+14px)]"
        @click="emit('close')"
      >
        <transition
          enter-active-class="transform transition ease-out duration-300"
          enter-from-class="translate-y-6 opacity-0"
          enter-to-class="translate-y-0 opacity-100"
          leave-active-class="transform transition ease-in duration-200"
          leave-from-class="translate-y-0 opacity-100"
          leave-to-class="translate-y-6 opacity-0"
        >
          <div
            v-if="isOpen"
            class="bg-app-surface w-full max-w-lg mx-auto max-h-[94vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden border border-app-border"
            @click.stop
          >
            <!-- Handle bar -->
            <div class="pt-3 pb-2 flex justify-center cursor-pointer shrink-0" @click="emit('close')">
              <div class="w-12 h-1.5 rounded-full bg-app-border"></div>
            </div>

            <!-- Header -->
            <div v-if="$slots.header || title" class="px-4 sm:px-5 pb-3 border-b border-app-border shrink-0">
              <slot name="header" :close="() => emit('close')">
                <div class="flex items-center justify-between">
                  <h3 class="font-bold text-base text-app-text">{{ title }}</h3>
                  <button
                    class="text-app-text-sub hover:text-app-text p-1 rounded-full touch-active"
                    @click="emit('close')"
                  >
                    ✕
                  </button>
                </div>
              </slot>
            </div>

            <!-- Content -->
            <div class="p-4 overflow-y-auto flex-1">
              <slot />
            </div>

            <!-- Footer (Fixed / Sticky) -->
            <div v-if="$slots.footer" class="p-4 border-t border-app-border bg-app-surface shrink-0">
              <slot name="footer" />
            </div>
          </div>
        </transition>
      </div>
    </transition>
  </teleport>
</template>

