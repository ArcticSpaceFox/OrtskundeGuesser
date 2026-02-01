<template>
  <div class="game-fullscreen">
    <header class="topbar">
      <div class="controls">
        <div class="left-controls">
          <!-- <input v-model="centerCity" placeholder="Stadt (Bspw. Güstrow)" class="text-white" />
          <input v-model.number="radiusKm" type="number" min="1" style="width:6rem" class="text-white" />
          <button @click="setCenter">Mitte setzen</button> -->
          <button @click="newChallenge">Neue Adresse</button>
        </div>
          <div class="challenge-text" v-if="challenge"><strong>Finde:</strong>&nbsp;{{ centerCity }}, {{ challenge.street }} {{ challenge.housenumber }}</div>
      </div>
      <div class="flex">
        <div class="scorebox w-56 text-right">
          <div>Score: <strong>{{ totalScore }}</strong></div>
          <div>Gezählte Runden: {{ roundsCounted }} / Gespielt: {{ roundsPlayed }}</div>
          <div v-if="lastPoints !== null">Letzte Punkte: <strong v-if="lastPoints>0">+{{ lastPoints }}</strong><strong v-else>{{ lastPoints }}</strong></div>
        </div>
          <button class="settings-btn" @click="showSettings = true">⚙️</button>
      </div>
    </header>

      <div class="progress-row" v-if="distanceKm !== null">
        <div class="progress-fill" :style="{ width: progressPercent + '%', background: progressColor }"></div>
      </div>

    <div id="map" ref="mapEl"></div>
    <div class="bottom-info">
      <div v-if="message">{{ message }}</div>
      <div v-if="distanceKm !== null">Distanz: {{ (distanceKm*1000).toFixed(0) }} m</div>
    </div>

    <div v-if="showSettings" class="settings-overlay">
      <div class="settings-panel">
        <h3>Einstellungen</h3>
        <label>Stadt</label>
        <input v-model="settingsCity" />
        <label>Radius (km)</label>
        <input v-model.number="settingsRadius" type="number" min="1" />
        <div class="settings-actions">
          <button @click="applySettings">Übernehmen</button>
          <button @click="showSettings = false">Abbrechen</button>
          <button @click="resetScore">Score zurücksetzen</button>
          <button @click="resetAllCaches">Cache löschen + Reset</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue'
import L from 'leaflet'
import axios from 'axios'
import markerIcon from 'leaflet/dist/images/marker-icon.png'

L.Icon.Default.mergeOptions({ iconUrl: markerIcon, shadowUrl: '' })

// Simple localStorage cache helpers (value stored as { ts, ttl, data })
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
  } catch (e) {
    // ignore quota errors
  }
}

const GEOCODE_TTL = 24 * 60 * 60 * 1000 // 24h
const OVERPASS_TTL = 6 * 60 * 60 * 1000 // 6h

function overpassCacheKey(lat, lon, radiusMeters) {
  // round lat/lon to 4 decimals (~11m) to increase cache hits
  const rlat = Math.round(lat * 10000) / 10000
  const rlon = Math.round(lon * 10000) / 10000
  return `overpass:${rlat}:${rlon}:${Math.round(radiusMeters)}`
}

function buildAddressQueue(addresses) {
  // group by street
  const byStreet = {}
  addresses.forEach(a => {
    const s = (a.street || '').trim()
    if (!byStreet[s]) byStreet[s] = []
    // use unique key to avoid duplicate housenumbers
    const key = `${s}||${a.housenumber}`
    byStreet[s].push(a)
  })

  const streets = Object.keys(byStreet)
  const shuffle = (arr) => {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      const tmp = arr[i]
      arr[i] = arr[j]
      arr[j] = tmp
    }
    return arr
  }

  // prepare per-street shuffled lists
  const lists = streets.map(s => shuffle([...byStreet[s]]))

  // round-robin merge so consecutive picks come from different streets
  const queue = []
  let added = true
  while (added) {
    added = false
    for (let i = 0; i < lists.length; i++) {
      if (lists[i].length) {
        queue.push(lists[i].shift())
        added = true
      }
    }
  }

  // final global shuffle of small blocks to add randomness while preserving separation
  return queue
}

function addrPoolKey(cacheKey) {
  return `addrpool:${cacheKey}`
}

