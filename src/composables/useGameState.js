import { ref, computed } from 'vue'

const SCORE_KEY = 'gg:score'

export function useGameState() {
  // Game modes
  const showAddresses = ref(true)
  const showNursingHomes = ref(true)
  const showVillages = ref(true)

  // Score and rounds
  const totalScore = ref(0)
  const roundsPlayed = ref(0)
  const roundsCounted = ref(0)
  const lastPoints = ref(null)

  // Challenge state
  const challenge = ref(null)
  const showAnswer = ref(false)
  const distanceKm = ref(null)
  const message = ref('')

  // UI state
  const showSettings = ref(false)

  // Settings values
  const settingsShowAddresses = ref(true)
  const settingsShowNursingHomes = ref(true)
  const settingsShowVillages = ref(true)

  // Computed properties
  const progressFraction = computed(() => {
    if (distanceKm.value == null) return 0
    const frac = 1 - Math.min(distanceKm.value / 0.5, 1)
    return Math.max(0, Math.min(1, frac))
  })

  const progressPercent = computed(() => Math.round(progressFraction.value * 100))

  const progressColor = computed(() => {
    if (distanceKm.value == null) return '#888'
    if (distanceKm.value > 0.5) return '#dc2626' // red-600
    if (distanceKm.value <= 0.1) return '#16a34a' // green-600
    return '#f59e0b' // amber-400
  })

  // Load score from localStorage
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

  // Save score to localStorage
  function saveScore() {
    try {
      localStorage.setItem(
        SCORE_KEY,
        JSON.stringify({
          totalScore: totalScore.value,
          roundsPlayed: roundsPlayed.value,
          roundsCounted: roundsCounted.value
        })
      )
    } catch (e) {}
  }

  // Reset score
  function resetScore() {
    totalScore.value = 0
    roundsPlayed.value = 0
    roundsCounted.value = 0
    lastPoints.value = null
    try {
      localStorage.removeItem(SCORE_KEY)
    } catch (e) {}
  }

  // Record a guess (return points earned)
  function recordGuess(distanceValue) {
    distanceKm.value = distanceValue
    roundsPlayed.value = (roundsPlayed.value || 0) + 1
    let points = 0

    if (distanceValue <= 0.5) {
      points = Math.round(Math.max(0, (1 - distanceValue / 0.5) * 100))
      totalScore.value = (totalScore.value || 0) + points
      roundsCounted.value = (roundsCounted.value || 0) + 1
    }

    lastPoints.value = points
    saveScore()
    showAnswer.value = true

    return points
  }

  // Start new challenge
  function startNewChallenge(newChallenge) {
    challenge.value = newChallenge
    showAnswer.value = false
    message.value = 'Klicke auf die Karte, um zu raten.'
    distanceKm.value = null
  }

  // Initialize
  loadScore()

  return {
    // Modes
    showAddresses,
    showNursingHomes,
    showVillages,
    // Score
    totalScore,
    roundsPlayed,
    roundsCounted,
    lastPoints,
    // Challenge
    challenge,
    showAnswer,
    distanceKm,
    message,
    // UI
    showSettings,
    // Settings
    settingsShowAddresses,
    settingsShowNursingHomes,
    settingsShowVillages,
    // Computed
    progressPercent,
    progressColor,
    // Methods
    saveScore,
    resetScore,
    recordGuess,
    startNewChallenge,
    loadScore
  }
}
