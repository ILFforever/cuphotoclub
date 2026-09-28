<script setup lang="ts">
// Results + presenter reveal, ported from CU_Photo_3000's VoteResults.
//
// Built to be put on a projector: press "Start the reveal", and 3rd → 2nd →
// 1st are announced one at a time behind a countdown, with confetti in the
// rank's colour. After the podium the full ranking is listed underneath.
//
// Each question has its own winners, so the reveal runs per question: pick
// one from the tabs, reveal it, move on to the next. Progress is kept per
// question, so switching back and forth never re-runs a finished reveal.
//
// Public once the competition is in its results phase; before that only
// admins can open it (the API refuses everyone else), so the reveal can be
// rehearsed without leaking the winners.
definePageMeta({ layout: false })

const { t } = useI18n()
const localePath = useLocalePath()
const route = useRoute()
const id = computed(() => String(route.params.id || ''))

interface ResultRow {
  id: string
  questionId: string
  title: string | null
  name: string
  groupName: string | null
  attendeeVotes: number
  judgeVotes: number
  score: number
  rank: number
  imageUrl: string
}

interface ResultsState {
  competition: { id: string, title: string, status: string, scoring: 'public' | 'judges' | 'both' }
  preview: boolean
  questions: { id: string, title: string }[]
  results: ResultRow[]
}

const { data, error } = await useFetch<ResultsState>(() => `/api/compete/${encodeURIComponent(id.value)}/results`, {
  key: () => `compete-results-${id.value}`
})

useHead(() => ({ title: data.value?.competition.title ? `${data.value.competition.title} · ${t('compete.results')}` : t('compete.results') }))

const REVEAL_ORDER = [3, 2, 1] as const
type PodiumRank = typeof REVEAL_ORDER[number]

const questions = computed(() => data.value?.questions ?? [])
const selectedQuestionId = ref<string | null>(null)
const activeQuestion = computed(() =>
  questions.value.find(question => question.id === selectedQuestionId.value) ?? questions.value[0] ?? null
)
const questionResults = computed(() =>
  (data.value?.results ?? []).filter(row => row.questionId === activeQuestion.value?.id)
)

// Top three distinct ranks with at least one point. Ties share a rank, so a
// rank can hold several photos.
const byRank = computed(() => {
  const map = new Map<number, ResultRow[]>()
  for (const row of questionResults.value) {
    if (row.rank > 3 || row.score <= 0) continue
    map.set(row.rank, [...(map.get(row.rank) ?? []), row])
  }
  return map
})
const revealQueue = computed(() => REVEAL_ORDER.filter(rank => byRank.value.has(rank)))
// Reveal progress, per question.
const progress = reactive<Record<string, { idx: number, current: PodiumRank | null }>>({})
function stateFor(questionId: string) {
  progress[questionId] ??= { idx: 0, current: null }
  return progress[questionId]
}
const revealIdx = computed({
  get: () => activeQuestion.value ? stateFor(activeQuestion.value.id).idx : 0,
  set: (value: number) => { if (activeQuestion.value) stateFor(activeQuestion.value.id).idx = value }
})
const currentRank = computed({
  get: () => activeQuestion.value ? stateFor(activeQuestion.value.id).current : null,
  set: (value: PodiumRank | null) => { if (activeQuestion.value) stateFor(activeQuestion.value.id).current = value }
})
function selectQuestion(id: string) {
  if (countdown.value) return
  selectedQuestionId.value = id
}
const allRevealed = computed(() => revealIdx.value >= revealQueue.value.length)
const nextRank = computed(() => revealQueue.value[revealIdx.value])
const hasResults = computed(() => byRank.value.size > 0)

// ── Countdown ───────────────────────────────────────────────────────────────
const countdown = ref<string | null>(null)
let timers: ReturnType<typeof setTimeout>[] = []

function startReveal() {
  const rank = nextRank.value
  if (!rank || countdown.value) return
  const steps: [string, number][] = [
    [t(`compete.revealIntro${rank}`), 1800],
    ['3', 800],
    ['2', 800],
    ['1', 800]
  ]
  let at = 0
  for (const [label, duration] of steps) {
    timers.push(setTimeout(() => { countdown.value = label }, at))
    at += duration
  }
  timers.push(setTimeout(() => {
    countdown.value = null
    currentRank.value = rank
    revealIdx.value++
    setTimeout(() => fireConfetti(rank), 350)
  }, at))
}

