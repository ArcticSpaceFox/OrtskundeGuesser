import { defineStore } from 'pinia'
import { computed } from 'vue'

const SCORE_KEY = 'gg:score'

export const useGameStore = defineStore('game', {
  state: () => ({
    // Game modes
    showAddresses: true,
    showNursingHomes: true,
    showVillages: true,

    // Score and rounds
    totalScore: 0,
    roundsPlayed: 0,
    roundsCounted: 0,
    lastPoints: null,

    // Challenge state
    challenge: null,
    showAnswer: false,
    distanceKm: null,
    message: '',

    // UI state
    showSettings: false
  }),

  getters: {
    progressFraction: (state) => {
      if (state.distanceKm == null) return 0
      const frac = 1 - Math.min(state.distanceKm / 0.5, 1)
      return Math.max(0, Math.min(1, frac))
    },

    progressPercent: (state) => {
      if (state.distanceKm == null) return 0
      const frac = 1 - Math.min(state.distanceKm / 0.5, 1)
      const progressFraction = Math.max(0, Math.min(1, frac))
      return Math.round(progressFraction * 100)
    },

    progressColor: (state) => {
      if (state.distanceKm == null) return '#888'
      if (state.distanceKm > 0.5) return '#dc2626' // red-600
      if (state.distanceKm <= 0.1) return '#16a34a' // green-600
      return '#f59e0b' // amber-400
    }
  },

  actions: {
    loadScore() {
      try {
        const raw = localStorage.getItem(SCORE_KEY)
        if (!raw) return
        const p = JSON.parse(raw)
        this.totalScore = p.totalScore || 0
        this.roundsPlayed = p.roundsPlayed || 0
        this.roundsCounted = p.roundsCounted || 0
      } catch (e) {}
    },

    saveScore() {
      try {
        localStorage.setItem(
          SCORE_KEY,
          JSON.stringify({
            totalScore: this.totalScore,
            roundsPlayed: this.roundsPlayed,
            roundsCounted: this.roundsCounted
          })
        )
      } catch (e) {}
    },

    resetScore() {
      this.totalScore = 0
      this.roundsPlayed = 0
      this.roundsCounted = 0
      this.lastPoints = null
      try {
        localStorage.removeItem(SCORE_KEY)
      } catch (e) {}
    },

    recordGuess(distanceValue) {
      this.distanceKm = distanceValue
      this.roundsPlayed = (this.roundsPlayed || 0) + 1
      let points = 0

      if (distanceValue <= 0.5) {
        // Ease-out curve: steep near 0, flattens towards 0.5km
        // 0km = 100 points, 0.1km = ~99 points, 0.5km = 0 points
        const normalizedDistance = distanceValue / 0.5
        const easeOutFactor = 1 - (normalizedDistance * normalizedDistance)
        points = Math.round(Math.max(0, easeOutFactor * 100))
        this.totalScore = (this.totalScore || 0) + points
        this.roundsCounted = (this.roundsCounted || 0) + 1
      }

      this.lastPoints = points
      this.saveScore()
      this.showAnswer = true

      return points
    },

    startNewChallenge(newChallenge) {
      this.challenge = newChallenge
      this.showAnswer = false
      this.message = 'Klicke auf die Karte, um zu raten.'
      this.distanceKm = null
    },

    init() {
      this.loadScore()
    }
  }
})
