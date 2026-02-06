<template>
  <div class="h-screen w-screen overflow-hidden bg-gray-100">
    <!-- Start Screen -->
    <StartScreen
      v-if="gamePhase === 'start'"
      :city="centerCity"
      :radius="radiusKm"
      :show-addresses="showAddresses"
      :show-nursing-homes="showNursingHomes"
      :show-villages="showVillages"
      @start-game="handleStartGame"
    />

    <!-- Game Screen -->
    <template v-else-if="gamePhase === 'playing'">
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
        :progress-percent="timerPercent"
        :progress-color="timerColor"
        :label="timerLabel"
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
        @restart="restartGame"
      />
    </template>

    <!-- End Screen -->
    <EndScreen
      v-else-if="gamePhase === 'end'"
      :total-score="totalScore"
      :rounds-played="roundsPlayed"
      @restart="handleRestart"
    />
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, computed } from 'vue'
import axios from 'axios'
import { useGameStore } from '../stores/gameStore'
import { storeToRefs } from 'pinia'
import TopBar from './TopBar.vue'
import ProgressBar from './ProgressBar.vue'
import GameMap from './GameMap.vue'
import BottomInfo from './BottomInfo.vue'
import SettingsPanel from './SettingsPanel.vue'
import StartScreen from './StartScreen.vue'
import EndScreen from './EndScreen.vue'

const gameStore = useGameStore()
const { challenge, totalScore, roundsPlayed, roundsCounted, lastPoints, message, distanceKm, progressPercent, progressColor, showAddresses, showNursingHomes, showVillages, showSettings, gamePhase } = storeToRefs(gameStore)
gameStore.init()

const mapRef = ref(null)
// Round timer (30s)
const timerRemaining = ref(30)
let timerId = null

function clearRoundTimer() {
  if (timerId) {
    clearInterval(timerId)
    timerId = null
  }
}

function startRoundTimer() {
  clearRoundTimer()
  timerRemaining.value = 30
  timerId = setInterval(() => {
    if (timerRemaining.value > 0) {
      timerRemaining.value -= 1
    }
    if (timerRemaining.value <= 0) {
      clearRoundTimer()
      message.value = 'Zeit abgelaufen.'
      try {
        gameStore.recordGuess(999)
      } catch (e) {}
      if (roundsPlayed.value >= gameStore.totalRounds) {
        setTimeout(() => {
          gamePhase.value = 'end'
        }, 1200)
      }
    }
  }, 1000)
}

onUnmounted(() => clearRoundTimer())
// Timer-derived computed values for the progress bar
const TOTAL_SECONDS = 30
const timerPercent = computed(() => {
  return Math.max(0, Math.min(100, (timerRemaining.value / TOTAL_SECONDS) * 100))
})

const timerColor = computed(() => {
  if (timerRemaining.value <= 10) return '#dc2626' // red
  return '#3b82f6' // blue-500
})

const timerLabel = computed(() => `${timerRemaining.value}s`)
const centerCity = ref('Güstrow')
const radiusKm = ref(10)
const center = ref({ lat: 53.7921, lon: 12.2001 })

// Cache helpers
const GEOCODE_TTL = 24 * 60 * 60 * 1000
const OVERPASS_TTL = 6 * 60 * 60 * 1000
const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.nchc.org.tw/api/interpreter'
]

let overpassInFlight = false
let lastOverpassRequestAt = 0

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

function addrPoolKey(cacheKey, showAddr, showMedical, showVillage) {
  const modes = [showAddr ? 1 : 0, showMedical ? 1 : 0, showVillage ? 1 : 0].join('')
  return `addrpool:${cacheKey}:${modes}`
}