function clearAllCaches() {
  try {
    Object.keys(localStorage).forEach(k => {
      if (k.startsWith('geocode:') || k.startsWith('overpass:') || k.startsWith('addrpool:')) {
        localStorage.removeItem(k)
      }
    })
  } catch (e) {}
}

const centerCity = ref('Güstrow')
const radiusKm = ref(10)
const showSettings = ref(false)
const settingsCity = ref(centerCity.value)
const settingsRadius = ref(radiusKm.value)

const distanceMeters = computed(() => (distanceKm.value != null ? distanceKm.value * 1000 : 0))
const progressFraction = computed(() => {
  if (distanceKm.value == null) return 0
  const frac = 1 - Math.min(distanceKm.value / 0.5, 1)
  return Math.max(0, Math.min(1, frac))
})
const progressPercent = computed(() => Math.round(progressFraction.value * 100))
const progressColor = computed(() => {
  if (distanceKm.value == null) return '#888'
  if (distanceKm.value > 0.5) return '#d9534f' // red
  if (distanceKm.value <= 0.1) return '#5cb85c' // green
  return '#f0ad4e' // yellow
})
const mapEl = ref(null)
let map = null
let guessMarker = null
let actualMarker = null
let radiusCircle = null
let distanceLine = null
let distanceLabel = null
// default to Güstrow
const center = ref({ lat: 53.7921, lon: 12.2001 })
const challenge = ref(null)
const message = ref('')
const distanceKm = ref(null)
const showAnswer = ref(false)
// rounds & scoring
const totalScore = ref(0)
const roundsPlayed = ref(0)
const roundsCounted = ref(0)
const lastPoints = ref(null)

const SCORE_KEY = 'gg:score'

function loadScore() {
  try {
    const raw = localStorage.getItem(SCORE_KEY)
    if (!raw) return
    const p = JSON.parse(raw)
    totalScore.value = p.totalScore || 0
    roundsPlayed.value = p.roundsPlayed || 0
    roundsCounted.value = p.roundsCounted || 0
  } catch (e) {}
}

function saveScore() {
  try {
    localStorage.setItem(SCORE_KEY, JSON.stringify({ totalScore: totalScore.value, roundsPlayed: roundsPlayed.value, roundsCounted: roundsCounted.value }))
  } catch (e) {}
}

loadScore()

onMounted(() => {
  map = L.map(mapEl.value).setView([center.value.lat, center.value.lon], 12)
  // run initial setCenter with defaults
  setTimeout(() => setCenter(), 300)
  L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/light_nolabels/{z}/{x}/{y}{r}.png', {
    subdomains: 'abcd',
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap contributors &copy; CARTO'
  }).addTo(map)
  map.on('click', (e) => handleGuess(e.latlng))
  // ensure size is correct after layout
  setTimeout(() => map.invalidateSize(), 200)
})

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
    map.setView([center.value.lat, center.value.lon], 13)
    // draw radius circle and fit map to show full radius
    const radiusMeters = Math.max(1000, Math.min(100000, Math.round(radiusKm.value * 1000)))
    if (radiusCircle) { map.removeLayer(radiusCircle); radiusCircle = null }
    radiusCircle = L.circle([center.value.lat, center.value.lon], { radius: radiusMeters, color: '#3388ff', weight: 1, fillOpacity: 0.05 }).addTo(map)
    map.fitBounds(radiusCircle.getBounds(), { padding: [20, 20] })
    setTimeout(() => map.invalidateSize(), 200)
    message.value = `Center set to ${resData[0].display_name}`
  } catch (err) {
    message.value = 'Geocode error'
  }
}

