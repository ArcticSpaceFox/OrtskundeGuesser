<template>
  <div class="h-screen w-screen overflow-hidden bg-gray-100">
    <TopBar
      :challenge="challenge"
      :center-city="centerCity"
      :total-score="totalScore"
      :rounds-played="roundsPlayed"
      :rounds-counted="roundsCounted"
      :last-points="lastPoints"
      @new-challenge="newChallenge"
      @open-settings="showSettings = true"
    />

    <ProgressBar
      :progress-percent="progressPercent"
      :progress-color="progressColor"
    />

    <GameMap
      ref="mapRef"
      :center="center"
      :radius-k-m="radiusKm.value"
      @click="handleMapClick"
    />

    <BottomInfo
      :message="message"
      :distance-k-m="distanceKm"
    />

    <SettingsPanel
      :is-open="showSettings"
      :city="centerCity"
      :radius="radiusKm"
      :show-addresses="showAddresses"
      :show-nursing-homes="showNursingHomes"
      :show-villages="showVillages"
      @close="showSettings = false"
      @apply="applySettings"
      @reset-score="gameStore.resetScore()"
      @reset-all="resetAllCaches"
    />
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import axios from 'axios'
import { useGameStore } from '../stores/gameStore'
import { storeToRefs } from 'pinia'
import TopBar from './TopBar.vue'
import ProgressBar from './ProgressBar.vue'
import GameMap from './GameMap.vue'
import BottomInfo from './BottomInfo.vue'
import SettingsPanel from './SettingsPanel.vue'

const gameStore = useGameStore()
const { challenge, totalScore, roundsPlayed, roundsCounted, lastPoints, message, distanceKm, progressPercent, progressColor, showAddresses, showNursingHomes, showVillages, showSettings } = storeToRefs(gameStore)
gameStore.init()

const mapRef = ref(null)
const centerCity = ref('Güstrow')
const radiusKm = ref(10)
const center = ref({ lat: 53.7921, lon: 12.2001 })

// Cache helpers
const GEOCODE_TTL = 24 * 60 * 60 * 1000
const OVERPASS_TTL = 6 * 60 * 60 * 1000

function cacheGet(key) {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed.ts || !parsed.ttl) return null
    if (Date.now() - parsed.ts > parsed.ttl) {
      localStorage.removeItem(key)
      return null
    }
    return parsed.data
  } catch (e) {
    return null
  }
}

function cacheSet(key, data, ttl) {
  try {
    const payload = { ts: Date.now(), ttl, data }
    localStorage.setItem(key, JSON.stringify(payload))
  } catch (e) {}
}

function overpassCacheKey(lat, lon, radiusMeters) {
  const rlat = Math.round(lat * 10000) / 10000
  const rlon = Math.round(lon * 10000) / 10000
  return `overpass:${rlat}:${rlon}:${Math.round(radiusMeters)}`
}

function addrPoolKey(cacheKey) {
  return `addrpool:${cacheKey}`
}

// Haversine distance
function haversine(lat1, lon1, lat2, lon2) {
  const toRad = deg => deg * Math.PI / 180
  const R = 6371
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

// Shuffle array
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    const tmp = arr[i]
    arr[i] = arr[j]
    arr[j] = tmp
  }
  return arr
}

// Build address queue
function buildAddressQueue(addresses) {
  const nursingHomes = addresses.filter(a => a.type === 'nursing_home')
  const villages = addresses.filter(a => a.type === 'village')
  const regularAddresses = addresses.filter(a => a.type === 'address')

  const shuffledNursingHomes = shuffle([...nursingHomes])
  const shuffledVillages = shuffle([...villages])
  const shuffledRegular = shuffle([...regularAddresses])

  const byStreet = {}
  shuffledRegular.forEach(a => {
    const s = (a.street || '').trim()
    if (!byStreet[s]) byStreet[s] = []
    byStreet[s].push(a)
  })

  const streets = Object.keys(byStreet)
  const lists = streets.map(s => shuffle([...byStreet[s]]))

  const streetQueue = []
  let added = true
  while (added) {
    added = false
    for (let i = 0; i < lists.length; i++) {
      if (lists[i].length) {
        streetQueue.push(lists[i].shift())
        added = true
      }
    }
  }

  const queue = []
  let nhIdx = 0
  let vIdx = 0
  for (let i = 0; i < streetQueue.length; i++) {
    if ((i + 1) % 5 === 0 && nhIdx < shuffledNursingHomes.length) {
      queue.push(shuffledNursingHomes[nhIdx])
      nhIdx++
    } else if ((i + 1) % 7 === 0 && vIdx < shuffledVillages.length) {
      queue.push(shuffledVillages[vIdx])
      vIdx++
    } else {
      queue.push(streetQueue[i])
    }
  }

  while (nhIdx < shuffledNursingHomes.length) {
    queue.push(shuffledNursingHomes[nhIdx])
    nhIdx++
  }
  while (vIdx < shuffledVillages.length) {
    queue.push(shuffledVillages[vIdx])
    vIdx++
  }

  return queue
}

