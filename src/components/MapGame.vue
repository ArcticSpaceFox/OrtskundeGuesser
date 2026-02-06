<template>
  <div class="h-screen w-screen overflow-hidden bg-gray-100">
    <!-- Start Screen -->
    <StartScreen
      v-if="gamePhase === 'start' && !showUpdates"
      :city="centerCity"
      :radius="radiusKm"
      :show-addresses="showAddresses"
      :show-nursing-homes="showNursingHomes"
      :show-villages="showVillages"
      @start-game="handleStartGame"
      @open-updates="showUpdates = true"
    />

    <Updates v-if="gamePhase === 'start' && showUpdates" @close="showUpdates = false" />
    <LoadingScreen v-if="gamePhase === 'loading'" :status="loadingStatus" :percent="loadingPercent" :color="loadingColor" @cancel="handleCancelLoading" />

    <!-- Game Screen -->
    <template v-else-if="gamePhase === 'playing'">
      <TopBar
        :challenge="challenge"
        :center-city="centerCity"
        :total-score="totalScore"
        :rounds-played="roundsPlayed"
        :rounds-counted="roundsCounted"
        :last-points="lastPoints"
        :show-answer="showAnswer"
        @new-challenge="newChallenge"
        @give-up="handleGiveUp"
        @skip-round="skipRound"
      />

      <ProgressBar
        :progress-percent="displayPercent"
        :progress-color="displayColor"
        :label="displayLabel"
      />

      <GameMap
        ref="mapRef"
        :center="center"
        :radius-k-m="radiusKm.value"
        @click="handleMapClick"
        @ready="onMapReady"
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
import { ref, onMounted, onUnmounted, computed, watch } from 'vue'
import axios from 'axios'
import { useGameStore } from '../stores/gameStore'
import { storeToRefs } from 'pinia'
import TopBar from './TopBar.vue'
import ProgressBar from './ProgressBar.vue'
import GameMap from './GameMap.vue'
import BottomInfo from './BottomInfo.vue'
import SettingsPanel from './SettingsPanel.vue'
import StartScreen from './StartScreen.vue'
import Updates from './Updates.vue'
import LoadingScreen from './LoadingScreen.vue'
import EndScreen from './EndScreen.vue'

const gameStore = useGameStore()
const { challenge, totalScore, roundsPlayed, roundsCounted, lastPoints, message, distanceKm, progressPercent, progressColor, showAddresses, showNursingHomes, showVillages, showSettings, showAnswer, gamePhase } = storeToRefs(gameStore)
gameStore.init()

const mapRef = ref(null)
const mapReady = ref(false)
const showUpdates = ref(false)
const loadingStatus = ref('')
const loadingPercent = ref(0)
const loadingColor = ref('#3b82f6')
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
  console.debug('startRoundTimer()')
  clearRoundTimer()
  timerRemaining.value = 30
  timerId = setInterval(() => {
    if (timerRemaining.value > 0) {
      timerRemaining.value -= 1
    }
    if (timerRemaining.value <= 0) {
      clearRoundTimer()
      console.debug('round timer expired')
      message.value = 'Zeit abgelaufen.'
      try {
        gameStore.recordGuess(999)
      } catch (e) {}
      // reveal correct location (award 0 points) and zoom in
      if (challenge.value && mapRef.value && mapRef.value.showGuess) {
        const actual = { lat: Number(challenge.value.lat), lon: Number(challenge.value.lon) }
        const guessLatLng = { lat: Number(challenge.value.lat), lng: Number(challenge.value.lon) }
        try {
          mapRef.value.showGuess(guessLatLng, actual, 0)
        } catch (e) {}
        try {
          mapRef.value.zoomToRadius(actual.lat, actual.lon, Math.min(radiusKm.value, 5))
        } catch (e) {}
      }
      // start the 7s next-round countdown
      startNextCountdown()
      if (roundsPlayed.value >= gameStore.totalRounds) {
        setTimeout(() => {
          gamePhase.value = 'end'
        }, 1200)
      }
    }
  }, 1000)
}

onUnmounted(() => clearRoundTimer())
// Next-round countdown (after a guess)
const nextRoundCountdown = ref(0)
let nextTimerId = null

function clearNextCountdown() {
  if (nextTimerId) {
    clearInterval(nextTimerId)
    nextTimerId = null
  }
  nextRoundCountdown.value = 0
}