async function newChallenge() {
  message.value = 'Suche adressen...'
  distanceKm.value = null
  challenge.value = null
  if (!center.value.lat || !center.value.lon) {
    await setCenter()
  }
  const radiusMeters = Math.max(1000, Math.min(100000, Math.round(radiusKm.value * 1000)))
  // Overpass query: find nodes/ways/relations with addr:housenumber and addr:street
  const q = `[out:json][timeout:25];(node["addr:housenumber"]["addr:street"](around:${radiusMeters},${center.value.lat},${center.value.lon});way["addr:housenumber"]["addr:street"](around:${radiusMeters},${center.value.lat},${center.value.lon});relation["addr:housenumber"]["addr:street"](around:${radiusMeters},${center.value.lat},${center.value.lon}););out center 200;`
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
    const addresses = els.map(el => {
      const tags = el.tags || {}
      const street = tags['addr:street']
      const housenumber = tags['addr:housenumber']
      let lat = el.lat, lon = el.lon
      if (!lat && el.center) {
        lat = el.center.lat
        lon = el.center.lon
      }
      return street && housenumber && lat && lon ? { street, housenumber, lat, lon } : null
    }).filter(Boolean)

    if (!addresses.length) {
      message.value = 'Keine Adressen in der Umgebung gefunden. Versuche den Radius zu erhöhen oder eine andere Stadt.'
      return
    }

    // Build or read a cached address pool that reduces street-duplication
    const poolKey = addrPoolKey(cacheKey)
    let pool = cacheGet(poolKey)
    if (!pool || !Array.isArray(pool.queue) || !pool.queue.length) {
      const queue = buildAddressQueue(addresses)
      pool = { queue, ptr: 0 }
      cacheSet(poolKey, pool, OVERPASS_TTL)
    }

    // if we've exhausted the pool, rebuild a fresh shuffled queue
    if (pool.ptr >= pool.queue.length) {
      pool = { queue: buildAddressQueue(addresses), ptr: 0 }
    }

    const pick = pool.queue[pool.ptr]
    pool.ptr = (pool.ptr || 0) + 1
    cacheSet(poolKey, pool, OVERPASS_TTL)

    challenge.value = pick
    showAnswer.value = false
    message.value = 'Klicke auf die Karte, um zu raten.'

    // clear previous markers
    if (guessMarker) { map.removeLayer(guessMarker); guessMarker = null }
    if (actualMarker) { map.removeLayer(actualMarker); actualMarker = null }
    // update radius circle to reflect current radius and center and fit map
    if (radiusCircle) { map.removeLayer(radiusCircle); radiusCircle = null }
    radiusCircle = L.circle([center.value.lat, center.value.lon], { radius: radiusMeters, color: '#3388ff', weight: 1, fillOpacity: 0.05 }).addTo(map)
    map.fitBounds(radiusCircle.getBounds(), { padding: [20, 20] })
    setTimeout(() => map.invalidateSize(), 200)

  // ensure any open settings reflect current values
  settingsCity.value = centerCity.value
  settingsRadius.value = radiusKm.value

  } catch (err) {
    message.value = 'Overpass query failed'
  }
}

