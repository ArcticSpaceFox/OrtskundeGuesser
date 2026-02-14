<template>
  <header class="fixed top-0 left-0 right-0 h-24 lg:h-16 bg-gray-900/95 z-50 px-2 py-1">
    <div class="h-full flex flex-col justify-between lg:hidden">
      <div class="flex items-center justify-between text-white gap-2">
        <div class="text-xs sm:text-sm">
          <div class="font-semibold">Runde</div>
          <div class="text-[11px] sm:text-xs">{{ roundsPlayed }} / {{ totalRounds }}</div>
        </div>
        <div class="text-xs sm:text-sm">
          <div class="font-semibold">Punkte</div>
          <div class="text-[11px] sm:text-xs"><strong>{{ totalScore }}</strong> / {{ maxScore }}</div>
        </div>
        <div class="flex items-center gap-2">
          <button
            v-if="!showAnswer"
            @click="$emit('skip-round')"
            class="px-2 py-1.5 sm:px-3 sm:py-2 bg-gray-700 hover:bg-gray-600 text-white rounded text-[11px] sm:text-xs lg:text-sm font-medium"
          >
            Runde überspringen
          </button>
          <button
            @click="$emit('give-up')"
            class="px-2 py-1.5 sm:px-3 sm:py-2 bg-red-600 hover:bg-red-700 text-white rounded text-[11px] sm:text-xs lg:text-sm font-medium"
          >
            Aufgeben
          </button>
        </div>
      </div>

      <div class="flex-1 text-center mt-1">
        <div v-if="challenge" class="text-white leading-tight">
          <div class="text-[11px] sm:text-xs text-gray-300">Finde</div>
          <div class="text-sm sm:text-base lg:text-lg font-extrabold tracking-tight truncate px-1">{{ challenge.street }} <span v-if="challenge.housenumber">{{ challenge.housenumber }}</span></div>
          <div class="text-[11px] sm:text-xs lg:text-sm text-gray-300 truncate px-1">
            <span>{{ centerCity }}</span>
            <span v-if="challenge.suburb">, {{ challenge.suburb }}</span>
            <span v-if="getTypeLabel(challenge.type)" class="ml-1 sm:ml-2 text-blue-300">{{ getTypeLabel(challenge.type) }}</span>
          </div>
        </div>
      </div>
    </div>

    <div class="hidden lg:flex h-full items-center justify-between">
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

      <div class="flex-1 text-center px-2">
        <div v-if="challenge" class="text-white leading-tight">
          <div class="text-xs text-gray-300">Finde</div>
          <div class="text-lg font-extrabold tracking-tight truncate">{{ challenge.street }} <span v-if="challenge.housenumber">{{ challenge.housenumber }}</span></div>
          <div class="text-sm text-gray-300 truncate">
            <span>{{ centerCity }}</span>
            <span v-if="challenge.suburb">, {{ challenge.suburb }}</span>
            <span v-if="getTypeLabel(challenge.type)" class="ml-2 text-blue-300">{{ getTypeLabel(challenge.type) }}</span>
          </div>
        </div>
      </div>

      <div class="flex items-center gap-3 w-1/4 justify-end pr-2">
        <button
          v-if="!showAnswer"
          @click="$emit('skip-round')"
          class="px-3 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded text-sm font-medium"
        >
          Runde überspringen
        </button>
        <button
          @click="$emit('give-up')"
          class="px-3 py-2 bg-red-600 hover:bg-red-700 text-white rounded text-sm font-medium"
        >
          Aufgeben
        </button>
      </div>
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

defineEmits(['new-challenge', 'give-up', 'skip-round'])
</script>
