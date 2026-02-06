<template>
  <div class="h-screen w-screen bg-gradient-to-br from-green-600 to-green-800 flex items-center justify-center p-4">
    <div class="bg-white rounded-lg shadow-2xl p-8 max-w-lg w-full text-center">
      <h1 class="text-4xl font-bold mb-2 text-green-600">Glückwunsch!</h1>
      <p class="text-gray-600 mb-8">Spiel beendet</p>

      <div class="bg-green-50 rounded p-8 mb-8 border-l-4 border-green-600">
        <div class="text-6xl font-bold text-green-600 mb-4">{{ totalScore }}</div>
        <div class="text-xl text-gray-700 mb-4">Punkte</div>
        <div class="text-sm text-gray-600 space-y-2">
          <div>Runden gespielt: <span class="font-bold">{{ roundsPlayed }}</span></div>
          <div>Erfolgsquote: <span class="font-bold">{{ successRate }}%</span></div>
        </div>
      </div>

      <div class="mb-6 p-4 bg-gray-100 rounded">
        <div class="text-sm text-gray-600 mb-2">Durchschnitt pro Runde</div>
        <div class="text-3xl font-bold text-gray-800">{{ averageScore }}</div>
      </div>

      <button
        @click="$emit('restart')"
        class="w-full px-6 py-3 bg-green-600 hover:bg-green-700 text-white rounded font-bold text-lg mb-3 transition-colors"
      >
        Neues Spiel
      </button>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  totalScore: Number,
  roundsPlayed: Number
})

const emit = defineEmits(['restart'])

const averageScore = computed(() => {
  if (!props.roundsPlayed) return 0
  return Math.round(props.totalScore / props.roundsPlayed)
})

const successRate = computed(() => {
  if (!props.roundsPlayed) return 0
  return Math.round((props.totalScore / (props.roundsPlayed * 100)) * 100)
})
</script>
