<template>
  <div class="fixed left-3 bottom-3 bg-black/60 text-white px-2.5 py-2 rounded text-sm z-40">
    <div v-if="message">{{ message }}</div>
    <div v-if="distanceKm !== null && distanceKm !== undefined">Distanz: {{ (Number(distanceKm) * 1000).toFixed(0) }} m</div>
  </div>
</template>

<script setup>
defineProps({
  message: String,
  distanceKm: [Number, null]
})
</script>