function showAll() {
  timers.forEach(clearTimeout)
  timers = []
  countdown.value = null
  revealIdx.value = revealQueue.value.length
  currentRank.value = null
}

// ── Confetti ────────────────────────────────────────────────────────────────
// A small canvas burst rather than a dependency: one screen, three moments.
const canvas = ref<HTMLCanvasElement | null>(null)
const CONFETTI_COLORS: Record<PodiumRank, string[]> = {
  1: ['#FFD700', '#FFA500', '#FFFACD', '#FFFFFF', '#E8186E'],
  2: ['#C0C0C0', '#E8E8E8', '#FFFFFF'],
  3: ['#CD7F32', '#E8A96A', '#FFFFFF']
}

interface Particle { x: number, y: number, vx: number, vy: number, rot: number, vr: number, size: number, color: string, life: number }
let particles: Particle[] = []
let frame = 0

function burst(originX: number, originY: number, count: number, speed: number, colors: string[]) {
  const el = canvas.value
  if (!el) return
  for (let i = 0; i < count; i++) {
    const angle = -Math.PI / 2 + (Math.random() - 0.5) * 1.4
    const velocity = speed * (0.5 + Math.random() * 0.6)
    particles.push({
      x: originX * el.width,
      y: originY * el.height,
      vx: Math.cos(angle) * velocity,
      vy: Math.sin(angle) * velocity,
      rot: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 0.3,
      size: 6 + Math.random() * 6,
      color: colors[Math.floor(Math.random() * colors.length)]!,
      life: 0
    })
  }
  if (!frame) frame = requestAnimationFrame(tick)
}

function tick() {
  const el = canvas.value
  const ctx = el?.getContext('2d')
  if (!el || !ctx) { frame = 0; return }
  ctx.clearRect(0, 0, el.width, el.height)
  particles = particles.filter(p => p.y < el.height + 40 && p.life < 360)
  for (const p of particles) {
    p.vy += 0.35
    p.vx *= 0.99
    p.x += p.vx
    p.y += p.vy
    p.rot += p.vr
    p.life++
    ctx.save()
    ctx.translate(p.x, p.y)
    ctx.rotate(p.rot)
    ctx.fillStyle = p.color
    ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2)
    ctx.restore()
  }
  frame = particles.length ? requestAnimationFrame(tick) : 0
}

function fireConfetti(rank: PodiumRank) {
  const colors = CONFETTI_COLORS[rank]
  if (rank === 1) {
    burst(0.1, 0.7, 120, 22, colors)
    burst(0.9, 0.7, 120, 22, colors)
    setTimeout(() => burst(0.5, 0.5, 120, 20, colors), 300)
  } else if (rank === 2) {
    burst(0.5, 0.7, 90, 18, colors)
  } else {
    burst(0.5, 0.7, 60, 15, colors)
  }
}

function resize() {
  if (!canvas.value) return
  canvas.value.width = window.innerWidth
  canvas.value.height = window.innerHeight
}

const lightbox = ref<ResultRow | null>(null)
function onKey(event: KeyboardEvent) {
  if (event.key === 'Escape') lightbox.value = null
}

onMounted(() => {
  resize()
  window.addEventListener('resize', resize)
  window.addEventListener('keydown', onKey)
})
onBeforeUnmount(() => {
  timers.forEach(clearTimeout)
  if (frame) cancelAnimationFrame(frame)
  window.removeEventListener('resize', resize)
  window.removeEventListener('keydown', onKey)
})

function scoreLine(row: ResultRow) {
  const scoring = data.value?.competition.scoring
  if (scoring === 'both') return t('compete.scoreBoth', { score: row.score, votes: row.attendeeVotes, judges: row.judgeVotes })
  if (scoring === 'judges') return t('compete.scoreJudges', { n: row.judgeVotes })
  return t('compete.scorePublic', { n: row.attendeeVotes })
}

