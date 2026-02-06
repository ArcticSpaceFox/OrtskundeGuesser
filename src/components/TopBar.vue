<template>
  <header class="fixed top-0 left-0 right-0 h-16 bg-gray-900/95 flex items-center justify-between z-50 px-3 py-1">
    <!-- Left: round & score -->
    <div class="flex items-center gap-3 w-1/4 text-white pl-2">
      <div class="text-sm">
        <div class="font-semibold">Runde</div>
        <div class="text-xs">{{ roundsPlayed }} / {{ totalRounds }}</div>
      </div>
      <div class="ml-3 text-sm">
        <div class="font-semibold">Punkte</div>
        <div class="text-xs"><strong>{{ totalScore }}</strong> / {{ maxScore }}</div>
      </div>
    </div>

    <!-- Center: highlighted challenge -->
    <div class="flex-1 text-center">
      <div v-if="challenge" class="text-white">
        <div class="text-xs text-gray-300">Finde</div>
        <div class="text-lg font-extrabold tracking-tight">{{ challenge.street }} <span v-if="challenge.housenumber">{{ challenge.housenumber }}</span></div>
        <div class="text-sm text-gray-300">
          <span>{{ centerCity }}</span>
          <span v-if="challenge.suburb">, {{ challenge.suburb }}</span>
          <span v-if="getTypeLabel(challenge.type)" class="ml-2 text-blue-300">{{ getTypeLabel(challenge.type) }}</span>
        </div>
        <!-- next-round countdown shown in ProgressBar now -->
      </div>
    </div>

    <!-- Right: skip + settings -->
    <div class="flex items-center gap-3 w-1/4 justify-end pr-2">
      <button
        v-if="!showAnswer"
        @click="$emit('skip-round')"
        class="px-3 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded text-sm font-medium"
      >
        Runde überspringen
      </button>
      <button
        @click="$emit('open-settings')"
        class="text-xl hover:scale-110 transition ml-2"
      >
        ⚙️
      </button>
    </div>
  </header>
</template>

<script setup>
const typeLabels = {
  address: '',
  hospital: 'Krankenhaus',
  clinic: 'Klinik',
  doctors: 'Arzt/Praxis',
  nursing_home: 'Pflegeheim',
  social_facility: 'Sozialeinrichtung',
  village: ''
}

function getTypeLabel(type) {
  return typeLabels[type] || ''
}

defineProps({
  challenge: Object,
  centerCity: String,
  totalScore: Number,
  roundsPlayed: Number,
  roundsCounted: Number,
  lastPoints: [Number, null],
  totalRounds: Number,
  maxScore: Number
  ,showAnswer: Boolean
})

defineEmits(['new-challenge', 'open-settings', 'skip-round'])
</script>
