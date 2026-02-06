<template>
  <div v-if="isOpen" class="fixed inset-0 bg-black/50 flex items-center justify-center z-[100]">
    <div class="bg-white rounded-lg p-5 min-w-80 max-w-2xl shadow-lg">
      <h3 class="text-lg font-bold mb-4">Einstellungen</h3>

      <div class="mb-4">
        <label class="block text-sm font-medium mb-1">Stadt</label>
        <input
          v-model="localCity"
          class="w-full px-3 py-2 border border-gray-300 rounded"
        />
      </div>

      <div class="mb-4">
        <label class="block text-sm font-medium mb-1">Radius (km)</label>
        <input
          v-model.number="localRadius"
          type="number"
          min="1"
          class="w-full px-3 py-2 border border-gray-300 rounded"
        />
      </div>

      <div class="mb-6">
        <h4 class="font-bold text-sm mb-3">Modi</h4>
        <div class="space-y-2">
          <label class="flex items-center gap-2">
            <input type="checkbox" v-model="localShowAddresses" />
            <span>Straßen & Adressen</span>
          </label>
          <label class="flex items-center gap-2">
            <input type="checkbox" v-model="localShowNursingHomes" />
            <span>Medizinische Einrichtungen</span>
          </label>
          <label class="flex items-center gap-2">
            <input type="checkbox" v-model="localShowVillages" />
            <span>Ortschaften</span>
          </label>
        </div>
      </div>

      <div class="flex gap-2 justify-end flex-wrap">
        <button
          @click="handleApply"
          class="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded font-medium text-sm"
        >
          Übernehmen
        </button>
        <button
          @click="$emit('close')"
          class="px-4 py-2 bg-gray-300 hover:bg-gray-400 text-black rounded font-medium text-sm"
        >
          Abbrechen
        </button>
        <button
          @click="$emit('restart')"
          class="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded font-medium text-sm"
        >
          Spiel neustarten
        </button>
        <button
          @click="$emit('reset-score')"
          class="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded font-medium text-sm text-xs"
        >
          Score Reset
        </button>
        <button
          @click="$emit('reset-all')"
          class="px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded font-medium text-sm text-xs"
        >
          Cache + Reset
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue'

const props = defineProps({
  isOpen: Boolean,
  city: String,
  radius: Number,
  showAddresses: Boolean,
  showNursingHomes: Boolean,
  showVillages: Boolean
})

const emit = defineEmits(['close', 'apply', 'reset-score', 'reset-all', 'restart'])

const localCity = ref(props.city)
const localRadius = ref(props.radius)
const localShowAddresses = ref(props.showAddresses)
const localShowNursingHomes = ref(props.showNursingHomes)
const localShowVillages = ref(props.showVillages)

watch(() => props.isOpen, (newVal) => {
  if (newVal) {
    localCity.value = props.city
    localRadius.value = props.radius
    localShowAddresses.value = props.showAddresses
    localShowNursingHomes.value = props.showNursingHomes
    localShowVillages.value = props.showVillages
  }
})

function handleApply() {
  emit('apply', {
    city: localCity.value,
    radius: localRadius.value,
    showAddresses: localShowAddresses.value,
    showNursingHomes: localShowNursingHomes.value,
    showVillages: localShowVillages.value
  })
}
</script>