const visibleRanks = computed(() => {
  if (!allRevealed.value) return currentRank.value ? [currentRank.value] : []
  // Everything revealed: show the podium winner-first.
  return [...revealQueue.value].reverse()
})
</script>

<template>
  <div class="vr">
    <canvas ref="canvas" class="vr__confetti" aria-hidden="true" />

    <div v-if="error || !data" class="vr__center">
      <p class="vr__eyebrow">{{ t('compete.results') }}</p>
      <h1 class="vr__title">{{ t('compete.resultsNotYet') }}</h1>
      <NuxtLink class="vr__btn vr__btn--ghost" :to="localePath(`/compete/${id}`)">{{ t('compete.back') }}</NuxtLink>
    </div>

    <template v-else>
      <p v-if="data.preview" class="vr__preview">{{ t('compete.previewBanner') }}</p>

      <header class="vr__head">
        <p class="vr__eyebrow"><span class="vr__cu">CU</span>PHOTOCLUB · {{ t('compete.results') }}</p>
        <h1 class="vr__title">{{ data.competition.title }}</h1>
        <p class="vr__sub">{{ t('compete.thanks') }}</p>
      </header>

      <nav v-if="questions.length > 1" class="vr__qtabs" :aria-label="t('compete.questions')">
        <button
          v-for="question in questions"
          :key="question.id"
          type="button"
          class="vr__qtab"
          :class="{ 'is-active': question.id === activeQuestion?.id }"
          :aria-pressed="question.id === activeQuestion?.id"
          @click="selectQuestion(question.id)"
        >
          {{ question.title }}
        </button>
      </nav>
      <h2 v-if="questions.length > 1 && activeQuestion" class="vr__question">{{ activeQuestion.title }}</h2>

      <p v-if="!hasResults" class="vr__empty">{{ t('compete.noResults') }}</p>

      <div class="vr__sections">
        <section
          v-for="rank in visibleRanks"
          :key="rank"
          class="vr__rank"
          :class="`vr__rank--${rank}`"
        >
          <h2 class="vr__rank-label">{{ t(`compete.rank${rank}`) }}</h2>
          <div class="vr__cards">
            <button
              v-for="row in byRank.get(rank)"
              :key="row.id"
              type="button"
              class="vr__card"
              @click="lightbox = row"
            >
              <img class="vr__img" :src="row.imageUrl" alt="">
              <span class="vr__info">
                <span v-if="row.title" class="vr__photo-title">{{ row.title }}</span>
                <span class="vr__by">{{ t('compete.by', { name: row.name }) }}<template v-if="row.groupName"> · {{ row.groupName }}</template></span>
                <span class="vr__score">{{ scoreLine(row) }}</span>
              </span>
            </button>
          </div>
        </section>
      </div>

      <div v-if="hasResults && !allRevealed && !countdown" class="vr__actions">
        <button type="button" class="vr__btn" @click="startReveal">
          {{ revealIdx === 0 ? t('compete.startReveal') : t('compete.revealNext', { rank: t(`compete.rank${nextRank}`) }) }}
        </button>
        <button type="button" class="vr__btn vr__btn--ghost" @click="showAll">{{ t('compete.skipReveal') }}</button>
      </div>

      <template v-if="allRevealed && hasResults">
        <p class="vr__congrats">{{ t('compete.congrats') }}</p>
        <section class="vr__table-wrap">
          <h2 class="vr__table-title">{{ t('compete.fullRanking') }}</h2>
          <ol class="vr__table">
            <li v-for="row in questionResults" :key="row.id" class="vr__row">
              <span class="vr__row-rank">{{ row.rank }}</span>
              <img class="vr__row-img" :src="row.imageUrl" alt="" loading="lazy">
              <span class="vr__row-main">
                <span class="vr__row-name">{{ row.title || t('compete.untitled') }}</span>
                <span class="vr__row-by">{{ row.name }}<template v-if="row.groupName"> · {{ row.groupName }}</template></span>
              </span>
              <span class="vr__row-score">{{ scoreLine(row) }}</span>
            </li>
          </ol>
        </section>
      </template>
    </template>

    <div v-if="countdown" class="vr__countdown" aria-live="assertive">
      <span :key="countdown" class="vr__countdown-text" :class="{ 'is-num': countdown.length === 1 }">{{ countdown }}</span>
    </div>

    <div v-if="lightbox" class="vr__lightbox" role="dialog" aria-modal="true" @click="lightbox = null">
      <img :src="lightbox.imageUrl" alt="" @click.stop>
    </div>
  </div>
