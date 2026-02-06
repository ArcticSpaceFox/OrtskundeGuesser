<template>
  <div class="h-screen w-screen bg-white flex flex-col p-4">
    <div class="flex items-center justify-between mb-4">
      <h2 class="text-2xl font-bold">Updates</h2>
      <div>
        <button @click="$emit('close')" class="px-3 py-2 bg-gray-200 rounded">Schließen</button>
      </div>
    </div>

    <div class="overflow-auto flex-1">
      <ul class="space-y-3">
        <li v-for="item in updates" :key="item.hash" class="p-3 border rounded">
          <div class="text-sm text-gray-500">{{ item.date }} • {{ item.hash }}</div>
          <div class="mt-1 font-medium">{{ item.message }}</div>
        </li>
      </ul>
      <div v-if="!updates.length" class="text-gray-500">Keine Updates gefunden.</div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'

const updates = ref([])

onMounted(async () => {
  try {
    const res = await fetch('/updates.json')
    if (res.ok) updates.value = await res.json()
  } catch (e) {}
})

</script>