function startNextCountdown() {
  clearNextCountdown()
  // only start if there are still rounds remaining
  if (roundsPlayed.value >= gameStore.totalRounds) return
  // 7 seconds as requested
  nextRoundCountdown.value = 7
  nextTimerId = setInterval(() => {
    if (nextRoundCountdown.value > 0) {
      nextRoundCountdown.value -= 1
    }
    if (nextRoundCountdown.value <= 0) {
      clearNextCountdown()
      // Start next challenge
      setTimeout(() => {
        if (roundsPlayed.value >= gameStore.totalRounds) {
          gamePhase.value = 'end'
        } else {
          newChallenge()
        }
      }, 200)
    }
  }, 1000)
}

function skipRound() {
  // Skip current round: award no points, treat like timeout
  if (!challenge.value || showAnswer.value) return
  clearRoundTimer()
  try {
    gameStore.recordGuess(999)
  } catch (e) {}
  message.value = 'Runde übersprungen.'
  // reveal correct location (award 0 points) and zoom in — same behavior as timeout
  if (challenge.value && mapRef.value && mapRef.value.showGuess) {
    const actual = { lat: Number(challenge.value.lat), lon: Number(challenge.value.lon) }
    const guessLatLng = { lat: Number(challenge.value.lat), lng: Number(challenge.value.lon) }
    try {
      mapRef.value.showGuess(guessLatLng, actual, 0)
    } catch (e) {}
    try {
      // Zoom further in when skipping the round (closer than normal timeout)
      mapRef.value.zoomToRadius(actual.lat, actual.lon, Math.min(radiusKm.value, 0.5))
    } catch (e) {}
  }
  startNextCountdown()
}

function handleGiveUp() {
  // stop timers
  clearRoundTimer()
  clearNextCountdown()
  // figure how many rounds remain
  const remaining = Math.max(0, gameStore.totalRounds - (roundsPlayed.value || 0))
  if (remaining <= 0) {
    gamePhase.value = 'end'
    return
  }
  message.value = `Aufgegeben — ${remaining} Runden werden mit 0 bewertet.`
  // apply 0-point records for remaining rounds
  for (let i = 0; i < remaining; i++) {
    try {
      gameStore.recordGuess(999)
    } catch (e) {}
  }
  // ensure we transition to end screen shortly
  setTimeout(() => {
    gamePhase.value = 'end'
  }, 300)
}

onUnmounted(() => {
  clearNextCountdown()
})
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
// Next-countdown derived percent/label for ProgressBar
const NEXT_TOTAL = 7
const nextTimerPercent = computed(() => {
  if (nextRoundCountdown.value <= 0) return 0
  return Math.max(0, Math.min(100, (nextRoundCountdown.value / NEXT_TOTAL) * 100))
})

const nextTimerColor = computed(() => {
  if (nextRoundCountdown.value <= 2) return '#dc2626'
  if (nextRoundCountdown.value <= 4) return '#f59e0b'
  return '#10b981'
})

const nextTimerLabel = computed(() => nextRoundCountdown.value > 0 ? `Nächste Runde in ${nextRoundCountdown.value}s` : '')

// decide what to show in ProgressBar: during active round show timer, after answer show next-countdown
const displayPercent = computed(() => (nextRoundCountdown.value > 0 && showAnswer.value) ? nextTimerPercent.value : timerPercent.value)
const displayColor = computed(() => (nextRoundCountdown.value > 0 && showAnswer.value) ? nextTimerColor.value : timerColor.value)
const displayLabel = computed(() => (nextRoundCountdown.value > 0 && showAnswer.value) ? nextTimerLabel.value : timerLabel.value)
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
  console.debug('newChallenge() start, overpassInFlight=', overpassInFlight)
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
    console.debug('overpassInFlight set to true')
    // clear any pending next-round countdown or timers when explicitly starting a new challenge
    clearNextCountdown()
    clearRoundTimer()
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
    console.debug('Parsed addresses (sample):', addresses.slice(0, 5))

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

    console.debug('Picking challenge from pool, ptr now:', pool.ptr, 'queueLen:', pool.queue.length, 'pick:', pick)
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
    console.debug('overpassInFlight set to false')
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
  // start 6s next-round countdown
  startNextCountdown()
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

// Map ready handler (signaled by GameMap)
function onMapReady() {
  console.debug('onMapReady() received')
  mapReady.value = true
}

function waitForMapReady(timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    if (mapReady.value) return resolve()
    const unwatch = watch(mapReady, (v) => {
      if (v) {
        clearTimeout(timer)
        unwatch()
        resolve()
      }
    })
    const timer = setTimeout(() => {
      try { unwatch() } catch (e) {}
      reject(new Error('timeout waiting for mapReady'))
    }, timeoutMs)
  })
}

