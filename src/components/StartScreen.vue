<template>
  <div class="h-screen w-screen bg-gradient-to-br from-blue-600 to-blue-800 flex items-center justify-center p-4">
    <div class="bg-white rounded-lg shadow-2xl p-8 max-w-md w-full">
      <h1 class="text-4xl font-bold text-center mb-2 text-blue-600">Ortskunde</h1>
      <p class="text-center text-gray-600 mb-8">Guesser</p>

      <div class="bg-blue-50 rounded p-4 mb-6 border-l-4 border-blue-600">
        <h2 class="font-bold text-lg mb-4">Spieleinstellungen</h2>

        <div class="mb-4">
          <label class="block text-sm font-medium mb-2">Stadt</label>
          <input
            v-model="localCity"
            class="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="z.B. Güstrow"
          />
        </div>

        <div class="mb-4">
          <label class="block text-sm font-medium mb-2">Radius (km)</label>
          <input
            v-model.number="localRadius"
            type="number"
            min="1"
            max="50"
            class="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <h3 class="font-bold text-sm mb-3">Modi</h3>
        <div class="space-y-2 mb-4">
          <label class="flex items-center gap-2">
            <input type="checkbox" v-model="localShowAddresses" class="w-4 h-4" />
            <span class="text-sm">Straßen & Adressen</span>
          </label>
          <label class="flex items-center gap-2">
            <input type="checkbox" v-model="localShowNursingHomes" class="w-4 h-4" />
            <span class="text-sm">Medizinische Einrichtungen</span>
          </label>
          <label class="flex items-center gap-2">
            <input type="checkbox" v-model="localShowVillages" class="w-4 h-4" />
            <span class="text-sm">Ortschaften</span>
          </label>
        </div>
      </div>

      <button
        @click="startGame"
        class="w-full px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded font-bold text-lg mb-3 transition-colors"
      >
        Spiel starten
      </button>
          <button
            @click="$emit('open-updates')"
            class="fixed bottom-6 right-6 px-4 py-2 bg-white/90 text-sm rounded shadow-lg"
          >
            Updates
          </button>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'

const props = defineProps({
  city: String,
  radius: Number,
  showAddresses: Boolean,
  showNursingHomes: Boolean,
  showVillages: Boolean
})

const emit = defineEmits(['start-game'])

const localCity = ref(props.city)
const localRadius = ref(props.radius)
const localShowAddresses = ref(props.showAddresses)
const localShowNursingHomes = ref(props.showNursingHomes)
const localShowVillages = ref(props.showVillages)

function startGame() {
  emit('start-game', {
    city: localCity.value,
    radius: localRadius.value,
    showAddresses: localShowAddresses.value,
    showNursingHomes: localShowNursingHomes.value,
    showVillages: localShowVillages.value
  })
}
</script>
