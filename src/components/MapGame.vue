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

const centerCity = ref('Berlin')
const radiusKm = ref(30)
const mapEl = ref(null)
let map = null
let guessMarker = null
let actualMarker = null
let radiusCircle = null
const center = ref({ lat: 52.52, lon: 13.405 })
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
    const res = await axios.get('https://nominatim.openstreetmap.org/search', {
      params: { q: centerCity.value, format: 'json', limit: 1 }
    })
    if (!res.data || !res.data[0]) {
      message.value = 'City not found'
      return
    }
    center.value.lat = parseFloat(res.data[0].lat)
    center.value.lon = parseFloat(res.data[0].lon)
    map.setView([center.value.lat, center.value.lon], 13)
    // draw radius circle and fit map to show full radius
    const radiusMeters = Math.max(1000, Math.min(100000, Math.round(radiusKm.value * 1000)))
    if (radiusCircle) { map.removeLayer(radiusCircle); radiusCircle = null }
    radiusCircle = L.circle([center.value.lat, center.value.lon], { radius: radiusMeters, color: '#3388ff', weight: 1, fillOpacity: 0.05 }).addTo(map)
    map.fitBounds(radiusCircle.getBounds(), { padding: [20, 20] })
    setTimeout(() => map.invalidateSize(), 200)
    message.value = `Center set to ${res.data[0].display_name}`
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
    const res = await axios.post('https://overpass-api.de/api/interpreter', q, {
      headers: { 'Content-Type': 'text/plain' }
    })
    const els = (res.data && res.data.elements) || []
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

    const pick = addresses[Math.floor(Math.random() * addresses.length)]
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
