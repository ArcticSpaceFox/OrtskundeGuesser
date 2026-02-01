<template>
  <div class="fixed top-16 left-0 right-0 h-3 bg-black/10 z-40">
    <div
      class="h-full transition-all duration-300"
      :style="{ width: progressPercent + '%', background: progressColor }"
    ></div>
  </div>
</template>

<script setup>
defineProps({
  progressPercent: Number,
  progressColor: String
})
</script>