// Geocode city
async function setCenter() {
  message.value = 'Geocoding stadt...'
  try {
    const cacheKey = `geocode:${centerCity.value.toLowerCase()}`
    let resData = cacheGet(cacheKey)
    if (!resData) {
      const res = await axios.get('https://nominatim.openstreetmap.org/search', {
        params: { q: centerCity.value, format: 'json', limit: 1 }
      })
      resData = res.data
      if (resData && resData[0]) cacheSet(cacheKey, resData, GEOCODE_TTL)
    }
    if (!resData || !resData[0]) {
      message.value = 'City not found'
      return
    }
    center.value.lat = parseFloat(resData[0].lat)
    center.value.lon = parseFloat(resData[0].lon)
    mapRef.value.setCenter(center.value.lat, center.value.lon)
    message.value = `Center set to ${resData[0].display_name}`
  } catch (err) {
    message.value = 'Geocode error'
  }
}

// New challenge
async function newChallenge() {
  message.value = 'Suche adressen...'
  if (!center.value.lat || !center.value.lon) {
    await setCenter()
  }

  const radiusMeters = Math.max(1000, Math.min(100000, Math.round(radiusKm.value * 1000)))
  const q = `[out:json][timeout:25];(node["addr:housenumber"]["addr:street"](around:${radiusMeters},${center.value.lat},${center.value.lon});way["addr:housenumber"]["addr:street"](around:${radiusMeters},${center.value.lat},${center.value.lon});relation["addr:housenumber"]["addr:street"](around:${radiusMeters},${center.value.lat},${center.value.lon});node["amenity"="nursing_home"]["name"](around:${radiusMeters},${center.value.lat},${center.value.lon});way["amenity"="nursing_home"]["name"](around:${radiusMeters},${center.value.lat},${center.value.lon});relation["amenity"="nursing_home"]["name"](around:${radiusMeters},${center.value.lat},${center.value.lon});node["place"="village"]["name"](around:${radiusMeters},${center.value.lat},${center.value.lon});way["place"="village"]["name"](around:${radiusMeters},${center.value.lat},${center.value.lon});relation["place"="village"]["name"](around:${radiusMeters},${center.value.lat},${center.value.lon}););out center 200;`

  try {
    const cacheKey = overpassCacheKey(center.value.lat, center.value.lon, radiusMeters)
    let els = cacheGet(cacheKey)
    if (!els) {
      const res = await axios.post('https://overpass-api.de/api/interpreter', q, {
        headers: { 'Content-Type': 'text/plain' }
      })
      els = (res.data && res.data.elements) || []
      if (els && els.length) cacheSet(cacheKey, els, OVERPASS_TTL)
    }

    const addresses = els
      .map((el, idx) => {
        const tags = el.tags || {}
        const street = tags['addr:street']
        const housenumber = tags['addr:housenumber']
        const name = tags['name']
        let lat = undefined,
          lon = undefined
        
        // prefer center if available and complete
        if (el.center && el.center.lat !== undefined && el.center.lon !== undefined) {
          lat = el.center.lat
          lon = el.center.lon
        } else if (el.lat !== undefined && el.lon !== undefined) {
          lat = el.lat
          lon = el.lon
        }
        
        // ensure lat and lon are valid numbers
        if (lat === undefined || lon === undefined || isNaN(lat) || isNaN(lon)) {
          return null
        }
        
        if (street && housenumber) {
          return { street, housenumber, lat, lon, type: 'address' }
        } else if (name && tags['amenity'] === 'nursing_home') {
          return { street: name, housenumber: '', lat, lon, type: 'nursing_home' }
        } else if (name && tags['place'] === 'village') {
          return { street: name, housenumber: '', lat, lon, type: 'village' }
        }
        return null
      })
      .filter(Boolean)
    console.log('Parsed addresses:', addresses.slice(0, 5))

    const filteredAddresses = addresses.filter(a => {
      if (a.type === 'address') return showAddresses.value
      if (a.type === 'nursing_home') return showNursingHomes.value
      if (a.type === 'village') return showVillages.value
      return false
    })

    if (!filteredAddresses.length) {
      message.value = 'Keine Adressen mit aktuellen Modi gefunden.'
      return
    }

    const poolKey = addrPoolKey(cacheKey)
    let pool = cacheGet(poolKey)
    if (!pool || !Array.isArray(pool.queue) || !pool.queue.length) {
      const queue = buildAddressQueue(filteredAddresses)
      pool = { queue, ptr: 0 }
      cacheSet(poolKey, pool, OVERPASS_TTL)
    }

    if (pool.ptr >= pool.queue.length) {
      pool = { queue: buildAddressQueue(filteredAddresses), ptr: 0 }
    }

    const pick = pool.queue[pool.ptr]
    pool.ptr = (pool.ptr || 0) + 1
    cacheSet(poolKey, pool, OVERPASS_TTL)

    gameStore.startNewChallenge(pick)
    mapRef.value.clearMarkers()
    console.log('Center value:', center.value)
    console.log('Calling zoomToRadius with:', center.value.lat, center.value.lon, 'radius:', radiusKm.value)
    if (mapRef.value && mapRef.value.zoomToRadius) {
      mapRef.value.zoomToRadius(center.value.lat, center.value.lon, radiusKm.value)
    } else {
      console.error('mapRef.value.zoomToRadius not available')
    }
  } catch (err) {
    message.value = 'Overpass query failed'
  }
}

