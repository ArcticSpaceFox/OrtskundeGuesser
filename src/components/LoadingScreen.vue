<template>
  <div class="h-screen w-screen bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center p-6">
    <div class="bg-white rounded-lg shadow-lg p-6 max-w-lg w-full">
      <h2 class="text-2xl font-bold mb-2">Lade Spiel-Daten</h2>
      <p class="text-sm text-gray-600 mb-4">Vorbereitung... bitte warten</p>
      
      <p class="text-gray-300 text-xs mt-1">Gerade wenn man die Einstellungen ändert, kann das Laden etwas länger dauern. Bitte haben Sie etwas Geduld.</p>

      <div class="w-full bg-gray-200 rounded h-4 overflow-hidden mb-3">
        <div :style="{ width: percent + '%' , background: color }" class="h-full transition-all"></div>
      </div>

      <div class="text-sm text-gray-700 mb-2">{{ status }}</div>

      <div class="flex justify-end mt-4">
        <button @click="$emit('cancel')" class="px-3 py-2 bg-gray-100 rounded">Abbrechen</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { defineProps } from 'vue'

const props = defineProps({ status: String, percent: Number, color: String })
</script>
