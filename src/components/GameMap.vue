<template>
  <div ref="mapEl" class="absolute top-16 left-0 right-0 bottom-0 z-10"></div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import L from 'leaflet'
import markerIcon from 'leaflet/dist/images/marker-icon.png'

const mapEl = ref(null)
let map = null
let guessMarker = null
let actualMarker = null
let radiusCircle = null
let distanceLine = null
let distanceLabel = null

L.Icon.Default.mergeOptions({ iconUrl: markerIcon, shadowUrl: '' })

const props = defineProps({
  center: Object,
  radiusKm: Number
})

const emit = defineEmits(['click', 'update:distanceLine', 'ready'])

onMounted(() => {
  map = L.map(mapEl.value).setView([props.center.lat, props.center.lon], 12)
  L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/light_nolabels/{z}/{x}/{y}{r}.png', {
    subdomains: 'abcd',
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap contributors &copy; CARTO'
  }).addTo(map)
  map.on('click', (e) => emit('click', e.latlng))
  setTimeout(() => map.invalidateSize(), 200)
  // Emit ready so parent can wait for the map to be initialized
  setTimeout(() => emit('ready'), 300)
})

function setCenter(lat, lon) {
  map.setView([lat, lon], 13)
  const radiusMeters = Math.max(1000, Math.min(100000, Math.round(props.radiusKm * 1000)))
  if (radiusCircle) map.removeLayer(radiusCircle)
  radiusCircle = L.circle([lat, lon], {
    radius: radiusMeters,
    color: '#3388ff',
    weight: 1,
    fillOpacity: 0.05
  }).addTo(map)
  map.fitBounds(radiusCircle.getBounds(), { padding: [20, 20] })
  setTimeout(() => map.invalidateSize(), 200)
}

function clearMarkers() {
  if (guessMarker) map.removeLayer(guessMarker)
  if (actualMarker) map.removeLayer(actualMarker)
  if (distanceLine) map.removeLayer(distanceLine)
  if (distanceLabel) map.removeLayer(distanceLabel)
  guessMarker = null
  actualMarker = null
  distanceLine = null
  distanceLabel = null
}

function zoomToRadius(lat, lon, radiusKm) {
  console.log('zoomToRadius INSIDE GameMap called with:', lat, lon, 'radiusKm:', radiusKm)
  console.log('map object exists:', !!map)
  
  const radiusMeters = Math.max(1000, Math.min(100000, Math.round(radiusKm * 1000)))
  console.log('Calculated radiusMeters:', radiusMeters)
  
  if (radiusCircle) map.removeLayer(radiusCircle)
  radiusCircle = L.circle([lat, lon], {
    radius: radiusMeters,
    color: '#3388ff',
    weight: 1,
    fillOpacity: 0.05
  }).addTo(map)
  
  console.log('Circle added to map')
  const bounds = radiusCircle.getBounds()
  console.log('Circle bounds:', bounds)
  
  map.fitBounds(bounds, { padding: [20, 20] })
  console.log('fitBounds called')
  
  setTimeout(() => {
    map.invalidateSize()
    console.log('invalidateSize called')
  }, 0)
}

function showGuess(guessLatlng, actualLatLng, distance) {
  if (!map) {
    console.error('Map not initialized')
    return
  }
  
  // Ensure actualLatLng has valid properties
  if (!actualLatLng || actualLatLng.lat === undefined || actualLatLng.lon === undefined) {
    console.error('Invalid actualLatLng:', actualLatLng)
    return
  }
  
  clearMarkers()

  // guess marker
  const noShadowIcon = L.icon({
    iconUrl: markerIcon,
    shadowUrl: '',
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34]
  })
  guessMarker = L.marker(guessLatlng, { icon: noShadowIcon }).addTo(map).bindPopup('Dein Tipp').openPopup()

  // actual marker (red)
  const redMarkerSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 25 41"><path d="M12.5 0C6.1 0 1 5.1 1 11.5 1 18 12.5 41 12.5 41s11.5-23 11.5-29.5C24 5.1 18.9 0 12.5 0z" fill="#dc2626"/></svg>`
  const redIcon = L.divIcon({
    html: redMarkerSvg,
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    className: 'red-marker-icon'
  })
  actualMarker = L.marker([actualLatLng.lat, actualLatLng.lon], { icon: redIcon }).addTo(map).bindPopup('Tatsächlicher Ort').openPopup()

  // dashed line
  distanceLine = L.polyline([guessLatlng, [actualLatLng.lat, actualLatLng.lon]], {
    color: '#999',
    weight: 2,
    dashArray: '5,5'
  }).addTo(map)

  // distance label
  const midLat = (guessLatlng.lat + actualLatLng.lat) / 2
  const midLon = (guessLatlng.lng + actualLatLng.lon) / 2
  distanceLabel = L.marker([midLat, midLon], {
    icon: L.divIcon({
      html: `<div style="font-size:11px;background:rgba(255,255,255,0.8);padding:2px 4px;border-radius:3px;white-space:nowrap;">${distance.toFixed(2)} km</div>`,
      iconSize: [80, 24],
      iconAnchor: [40, 12]
    })
  }).addTo(map)

  // fit bounds
  setTimeout(() => {
    map.invalidateSize()
    const bounds = L.latLngBounds([[actualLatLng.lat, actualLatLng.lon], guessLatlng])
    map.fitBounds(bounds, { padding: [150, 150], maxZoom: 16 })
  }, 100)
}

defineExpose({ setCenter, clearMarkers, showGuess, zoomToRadius })
</script>