// Handle start game from StartScreen
async function handleStartGame(settings) {
  centerCity.value = settings.city
  radiusKm.value = settings.radius
  gameStore.showAddresses = settings.showAddresses
  gameStore.showNursingHomes = settings.showNursingHomes
  gameStore.showVillages = settings.showVillages

  gameStore.resetScore()
  // go to loading screen and prefetch data
  gamePhase.value = 'loading'
  loadingStatus.value = 'Vorbereitung'
  loadingPercent.value = 0
  try {
    await prefetchForGame()
  } catch (e) {
    console.error('Prefetch failed', e)
  }

  // after prefetch, start playing and immediately set center and request a challenge
  gamePhase.value = 'playing'
  // wait for the map component to signal readiness (mounted + tiles)
  try {
    await waitForMapReady(5000)
  } catch (e) {
    console.warn('Map did not signal ready in time', e)
  }
  try {
    await setCenter()
  } catch (e) {
    console.warn('setCenter failed', e)
  }
  try {
    await newChallenge()
  } catch (e) {
    console.warn('newChallenge failed', e)
  }
}

function handleCancelLoading() {
  // cancel loading and go back to start
  loadingStatus.value = ''
  loadingPercent.value = 0
  gamePhase.value = 'start'
}

async function prefetchForGame() {
  console.debug('prefetchForGame() start')
  loadingStatus.value = 'Geokodierung'
  loadingPercent.value = 5
  await setCenter()

  const radiusMeters = Math.max(1000, Math.min(100000, Math.round(radiusKm.value * 1000)))
  const cacheKey = overpassCacheKey(center.value.lat, center.value.lon, radiusMeters)

  const steps = []
  if (showAddresses.value) steps.push('addresses')
  if (showNursingHomes.value) steps.push('medical')
  if (showVillages.value) steps.push('places')

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i]
    loadingStatus.value = `Lade ${step}...`
    loadingPercent.value = 10 + Math.round((i / steps.length) * 70)
    try {
      if (step === 'addresses') {
        const addrKey = `${cacheKey}:addr`
        let addrEls = cacheGet(addrKey)
        if (!addrEls) {
          const res = await fetchOverpassWithRetry(`\n  [out:json][timeout:25];\n  (\n    node["addr:housenumber"]["addr:street"](around:${radiusMeters},${center.value.lat},${center.value.lon});\n    way["addr:housenumber"]["addr:street"](around:${radiusMeters},${center.value.lat},${center.value.lon});\n    relation["addr:housenumber"]["addr:street"](around:${radiusMeters},${center.value.lat},${center.value.lon});\n  );\n  out tags center 800;\n  `)
          addrEls = (res.data && res.data.elements) || []
          if (addrEls && addrEls.length) cacheSet(addrKey, addrEls, OVERPASS_TTL)
        }
      } else if (step === 'medical') {
        const medKey = `${cacheKey}:med`
        let medEls = cacheGet(medKey)
        if (!medEls) {
          const res = await fetchOverpassWithRetry(`\n  [out:json][timeout:25];\n  (\n    node["amenity"="hospital"](around:${radiusMeters},${center.value.lat},${center.value.lon});\n    way["amenity"="hospital"](around:${radiusMeters},${center.value.lat},${center.value.lon});\n    relation["amenity"="hospital"](around:${radiusMeters},${center.value.lat},${center.value.lon});\n\n    node["amenity"="clinic"](around:${radiusMeters},${center.value.lat},${center.value.lon});\n    way["amenity"="clinic"](around:${radiusMeters},${center.value.lat},${center.value.lon});\n    relation["amenity"="clinic"](around:${radiusMeters},${center.value.lat},${center.value.lon});\n\n    node["amenity"="doctors"](around:${radiusMeters},${center.value.lat},${center.value.lon});\n    way["amenity"="doctors"](around:${radiusMeters},${center.value.lat},${center.value.lon});\n    relation["amenity"="doctors"](around:${radiusMeters},${center.value.lat},${center.value.lon});\n\n    node["amenity"="nursing_home"](around:${radiusMeters},${center.value.lat},${center.value.lon});\n    way["amenity"="nursing_home"](around:${radiusMeters},${center.value.lat},${center.value.lon});\n    relation["amenity"="nursing_home"](around:${radiusMeters},${center.value.lat},${center.value.lon});\n\n    node["amenity"="social_facility"](around:${radiusMeters},${center.value.lat},${center.value.lon});\n    way["amenity"="social_facility"](around:${radiusMeters},${center.value.lat},${center.value.lon});\n    relation["amenity"="social_facility"](around:${radiusMeters},${center.value.lat},${center.value.lon});\n  );\n  out tags center 400;\n  `)
          medEls = (res.data && res.data.elements) || []
          if (medEls && medEls.length) cacheSet(medKey, medEls, OVERPASS_TTL)
        }
      } else if (step === 'places') {
        const placeKey = `${cacheKey}:place`
        let placeEls = cacheGet(placeKey)
        if (!placeEls) {
          const res = await fetchOverpassWithRetry(`\n  [out:json][timeout:60];\n  area["name"="${centerCity.value}"]["boundary"="administrative"]["admin_level"="8"]->.a;\n  (\n    node(area.a)["place"~"village|hamlet|suburb|neighbourhood"]["name"];\n    way(area.a)["place"~"village|hamlet|suburb|neighbourhood"]["name"];\n    relation(area.a)["place"~"village|hamlet|suburb|neighbourhood"]["name"];\n\n    relation(area.a)["boundary"="administrative"]["admin_level"~"9|10"]["name"];\n    way(area.a)["boundary"="administrative"]["admin_level"~"9|10"]["name"];\n  );\n  out tags center;\n  `)
          placeEls = (res.data && res.data.elements) || []
          if (placeEls && placeEls.length) cacheSet(placeKey, placeEls, OVERPASS_TTL)
        }
      }
    } catch (err) {
      console.warn('prefetch step failed', step, err)
    }
  }

  loadingStatus.value = 'Erzeuge Adress-Pool'
  loadingPercent.value = 90
  const poolKey = addrPoolKey(cacheKey, showAddresses.value, showNursingHomes.value, showVillages.value)
  let pool = cacheGet(poolKey)
  if (!pool || !Array.isArray(pool.queue) || !pool.queue.length) {
    const combined = []
    const addrEls = cacheGet(`${cacheKey}:addr`) || []
    const medEls = cacheGet(`${cacheKey}:med`) || []
    const placeEls = cacheGet(`${cacheKey}:place`) || []
    ;[...addrEls, ...medEls, ...placeEls].forEach(el => {
      const tags = el.tags || {}
      const street = tags['addr:street']
      const housenumber = tags['addr:housenumber']
      const name = tags['name']
      const operator = tags['operator']
      const brand = tags['brand']
      const suburbTag = tags['suburb'] || tags['addr:suburb'] || ''
      const label = name || operator || brand
      const medicalLabel = name ? (operator ? `${name} – ${operator}` : name) : (operator || '')
      let lat = undefined, lon = undefined
      if (el.center && el.center.lat !== undefined && el.center.lon !== undefined) { lat = el.center.lat; lon = el.center.lon }
      else if (el.lat !== undefined && el.lon !== undefined) { lat = el.lat; lon = el.lon }
      if (lat === undefined || lon === undefined || isNaN(lat) || isNaN(lon)) return
      if (street && housenumber) { combined.push({ street, housenumber, suburb: suburbTag, label: '', lat, lon, type: 'address' }); return }
      const amenity = tags['amenity']
      if (medicalLabel && ['hospital','clinic','doctors','nursing_home','social_facility'].includes(amenity)) { let addressSuffix=''; if (street && housenumber) addressSuffix = `, ${street} ${housenumber}`; else if (street) addressSuffix = `, ${street}`; combined.push({ street: medicalLabel, housenumber: addressSuffix, suburb: '', label: medicalLabel, lat, lon, type: amenity }); return }
      const placeType = tags['place']
      if (label && ['village','hamlet','suburb','neighbourhood','locality'].includes(placeType)) { combined.push({ street: label, housenumber: '', suburb: '', label, lat, lon, type: 'village' }); return }
    })
    const queue = buildAddressQueue(combined)
    pool = { queue, ptr: 0 }
    cacheSet(poolKey, pool, OVERPASS_TTL)
  }

  loadingPercent.value = 100
  loadingStatus.value = 'Bereit'
  console.debug('prefetchForGame() finished, pool ready')
}

// Handle restart from EndScreen
function handleRestart() {
  gamePhase.value = 'start'
}

// Initialize
onMounted(() => {
  // Do not auto-start a challenge on mount; the game flow will start challenges
  // from `handleStartGame()` after prefetch and map readiness. Keep a light
  // center initialization for safety.
  setTimeout(() => setCenter(), 300)
})
</script>

<style scoped>
.game-container {
  font-family: system-ui, Avenir, Helvetica, Arial, sans-serif;
}
</style>