// Handle map click
function handleMapClick(latlng) {
  if (!challenge.value) {
    message.value = 'Starte die Aufgabe.'
    return
  }
  if (gameStore.showAnswer) {
    message.value = 'Runde bereits beendet. Neue Adresse starten.'
    return
  }

  console.log('Challenge:', gameStore.challenge)
  console.log('Latlng:', latlng)

  const distance = haversine(
    latlng.lat,
    latlng.lng,
    challenge.value.lat,
    challenge.value.lon
  )

  // Convert to plain object to avoid Proxy issues
  const challengeObj = {
    lat: Number(challenge.value.lat),
    lon: Number(challenge.value.lon)
  }

  mapRef.value.showGuess(latlng, challengeObj, distance)

  gameStore.recordGuess(distance)
  if (distance <= 0.5) {
    message.value = `Du warst ${distance.toFixed(2)} km entfernt. Runde gezählt: +${gameStore.lastPoints} Punkte.`
  } else {
    message.value = `Du warst ${distance.toFixed(2)} km entfernt. Distanz > 0.5 km — Runde zählt nicht.`
  }
}

// Apply settings
function applySettings(settings) {
  centerCity.value = settings.city
  radiusKm.value = settings.radius
  showAddresses.value = settings.showAddresses
  showNursingHomes.value = settings.showNursingHomes
  showVillages.value = settings.showVillages
  showSettings.value = false
  setCenter()
}

// Reset all caches
function resetAllCaches() {
  try {
    Object.keys(localStorage).forEach(k => {
      if (k.startsWith('geocode:') || k.startsWith('overpass:') || k.startsWith('addrpool:')) {
        localStorage.removeItem(k)
      }
    })
  } catch (e) {}
  gameStore.resetScore()
}

// Initialize
onMounted(() => {
  setTimeout(() => setCenter(), 300)
  setTimeout(() => newChallenge(), 500)
})
</script>

<style scoped>
.game-container {
  font-family: system-ui, Avenir, Helvetica, Arial, sans-serif;
}
</style>
