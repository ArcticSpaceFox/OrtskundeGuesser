<template>
  <header class="fixed top-0 left-0 right-0 h-16 bg-gray-900/95 flex items-center justify-between z-50 px-3 py-1">
    <div class="flex gap-3 items-center flex-1 max-w-4xl">
      <button
        @click="$emit('new-challenge')"
        class="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm font-medium"
      >
        Neue Adresse
      </button>
      <div v-if="challenge" class="text-white text-sm">
        <strong>Finde:</strong>&nbsp;{{ centerCity }},
        <span v-if="challenge.type === 'nursing_home' || challenge.type === 'village'">
          {{ challenge.street }}
        </span>
        <span v-else>{{ challenge.street }} {{ challenge.housenumber }}</span>
      </div>
    </div>

    <div class="flex items-center gap-3">
      <div class="text-white text-sm text-right">
        <div>Score: <strong>{{ totalScore }}</strong></div>
        <div class="text-xs">Gezählte Runden: {{ roundsCounted }} / Gespielt: {{ roundsPlayed }}</div>
        <div v-if="lastPoints !== null" class="text-xs">
          Letzte Punkte:
          <strong v-if="lastPoints > 0" class="text-green-400">+{{ lastPoints }}</strong>
          <strong v-else class="text-red-400">{{ lastPoints }}</strong>
        </div>
      </div>
      <button
        @click="$emit('open-settings')"
        class="text-xl hover:scale-110 transition"
      >
        ⚙️
      </button>
    </div>
  </header>
</template>

<script setup>
defineProps({
  challenge: Object,
  centerCity: String,
  totalScore: Number,
  roundsPlayed: Number,
  roundsCounted: Number,
  lastPoints: [Number, null]
})

defineEmits(['new-challenge', 'open-settings'])
</script>