</template>

<style scoped>
.vr {
  min-height: 100vh;
  background: radial-gradient(ellipse at top, #2A1A24 0%, var(--hero-bg) 60%);
  color: #F5F4F0;
  padding: 2.5rem 1rem 4rem;
}
.vr__confetti { position: fixed; inset: 0; pointer-events: none; z-index: 60; }
.vr__center { min-height: 80vh; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 1rem; text-align: center; }
.vr__preview {
  max-width: 44rem;
  margin: 0 auto 1.5rem;
  border-left: 2px solid var(--accent);
  background: rgba(245, 244, 240, 0.06);
  padding: 0.6rem 0.9rem;
  font-family: var(--font-sans);
  font-size: 0.78rem;
}
.vr__head { text-align: center; margin-bottom: 2.5rem; }
.vr__eyebrow {
  font-family: var(--font-latin-sans);
  font-size: 0.6rem;
  letter-spacing: 0.24em;
  text-transform: uppercase;
  color: rgba(245, 244, 240, 0.6);
}
.vr__cu { color: var(--accent); }
.vr__title {
  font-family: var(--font-serif);
  font-size: clamp(2rem, 6vw, 4rem);
  font-weight: 300;
  line-height: 1.05;
  margin-top: 0.6rem;
}
.vr__sub { font-family: var(--font-sans); font-size: 0.85rem; color: rgba(245, 244, 240, 0.6); margin-top: 0.6rem; }
.vr__qtabs { display: flex; flex-wrap: wrap; justify-content: center; gap: 0.5rem; margin: -1rem auto 1.5rem; max-width: 1000px; }
.vr__qtab {
  border: 1px solid rgba(245, 244, 240, 0.25);
  background: transparent;
  color: rgba(245, 244, 240, 0.75);
  padding: 0.5rem 1rem;
  font-family: var(--font-sans);
  font-size: 0.8rem;
  cursor: pointer;
}
.vr__qtab.is-active { background: var(--accent); border-color: var(--accent); color: #fff; }
.vr__question {
  text-align: center;
  font-family: var(--font-serif);
  font-size: clamp(1.4rem, 3.5vw, 2.2rem);
  font-weight: 300;
  margin-bottom: 2rem;
  color: rgba(245, 244, 240, 0.9);
}
.vr__empty { text-align: center; font-family: var(--font-sans); color: rgba(245, 244, 240, 0.6); }

.vr__sections { display: flex; flex-direction: column; gap: 3rem; max-width: 1200px; margin: 0 auto; }
.vr__rank { animation: vr-rise 0.7s ease both; text-align: center; }
.vr__rank-label {
  display: inline-block;
  font-family: var(--font-serif);
  font-size: clamp(1.6rem, 4vw, 2.6rem);
  font-weight: 400;
  margin-bottom: 1.2rem;
  padding: 0.2rem 1.2rem;
  border-bottom: 2px solid currentColor;
}
.vr__rank--1 .vr__rank-label { color: #FFD700; }
.vr__rank--2 .vr__rank-label { color: #D8D8D8; }
.vr__rank--3 .vr__rank-label { color: #E0A060; }
.vr__cards { display: flex; flex-wrap: wrap; justify-content: center; gap: 1.2rem; }
.vr__card {
  border: 0;
  padding: 0;
  background: rgba(245, 244, 240, 0.05);
  color: inherit;
  cursor: zoom-in;
  width: min(100%, 560px);
  display: flex;
  flex-direction: column;
  text-align: left;
}
.vr__rank--1 .vr__card { box-shadow: 0 0 0 2px #FFD700, 0 0 60px rgba(255, 215, 0, 0.25); }
.vr__rank--2 .vr__card { box-shadow: 0 0 0 2px #D8D8D8; }
.vr__rank--3 .vr__card { box-shadow: 0 0 0 2px #E0A060; }
.vr__img { display: block; width: 100%; max-height: 60vh; object-fit: contain; background: #000; }
.vr__info { display: flex; flex-direction: column; gap: 0.25rem; padding: 0.8rem 1rem 1rem; }
.vr__photo-title { font-family: var(--font-serif); font-size: 1.3rem; }
.vr__by { font-family: var(--font-sans); font-size: 0.85rem; color: rgba(245, 244, 240, 0.8); }
.vr__score { font-family: var(--font-sans); font-size: 0.72rem; color: rgba(245, 244, 240, 0.55); }

.vr__actions { display: flex; justify-content: center; gap: 0.8rem; flex-wrap: wrap; margin-top: 3rem; }
.vr__btn {
  border: 1px solid var(--accent);
  background: var(--accent);
  color: #fff;
  padding: 1rem 2rem;
  font-family: var(--font-sans);
  font-size: 0.75rem;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  text-decoration: none;
  cursor: pointer;
}
.vr__btn--ghost { background: transparent; border-color: rgba(245, 244, 240, 0.3); color: rgba(245, 244, 240, 0.75); }
.vr__congrats { text-align: center; font-family: var(--font-serif); font-size: 1.5rem; margin: 3rem 0 2rem; }

.vr__table-wrap { max-width: 900px; margin: 0 auto; }
.vr__table-title {
  font-family: var(--font-sans);
  font-size: 0.6rem;
  letter-spacing: 0.22em;
  text-transform: uppercase;
  color: rgba(245, 244, 240, 0.55);
  margin-bottom: 0.8rem;
}
.vr__table { list-style: none; margin: 0; padding: 0; }
.vr__row {
  display: grid;
  grid-template-columns: 2.2rem 64px minmax(0, 1fr) auto;
  gap: 0.9rem;
  align-items: center;
  padding: 0.6rem 0;
  border-top: 1px solid rgba(245, 244, 240, 0.1);
  font-family: var(--font-sans);
}
.vr__row-rank { font-family: var(--font-latin-sans); font-size: 1rem; color: rgba(245, 244, 240, 0.7); text-align: right; }
.vr__row-img { width: 64px; height: 48px; object-fit: cover; background: rgba(245, 244, 240, 0.06); }
.vr__row-main { display: flex; flex-direction: column; min-width: 0; }
.vr__row-name { font-size: 0.85rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.vr__row-by { font-size: 0.72rem; color: rgba(245, 244, 240, 0.55); }
.vr__row-score { font-size: 0.72rem; color: rgba(245, 244, 240, 0.7); text-align: right; }

.vr__countdown {
  position: fixed;
  inset: 0;
  z-index: 50;
  background: rgba(8, 8, 7, 0.92);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
}
.vr__countdown-text {
  font-family: var(--font-serif);
  font-size: clamp(2rem, 6vw, 4.5rem);
  font-weight: 300;
  text-align: center;
  animation: vr-pop 0.5s ease both;
}
.vr__countdown-text.is-num { font-family: var(--font-latin-serif); font-size: clamp(6rem, 25vw, 16rem); color: var(--accent); }

.vr__lightbox {
  position: fixed;
  inset: 0;
  z-index: 70;
  background: rgba(8, 8, 7, 0.95);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
  cursor: zoom-out;
}
.vr__lightbox img { max-width: 100%; max-height: 100%; object-fit: contain; }

@keyframes vr-rise {
  from { opacity: 0; transform: translateY(30px) scale(0.97); }
  to { opacity: 1; transform: none; }
}
@keyframes vr-pop {
  from { opacity: 0; transform: scale(0.6); }
  to { opacity: 1; transform: none; }
}

@media (max-width: 600px) {
  .vr__row { grid-template-columns: 1.6rem 48px minmax(0, 1fr); }
  .vr__row-img { width: 48px; height: 36px; }
  .vr__row-score { grid-column: 3; text-align: left; }
}

@media (prefers-reduced-motion: reduce) {
  .vr__rank, .vr__countdown-text { animation: none; }
}
</style>
