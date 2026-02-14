<template>
  <div class="fixed top-24 lg:top-16 left-0 right-0 h-3 bg-black/30 z-40 relative">
    <div
      class="h-full transition-all duration-300"
      :style="{ width: progressPercent + '%', background: progressColor }"
    ></div>
    <div
      v-if="label"
      class="absolute inset-0 flex items-center justify-center text-[10px] font-semibold text-white/90 drop-shadow"
    >
      {{ label }}
    </div>
  </div>
</template>

<script setup>
defineProps({
  progressPercent: Number,
  progressColor: String,
  label: String
})
</script>