async function fetchOverpassWithRetry(query) {
  const now = Date.now()
  const minDelay = 1200
  const sinceLast = now - lastOverpassRequestAt
  if (sinceLast < minDelay) {
    await new Promise(r => setTimeout(r, minDelay - sinceLast))
  }

  let lastError = null
  for (let attempt = 0; attempt < 3; attempt++) {
    const endpoint = OVERPASS_ENDPOINTS[attempt % OVERPASS_ENDPOINTS.length]
    try {
      lastOverpassRequestAt = Date.now()
      const res = await axios.post(endpoint, query, {
        headers: { 'Content-Type': 'text/plain' }
      })
      return res
    } catch (err) {
      lastError = err
      const status = err?.response?.status
      if (status === 429 || status === 504 || status === 502) {
        const backoff = 1200 * Math.pow(2, attempt)
        await new Promise(r => setTimeout(r, backoff))
        continue
      }
      break
    }
  }
  throw lastError
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

// Check if type is medical facility
function isMedicalFacility(type) {
  return ['hospital', 'clinic', 'doctors', 'nursing_home', 'social_facility'].includes(type)
}

// Build address queue
function buildAddressQueue(addresses) {
  const medicalFacilities = addresses.filter(a => isMedicalFacility(a.type))
  const villages = addresses.filter(a => a.type === 'village')
  const regularAddresses = addresses.filter(a => a.type === 'address')

  const shuffledMedical = shuffle([...medicalFacilities])
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
  let medIdx = 0
  let vIdx = 0
  for (let i = 0; i < streetQueue.length; i++) {
    if ((i + 1) % 5 === 0 && medIdx < shuffledMedical.length) {
      queue.push(shuffledMedical[medIdx])
      medIdx++
    } else if ((i + 1) % 7 === 0 && vIdx < shuffledVillages.length) {
      queue.push(shuffledVillages[vIdx])
      vIdx++
    } else {
      queue.push(streetQueue[i])
    }
  }

  while (medIdx < shuffledMedical.length) {
    queue.push(shuffledMedical[medIdx])
    medIdx++
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
  if (overpassInFlight) {
    message.value = 'Bitte warten...'
    return
  }
  message.value = 'Suche adressen...'
  if (!center.value.lat || !center.value.lon) {
    await setCenter()
  }

  const radiusMeters = Math.max(1000, Math.min(100000, Math.round(radiusKm.value * 1000)))

  const qAddresses = `
  [out:json][timeout:25];
  (
    node["addr:housenumber"]["addr:street"](around:${radiusMeters},${center.value.lat},${center.value.lon});
    way["addr:housenumber"]["addr:street"](around:${radiusMeters},${center.value.lat},${center.value.lon});
    relation["addr:housenumber"]["addr:street"](around:${radiusMeters},${center.value.lat},${center.value.lon});
  );
  out tags center 800;
  `

  const qMedical = `
  [out:json][timeout:25];
  (
    node["amenity"="hospital"](around:${radiusMeters},${center.value.lat},${center.value.lon});
    way["amenity"="hospital"](around:${radiusMeters},${center.value.lat},${center.value.lon});
    relation["amenity"="hospital"](around:${radiusMeters},${center.value.lat},${center.value.lon});

    node["amenity"="clinic"](around:${radiusMeters},${center.value.lat},${center.value.lon});
    way["amenity"="clinic"](around:${radiusMeters},${center.value.lat},${center.value.lon});
    relation["amenity"="clinic"](around:${radiusMeters},${center.value.lat},${center.value.lon});

    node["amenity"="doctors"](around:${radiusMeters},${center.value.lat},${center.value.lon});
    way["amenity"="doctors"](around:${radiusMeters},${center.value.lat},${center.value.lon});
    relation["amenity"="doctors"](around:${radiusMeters},${center.value.lat},${center.value.lon});

    node["amenity"="nursing_home"](around:${radiusMeters},${center.value.lat},${center.value.lon});
    way["amenity"="nursing_home"](around:${radiusMeters},${center.value.lat},${center.value.lon});
    relation["amenity"="nursing_home"](around:${radiusMeters},${center.value.lat},${center.value.lon});

    node["amenity"="social_facility"](around:${radiusMeters},${center.value.lat},${center.value.lon});
    way["amenity"="social_facility"](around:${radiusMeters},${center.value.lat},${center.value.lon});
    relation["amenity"="social_facility"](around:${radiusMeters},${center.value.lat},${center.value.lon});
  );
  out tags center 400;
  `

  const qPlaces = `
  [out:json][timeout:60];
  area["name"="${centerCity.value}"]["boundary"="administrative"]["admin_level"="8"]->.a;
  (
    node(area.a)["place"~"village|hamlet|suburb|neighbourhood"]["name"];
    way(area.a)["place"~"village|hamlet|suburb|neighbourhood"]["name"];
    relation(area.a)["place"~"village|hamlet|suburb|neighbourhood"]["name"];

    // Ortsteile / administrative Untergliederungen
    relation(area.a)["boundary"="administrative"]["admin_level"~"9|10"]["name"];
    way(area.a)["boundary"="administrative"]["admin_level"~"9|10"]["name"];
  );
  out tags center;
  `

  try {
    overpassInFlight = true
    const cacheKey = overpassCacheKey(center.value.lat, center.value.lon, radiusMeters)
    let els = []

    if (showAddresses.value) {
      const addrKey = `${cacheKey}:addr`
      let addrEls = cacheGet(addrKey)
      if (!addrEls) {
        const res = await fetchOverpassWithRetry(qAddresses)
        addrEls = (res.data && res.data.elements) || []
        if (addrEls && addrEls.length) cacheSet(addrKey, addrEls, OVERPASS_TTL)
      }
      els = els.concat(addrEls || [])
    }

    if (showNursingHomes.value) {
      const medKey = `${cacheKey}:med`
      let medEls = cacheGet(medKey)
      if (!medEls) {
        const res = await fetchOverpassWithRetry(qMedical)
        medEls = (res.data && res.data.elements) || []
        if (medEls && medEls.length) cacheSet(medKey, medEls, OVERPASS_TTL)
      }
      els = els.concat(medEls || [])
    }

    if (showVillages.value) {
      const placeKey = `${cacheKey}:place`
      let placeEls = cacheGet(placeKey)
      if (!placeEls) {
        const res = await fetchOverpassWithRetry(qPlaces)
        placeEls = (res.data && res.data.elements) || []
        if (placeEls && placeEls.length) cacheSet(placeKey, placeEls, OVERPASS_TTL)
      }
      els = els.concat(placeEls || [])
    }

    const addresses = []
    
    // Process addresses sequentially to avoid overwhelming the API
    for (const el of els) {
      const tags = el.tags || {}
      const street = tags['addr:street']
      const housenumber = tags['addr:housenumber']
      const name = tags['name']
      const operator = tags['operator']
      const brand = tags['brand']
      const suburbTag = tags['suburb'] || tags['addr:suburb'] || ''
      
      // Extract label: prefer name, then operator, then brand
      const label = name || operator || brand
      // Medical label should be built from name + operator only
      const medicalLabel = name ? (operator ? `${name} – ${operator}` : name) : (operator || '')
      
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
        continue
      }
      
      // Regular street address
      if (street && housenumber) {
        addresses.push({ street, housenumber, suburb: suburbTag, label: '', lat, lon, type: 'address' })
        continue
      }
      
      // Medical facilities: keep amenity type separate
      const amenity = tags['amenity']
      if (medicalLabel && ['hospital', 'clinic', 'doctors', 'nursing_home', 'social_facility'].includes(amenity)) {
        // Add address info to housenumber for deduplication
        let addressSuffix = ''
        if (street && housenumber) {
          addressSuffix = `, ${street} ${housenumber}`
        } else if (street) {
          addressSuffix = `, ${street}`
        }
        addresses.push({ street: medicalLabel, housenumber: addressSuffix, suburb: '', label: medicalLabel, lat, lon, type: amenity })
        continue
      }
      
      // Village/settlement (village, hamlet, suburb, neighbourhood, locality)
      const placeType = tags['place']
      if (label && ['village', 'hamlet', 'suburb', 'neighbourhood', 'locality'].includes(placeType)) {
        addresses.push({ street: label, housenumber: '', suburb: '', label, lat, lon, type: 'village' })
        continue
      }
    }
    console.log('Parsed addresses:', addresses.slice(0, 5))

    const filteredAddresses = addresses.filter(a => {
      if (a.type === 'address') return showAddresses.value
      if (isMedicalFacility(a.type)) return showNursingHomes.value
      if (a.type === 'village') return showVillages.value
      return false
    })

    if (!filteredAddresses.length) {
      message.value = 'Keine Adressen mit aktuellen Modi gefunden.'
      return
    }

    const poolKey = addrPoolKey(cacheKey, showAddresses.value, showNursingHomes.value, showVillages.value)
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
    // start 30s timer for this round
    startRoundTimer()
    mapRef.value.clearMarkers()
    console.log('Center value:', center.value)
    console.log('Calling zoomToRadius with:', center.value.lat, center.value.lon, 'radius:', radiusKm.value)
    if (mapRef.value && mapRef.value.zoomToRadius) {
      mapRef.value.zoomToRadius(center.value.lat, center.value.lon, radiusKm.value)
    } else {
      console.error('mapRef.value.zoomToRadius not available')
    }
  } catch (err) {
    const status = err?.response?.status
    if (status === 429) {
      message.value = 'Zu viele Anfragen. Bitte 1–2 Minuten warten und erneut versuchen.'
    } else {
      message.value = 'Overpass query failed'
    }
  } finally {
    overpassInFlight = false
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
  clearRoundTimer()
  if (distance <= 0.5) {
    message.value = `Du warst ${distance.toFixed(2)} km entfernt. Runde gezählt: +${gameStore.lastPoints} Punkte.`
  } else {
    message.value = `Du warst ${distance.toFixed(2)} km entfernt. Distanz > 0.5 km — Runde zählt nicht.`
  }
  
  // Check if game should end
  if (roundsPlayed.value >= gameStore.totalRounds) {
    setTimeout(() => {
      gamePhase.value = 'end'
    }, 2000)
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

// Restart game (from settings)
function restartGame() {
  gameStore.resetScore()
  showSettings.value = false
  setTimeout(() => {
    newChallenge()
  }, 300)
}

// Handle start game from StartScreen
function handleStartGame(settings) {
  centerCity.value = settings.city
  radiusKm.value = settings.radius
  gameStore.showAddresses = settings.showAddresses
  gameStore.showNursingHomes = settings.showNursingHomes
  gameStore.showVillages = settings.showVillages
  
  gameStore.resetScore()
  gamePhase.value = 'playing'
  
  setTimeout(() => setCenter(), 300)
  setTimeout(() => newChallenge(), 500)
}

// Handle restart from EndScreen
function handleRestart() {
  gamePhase.value = 'start'
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
