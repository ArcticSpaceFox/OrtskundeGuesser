<template>
  <div class="game-fullscreen">
    <header class="topbar">
      <div class="controls">
        <input v-model="centerCity" placeholder="Stadt (Bspw. Güstrow)" class="text-white" />
        <input v-model.number="radiusKm" type="number" min="1" style="width:6rem" class="text-white" />
        <button @click="setCenter">Mitte setzen</button>
        <button @click="newChallenge">Neue Adresse</button>
        <div v-if="challenge" class="challenge-text"><strong>Finde:</strong>&nbsp;{{ challenge.street }} {{ challenge.housenumber }}</div>
      </div>
    </header>

    <div id="map" ref="mapEl"></div>

    <div class="bottom-info">
      <div v-if="message">{{ message }}</div>
      <div v-if="distanceKm !== null">Distanz: {{ distanceKm.toFixed(2) }} km</div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import L from 'leaflet'
import axios from 'axios'
import markerIcon from 'leaflet/dist/images/marker-icon.png'
import markerShadow from 'leaflet/dist/images/marker-shadow.png'

L.Icon.Default.mergeOptions({ iconUrl: markerIcon, shadowUrl: markerShadow })

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

const centerCity = ref('Güstrow')
const radiusKm = ref(10)
const mapEl = ref(null)
let map = null
let guessMarker = null
let actualMarker = null
let radiusCircle = null
// default to Güstrow
const center = ref({ lat: 53.7921, lon: 12.2001 })
const challenge = ref(null)
const message = ref('')
const distanceKm = ref(null)
const showAnswer = ref(false)

onMounted(() => {
  map = L.map(mapEl.value).setView([center.value.lat, center.value.lon], 12)
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

  } catch (err) {
    message.value = 'Overpass query failed'
  }
}

function handleGuess(latlng) {
  if (!challenge.value) {
    message.value = 'Starte die Aufgabe.'
    return
  }
  // place / move guess marker
  if (guessMarker) map.removeLayer(guessMarker)
  guessMarker = L.marker(latlng).addTo(map).bindPopup('Dein Tipp').openPopup()

  // place actual marker but don't reveal street name yet
  if (actualMarker) map.removeLayer(actualMarker)
  actualMarker = L.marker([challenge.value.lat, challenge.value.lon], { opacity: 0.8 }).addTo(map).bindPopup('Tatsächlicher Ort').openPopup()

  // compute distance
  distanceKm.value = haversine(latlng.lat, latlng.lng, challenge.value.lat, challenge.value.lon)
  message.value = `Du warst ${distanceKm.value.toFixed(2)} km entfernt.`
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
.topbar { position: fixed; top: 0; left: 0; right: 0; height: 56px; background: rgba(24,24,24,0.9); display: flex; align-items: center; justify-content: center; z-index: 1000; padding: 6px 12px; }
.controls { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; max-width: 1200px; width: 100%; justify-content: center; }
#map { position: absolute; top: 56px; bottom: 0; left: 0; right: 0; }
.bottom-info { position: fixed; left: 12px; bottom: 12px; background: rgba(0,0,0,0.6); color: #fff; padding: 8px 10px; border-radius: 6px; z-index: 1001; }
input { padding: 6px; border-radius: 6px; border: 1px solid #ccc; }
button { padding: 6px 10px; border-radius:6px }
.challenge-text { margin-left: 12px; color: #fff }
</style>