function handleGuess(latlng) {
  if (!challenge.value) {
    message.value = 'Starte die Aufgabe.'
    return
  }
  if (showAnswer.value) {
    message.value = 'Runde bereits beendet. Neue Adresse starten.'
    return
  }
  // place / move guess marker without shadow
  if (guessMarker) map.removeLayer(guessMarker)
  const noShadowIcon = L.icon({ iconUrl: markerIcon, shadowUrl: '', iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34] })
  guessMarker = L.marker(latlng, { icon: noShadowIcon }).addTo(map).bindPopup('Dein Tipp').openPopup()

  // place actual marker with red icon
  if (actualMarker) map.removeLayer(actualMarker)
  const redMarkerSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 25 41"><path d="M12.5 0C6.1 0 1 5.1 1 11.5 1 18 12.5 41 12.5 41s11.5-23 11.5-29.5C24 5.1 18.9 0 12.5 0z" fill="#d9534f"/></svg>`
  const redIcon = L.divIcon({ html: redMarkerSvg, iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], className: 'red-marker-icon' })
  actualMarker = L.marker([challenge.value.lat, challenge.value.lon], { icon: redIcon }).addTo(map).bindPopup('Tatsächlicher Ort').openPopup()

  // compute distance first
  distanceKm.value = haversine(latlng.lat, latlng.lng, challenge.value.lat, challenge.value.lon)
  
  // draw dashed line between guess and actual
  if (distanceLine) map.removeLayer(distanceLine)
  distanceLine = L.polyline([latlng, [challenge.value.lat, challenge.value.lon]], { color: '#999', weight: 2, dashArray: '5,5' }).addTo(map)
  
  // add distance label at midpoint (now with correct distance)
  if (distanceLabel) map.removeLayer(distanceLabel)
  const midLat = (latlng.lat + challenge.value.lat) / 2
  const midLon = (latlng.lng + challenge.value.lon) / 2
  distanceLabel = L.marker([midLat, midLon], { icon: L.divIcon({ html: `<div style="font-size:11px;background:rgba(255,255,255,0.8);padding:2px 4px;border-radius:3px;white-space:nowrap;">${distanceKm.value.toFixed(2)} km</div>`, iconSize: [80, 24], iconAnchor: [40, 12] }) }).addTo(map)

  message.value = `Du warst ${distanceKm.value.toFixed(2)} km entfernt.`
  // scoring: rounds always incremented as played; only count if within 0.5 km
  roundsPlayed.value = (roundsPlayed.value || 0) + 1
  let points = 0
  if (distanceKm.value <= 0.5) {
    // linear 0..0.5km -> 100..0 points
    points = Math.round(Math.max(0, (1 - (distanceKm.value / 0.5)) * 100))
    totalScore.value = (totalScore.value || 0) + points
    roundsCounted.value = (roundsCounted.value || 0) + 1
    message.value += ` Runde gezählt: +${points} Punkte.`
  } else {
    message.value += ' Distanz > 0.5 km — Runde zählt nicht.'
  }
  lastPoints.value = points
  saveScore()

  // reveal street name and update popup
  showAnswer.value = true
  if (actualMarker) {
    actualMarker.setPopupContent(`Tatsächlich: ${challenge.value.street} ${challenge.value.housenumber}`)
    actualMarker.openPopup()
  }
  // fit map to show both guess and actual location with padding
  try {
    const bounds = L.latLngBounds([
      [challenge.value.lat, challenge.value.lon],
      [latlng.lat, latlng.lng]
    ])
    map.fitBounds(bounds, { padding: [80, 80], maxZoom: 16 })
  } catch (e) {
    // ignore if map not ready
  }
}

function applySettings() {
  centerCity.value = settingsCity.value
  radiusKm.value = settingsRadius.value
  setCenter()
  showSettings.value = false
}

function resetScore() {
  totalScore.value = 0
  roundsPlayed.value = 0
  roundsCounted.value = 0
  lastPoints.value = null
  try { localStorage.removeItem(SCORE_KEY) } catch (e) {}
}

function resetAllCaches() {
  clearAllCaches()
  resetScore()
}

function haversine(lat1, lon1, lat2, lon2) {
  const toRad = deg => deg * Math.PI / 180
  const R = 6371 // km
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon/2) * Math.sin(dLon/2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))
  return R * c
}
</script>

<style scoped>
.game-fullscreen { position: relative; height: 100vh; width: 100vw; overflow: hidden; }
.topbar { position: fixed; top: 0; left: 0; right: 0; height: 64px; background: rgba(24,24,24,0.95); display: flex; align-items: center; justify-content: space-between; z-index: 1000; padding: 6px 12px; }
.controls { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; max-width: 1200px; width: 100%; justify-content: flex-start; }
.left-controls { display: flex; gap: 8px; align-items: center }
.scorebox { color: #fff; margin-right: 12px; text-align: right; font-size: 0.85rem }
#map { position: absolute; top: 64px; bottom: 0; left: 0; right: 0; }
  .progress-row { position: fixed; top: 64px; left: 0; right: 0; height: 12px; background: rgba(0,0,0,0.06); z-index: 1000 }
  .progress-fill { height: 100%; width: 0%; transition: width 300ms ease, background 300ms ease }
  .settings-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.5); display:flex; align-items:center; justify-content:center; z-index:2000 }
  .settings-panel { background: #fff; padding: 18px; border-radius:8px; min-width:320px; max-width:640px }
  .settings-panel input { width: 100%; margin-bottom:8px }
  .settings-actions { display:flex; gap:8px; justify-content:flex-end }
  .settings-btn { margin-left:8px; background:transparent; border:0; color:#fff; cursor:pointer }
.bottom-info { position: fixed; left: 12px; bottom: 12px; background: rgba(0,0,0,0.6); color: #fff; padding: 8px 10px; border-radius: 6px; z-index: 1001; }
input { padding: 6px; border-radius: 6px; border: 1px solid #ccc; }
button { padding: 6px 10px; border-radius:6px }
.challenge-text { margin-left: 12px; color: #fff }
</style>
