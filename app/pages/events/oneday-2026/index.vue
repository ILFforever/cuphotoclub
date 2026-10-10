<script setup lang="ts">
// Details page for Basic Control & One Day Trip 2026 (temporary, unlisted).
// No full AP here (that's the live page's job); the header carries the photo
// under a dark gradient. "Happening now" reads the same live AP
// as /live. One tab per day, opening on today's (same rule as the live page);
// #bc / #odt in the URL opens a given tab. See shared/oneday2026.ts for how to
// take the event down.
import type { OnedayDay } from '~~/shared/oneday2026'
import { bangkokNow, ONEDAY_DAYS, ONEDAY_ROTATION, ONEDAY_STATIONS, ONEDAY_STOPS } from '~~/shared/oneday2026'

definePageMeta({ layout: 'site' })

const { t, locale } = useI18n()
const localePath = useLocalePath()
useSeoMeta({
  title: () => t('oneday.info.pageTitle'),
  description: () => t('oneday.info.lead'),
  robots: 'noindex, nofollow'
})

const { data: ap } = await useOnedayAp()
const now = useOnedayClock()
const lang = computed<OnedayLang>(() => (locale.value === 'th' ? 'th' : 'en'))
const ROUNDS = [['13:25', '13:45'], ['13:55', '14:15'], ['14:25', '14:45'], ['14:55', '15:15'], ['15:25', '15:45']]

// One colour per station, taken from what it teaches; used for the card wash
// and the station labels in the route so the two read as the same thing.
const STATION_HUES: Record<number, string> = {
  1: '#3E8E5A', // Macro: leaf green
  2: '#B7860B', // Flash: amber
  3: '#2F6FB3', // Shutter Speed: motion blue
  4: '#1F8A8A', // Landscape: teal
  5: '#E8186E' // Portrait: club pink
}
const hue = (n: number) => ({ '--st': STATION_HUES[n] })

// Workshop group — the same stored value the live page uses, so picking it
// once works on both pages.
const GROUP_KEY = 'oneday2026-group'
const group = ref(0)
function setGroup(g: number) {
  group.value = g
  try { localStorage.setItem(GROUP_KEY, String(g)) } catch { /* not remembered */ }
}
const route = computed(() => {
  const row = ONEDAY_ROTATION[group.value - 1]
  if (!row) return []
  return row.map((n, r) => ({ round: r + 1, time: ROUNDS[r]!, station: ONEDAY_STATIONS[n - 1]! }))
})
const DAYS: OnedayDay[] = ['bc', 'odt']
const DAY_INFO: Record<OnedayDay, { date: string, where: string, points: string[] }> = {
  bc: { date: '10', where: 'oneday.info.bcWhere', points: ['oneday.info.bcPoint1', 'oneday.info.bcPoint2'] },
  odt: { date: '11', where: 'oneday.info.odtWhere', points: ['oneday.info.odtPoint1', 'oneday.info.odtPoint2'] }
}

const day = ref<OnedayDay>(defaultOnedayDay(now.value))
const todayDate = computed(() => bangkokNow(now.value).date)

function selectDay(d: OnedayDay, focus = false) {
  day.value = d
  if (import.meta.client) {
    history.replaceState(history.state, '', `#${d}`)
    if (focus) nextTick(() => document.getElementById(`oneday-tab-${d}`)?.focus())
  }
}
// Left/right arrows move between the two tabs (WAI-ARIA tabs pattern).
function onTabKey(e: KeyboardEvent) {
  if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
  e.preventDefault()
  selectDay(day.value === 'bc' ? 'odt' : 'bc', true)
}
onMounted(() => {
  const h = location.hash.slice(1)
  if (h === 'bc' || h === 'odt') day.value = h
  try {
    const g = Number(localStorage.getItem(GROUP_KEY))
    if (g >= 1 && g <= 5) group.value = g
  } catch { /* storage blocked */ }
})

const labels = computed(() => ({
  round: (n: number) => t('oneday.live.round', { n }),
  rotate: t('oneday.live.rotate'),
  walkTo: (n: number, name: string) => t('oneday.live.walkTo', { n, name }),
  walkNext: t('oneday.live.walkNext')
}))

const views = computed(() => {
  if (!ap.value) return null
  const opts = { at: now.value, lang: lang.value, group: 0, staff: false, labels: labels.value }
  return {
    bc: buildOnedayDay(ap.value, 'bc', opts),
    odt: buildOnedayDay(ap.value, 'odt', opts)
  }
})

const tripRoute = onedayTripRouteUrls(useRuntimeConfig().public.googleMapsEmbedKey || '')

const announcement = computed(() => {
  const a = ap.value?.control.announcement
  return a ? (a[lang.value] || a.th) : ''
})
const announcementLevel = computed(() => ap.value?.control.announcementLevel ?? 'info')

// "Happening now" in the header, only while one of the days is running.
const live = computed(() => {
  const v = views.value
  if (!v) return null
  const today = v[defaultOnedayDay(now.value)]
  return today.relation === 'today' && today.phase === 'during' && today.current ? today.current : null
})
</script>

<template>
  <article class="od">
    <header class="odh" data-chrome-header>
      <img class="odh__photo" src="/events/oneday-2026/bushbuck.jpg" alt="" aria-hidden="true" width="1280" height="853" fetchpriority="high">
      <div class="odh__inner">
        <div class="odh__text">
          <h1 class="odh__title" data-chrome-glass>{{ t('oneday.title') }}</h1>
          <p class="odh__lead">{{ t('oneday.info.lead') }}</p>
          <p class="odh__meta">{{ t('oneday.info.count', { participants: 50, staff: 25 }) }}</p>
        </div>
        <NuxtLink :to="localePath('/events/oneday-2026/live')" class="live-card">
            <span class="live-card__k">
              <span v-if="live" class="live-card__dot" aria-hidden="true" />
              {{ live ? t('oneday.info.happeningNow') : t('oneday.live.pageTitle') }}
            </span>
            <span v-if="live" class="live-card__now"><span class="num">{{ live.shownStart }}–{{ live.shownEnd }}</span> · {{ live.text.title }}</span>
            <span class="live-card__cta">{{ t('oneday.info.openLive') }}</span>
        </NuxtLink>
      </div>

      <div class="odh__tabs" role="tablist" :aria-label="t('oneday.live.dayLabel')" @keydown="onTabKey">
        <button
          v-for="d in DAYS"
          :id="`oneday-tab-${d}`"
          :key="d"
          type="button"
          role="tab"
          class="dtab"
          :aria-selected="day === d"
          :aria-controls="`oneday-panel-${d}`"
          :tabindex="day === d ? 0 : -1"
          @click="selectDay(d)"
        >
          <span class="dtab__date">
            {{ t(`oneday.days.${d}`) }}
            <span v-if="ONEDAY_DAYS[d].date === todayDate" class="dtab__today">{{ t('oneday.live.today') }}</span>
          </span>
          <span class="dtab__name">{{ ONEDAY_DAYS[d].name[lang] }}</span>
        </button>
      </div>
    </header>

    <div
      :id="`oneday-panel-${day}`"
      class="body"
      role="tabpanel"
      :aria-labelledby="`oneday-tab-${day}`"
    >
      <section class="intro">
        <p class="intro__date">{{ DAY_INFO[day].date }}<small>{{ t(`oneday.info.weekday.${day}`) }}</small></p>
        <div class="intro__text">
          <h2 class="intro__name">{{ ONEDAY_DAYS[day].name[lang] }}</h2>
          <p class="intro__where">{{ t(DAY_INFO[day].where) }}</p>
          <ul class="intro__list">
            <li v-for="k in DAY_INFO[day].points" :key="k">{{ t(k) }}</li>
          </ul>
        </div>
      </section>

      <template v-if="day === 'bc'">
        <section class="sec">
          <h2 class="sec__h">{{ t('oneday.info.route') }}</h2>
          <p class="sec__lead">{{ t('oneday.info.stationsLead') }}</p>
          <div class="groups" role="group" :aria-label="t('oneday.live.yourGroup')">
            <button
              v-for="g in 5"
              :key="g"
              type="button"
              class="groups__btn"
              :aria-pressed="group === g"
              @click="setGroup(g)"
            >{{ t('oneday.info.groupN', { n: g }) }}</button>
          </div>
          <p v-if="!group" class="route__hint">{{ t('oneday.live.pickGroup') }}</p>
          <ol v-else class="route">
            <li v-for="r in route" :key="r.round" class="route__row" :style="hue(r.station.n)">
              <p class="route__when">
                <span class="num route__time">{{ r.time[0] }}–{{ r.time[1] }}</span>
                <span class="route__round">{{ t('oneday.live.round', { n: r.round }) }}</span>
              </p>
              <div class="route__what">
                <p class="route__station">
                  <span class="route__n">{{ t('oneday.info.stationN', { n: r.station.n }) }}</span>
                  {{ r.station.name }}
                </p>
                <p class="route__place">{{ r.station.place[lang] }}</p>
                <p class="route__hosts">{{ t('oneday.live.hosts') }}: {{ r.station.hosts }}</p>
              </div>
            </li>
          </ol>
        </section>

        <section class="sec">
          <h2 class="sec__h">{{ t('oneday.info.stations') }}</h2>
          <div class="stations">
            <div v-for="st in ONEDAY_STATIONS" :key="st.n" class="stations__cell" :style="hue(st.n)">
              <p class="stations__n">{{ st.n }}</p>
              <p class="stations__name">{{ st.name }}</p>
              <p class="stations__place">{{ st.place[lang] }}</p>
              <p class="stations__hosts">{{ t('oneday.live.hosts') }}<span>{{ st.hosts }}</span></p>
            </div>
          </div>
        </section>
      </template>

      <template v-else>
        <section class="sec">
          <h2 class="sec__h">{{ t('oneday.info.stops') }}</h2>
          <div class="stops">
            <div v-for="st in ONEDAY_STOPS" :key="st.time" class="stops__item">
              <p class="num stops__t">{{ st.time }}</p>
              <h3 class="stops__name">{{ st.name[lang] }}</h3>
              <p class="stops__note">{{ st.note[lang] }}</p>
              <a :href="st.map" target="_blank" rel="noopener" class="stops__map">{{ t('oneday.info.map') }}</a>
            </div>
          </div>
        </section>

        <section class="sec">
          <h2 class="sec__h">{{ t('oneday.info.tripRoute') }}</h2>
          <p class="sec__lead">{{ t('oneday.info.tripRouteLead') }}</p>
          <div class="map">
            <iframe
              class="map__frame"
              :src="tripRoute.embed"
              :title="t('oneday.info.tripRoute')"
              loading="lazy"
              referrerpolicy="no-referrer-when-downgrade"
              allowfullscreen
            />
          </div>
          <a :href="tripRoute.open" target="_blank" rel="noopener" class="map__open">{{ t('oneday.info.openRoute') }}</a>
        </section>

        <section class="sec">
          <h2 class="sec__h">{{ t('oneday.info.rules') }}</h2>
          <ul class="rules">
            <li>{{ t('oneday.info.rule1') }}</li>
            <li>{{ t('oneday.info.rule2') }}</li>
            <li>{{ t('oneday.info.rule3') }}</li>
            <li>{{ t('oneday.info.rule4') }}</li>
          </ul>
        </section>
      </template>
    </div>

    <OnedayAnnouncement :text="announcement" :level="announcementLevel" />
    <OnedayWelcome />
  </article>
</template>

<style scoped>
.od { background: var(--body-bg); color: var(--dark); min-height: 100vh; }
.num { font-family: var(--font-latin-sans); font-variant-numeric: tabular-nums; }

/* ── Header: slim and text-only; dark so the site nav reads over it.
   Named odh__*, not hero__*: main.css resizes .hero__title in Thai. ── */
.odh {
  position: relative;
  overflow: hidden;
  background: var(--hero-bg);
  color: #F5F4F0;
  border-bottom: 2px solid var(--accent);
}
.odh__photo {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: 62% 38%;
}
/* Dark on the text side and along the bottom (tabs, site nav at the top),
   letting the bushbuck pair show through on the right. */
.odh::after {
  content: '';
  position: absolute;
  inset: 0;
  background:
    linear-gradient(to right, rgba(12, 12, 10, 0.94) 0%, rgba(12, 12, 10, 0.82) 38%, rgba(12, 12, 10, 0.35) 72%, rgba(12, 12, 10, 0.2) 100%),
    linear-gradient(to bottom, rgba(12, 12, 10, 0.55) 0%, rgba(12, 12, 10, 0) 30%, rgba(12, 12, 10, 0) 60%, rgba(12, 12, 10, 0.85) 100%);
}
.odh__inner, .odh__tabs { position: relative; z-index: 1; }
.odh__inner {
  width: min(100%, 1180px);
  margin: 0 auto;
  padding: 7.5rem 3rem 2.2rem;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: end;
  gap: 2rem 3rem;
}
.odh__text { display: flex; flex-direction: column; gap: 1rem; min-width: 0; }
.odh__title {
  font: 200 clamp(2.2rem, 5vw, 3.8rem)/1 var(--font-serif);
  letter-spacing: -0.02em;
  max-width: 20ch;
  text-wrap: balance;
}
.odh__lead { max-width: 40rem; font-size: 0.92rem; line-height: 1.7; color: rgba(245, 244, 240, 0.78); }
.odh__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem 1.8rem;
  margin-top: 0.4rem;
  font-size: 0.78rem;
  color: rgba(245, 244, 240, 0.62);
}
.live-card {
  background: var(--accent);
  border: 1px solid var(--accent);
  padding: 1rem 1.2rem;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  width: min(100%, 19rem);
  color: #fff;
  text-decoration: none;
  box-shadow: 0 14px 34px rgba(0, 0, 0, 0.35);
  transition: background 0.2s, border-color 0.2s, transform 0.2s;
}
.live-card:hover { background: #C9105C; border-color: #C9105C; }
.live-card:active { transform: translateY(1px); }
.live-card:focus-visible { outline: 2px solid #F5F4F0; outline-offset: 4px; }
.live-card__k {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.58rem;
  letter-spacing: 0.22em;
  text-transform: uppercase;
  color: rgba(255, 255, 255, 0.85);
}
.live-card__dot { width: 7px; height: 7px; border-radius: 50%; background: #fff; animation: pulse 1.6s infinite; }
@keyframes pulse { 50% { opacity: 0.25; } }
.live-card__now { font-size: 0.95rem; font-weight: 500; }
.live-card__cta { font-size: 0.8rem; text-decoration: underline; text-decoration-color: rgba(255, 255, 255, 0.6); text-underline-offset: 0.25em; }

/* ── Body ── */
.body {
  width: min(100%, 1180px);
  margin: 0 auto;
  padding: 3.5rem 3rem 5rem;
  display: flex;
  flex-direction: column;
  gap: 3.5rem;
}
.sec__h {
  font-family: var(--font-serif);
  font-size: clamp(1.5rem, 2.6vw, 2rem);
  font-weight: 300;
  line-height: 1.15;
  margin-bottom: 1.2rem;
}
.sec__lead { font-size: 0.86rem; color: var(--muted); margin: -0.6rem 0 1.2rem; max-width: 60ch; }
.sec__sub { font-family: var(--font-serif); font-weight: 300; font-size: 1.25rem; margin: 2.4rem 0 0.8rem; }

/* ── Day tabs (in the dark header) ── */
.odh__tabs {
  width: min(100%, 1180px);
  margin: 0 auto;
  padding: 0 3rem;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 14rem));
  gap: 1.5rem;
}
.dtab {
  text-align: left;
  padding: 0.6rem 0 0.85rem;
  border: 0;
  border-bottom: 3px solid transparent;
  background: none;
  color: rgba(245, 244, 240, 0.5);
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  transition: color 0.2s, border-color 0.2s;
}
.dtab:hover { color: rgba(245, 244, 240, 0.85); }
.dtab[aria-selected="true"] { color: #F5F4F0; border-bottom-color: var(--accent); }
.dtab:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
.dtab__date { font-size: 0.72rem; display: flex; gap: 0.6rem; align-items: center; }
.dtab__today { color: var(--accent); font-weight: 500; }
.dtab__name { font-family: var(--font-serif); font-size: 1.3rem; font-weight: 300; }

/* ── Day intro ── */
.intro {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 0.5rem 2.4rem;
  align-items: start;
}
.intro__date { font: 200 5rem/0.9 var(--font-serif); display: flex; flex-direction: column; }
.intro__date small { font-family: var(--font-sans); font-size: 0.82rem; color: var(--muted); margin-top: 0.6rem; }
.intro__name { font-family: var(--font-serif); font-weight: 300; font-size: clamp(1.8rem, 3.2vw, 2.4rem); line-height: 1.1; }
.intro__where { font-size: 0.84rem; color: var(--muted); margin: 0.35rem 0 1rem; }
.intro__list { padding-left: 1rem; list-style: disc; font-size: 0.92rem; line-height: 1.65; display: grid; gap: 0.35rem; max-width: 62ch; }

.stations { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 1px; background: var(--subtle); border: 1px solid var(--subtle); }
.stations__cell {
  --st: var(--accent);
  background:
    linear-gradient(165deg, color-mix(in srgb, var(--st) 22%, var(--body-bg)) 0%, color-mix(in srgb, var(--st) 7%, var(--body-bg)) 45%, var(--body-bg) 85%);
  border-top: 3px solid var(--st);
  padding: 1rem;
  min-width: 0;
  display: flex;
  flex-direction: column;
}
.stations__n { font: 200 2.2rem/1 var(--font-serif); color: color-mix(in srgb, var(--st) 85%, var(--dark)); }
.stations__name { font-weight: 500; margin-top: 0.5rem; }
.stations__place { font-size: 0.78rem; color: var(--muted); margin-bottom: 0.8rem; }
.stations__hosts {
  margin-top: auto;
  padding-top: 0.6rem;
  border-top: 1px solid color-mix(in srgb, var(--st) 25%, var(--subtle));
  font-size: 0.72rem;
  color: var(--muted);
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
}
.stations__hosts span { font-size: 0.88rem; color: var(--dark); }

/* ── Your group's route ── */
.groups {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  max-width: 34rem;
  border: 1px solid var(--subtle);
  background: var(--subtle);
  gap: 1px;
}
.groups__btn {
  min-height: 2.75rem;
  border: 0;
  background: var(--body-bg);
  color: var(--dark);
  font-size: 0.86rem;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}
.groups__btn:hover { color: var(--accent); }
.groups__btn[aria-pressed="true"] { background: var(--dark); color: #F5F4F0; }
.groups__btn:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
.route__hint { margin-top: 1rem; font-size: 0.86rem; color: var(--muted); }
.route { list-style: none; padding: 0; margin: 1.4rem 0 0; max-width: 46rem; border-top: 1px solid var(--subtle); }
.route__row {
  display: grid;
  grid-template-columns: 8.5rem minmax(0, 1fr);
  gap: 1.2rem;
  padding: 1rem 0;
  border-bottom: 1px solid var(--subtle);
}
.route__when { display: flex; flex-direction: column; gap: 0.2rem; }
.route__time { font-size: 0.95rem; }
.route__round { font-size: 0.78rem; color: var(--muted); }
.route__station { font-family: var(--font-serif); font-size: 1.2rem; font-weight: 400; line-height: 1.3; }
.route__row { --st: var(--accent); }
.route__n { color: color-mix(in srgb, var(--st) 85%, var(--dark)); font-family: var(--font-sans); font-size: 0.82rem; font-weight: 500; margin-right: 0.4rem; vertical-align: 0.1em; }
.route__place { font-size: 0.86rem; margin-top: 0.15rem; }
.route__hosts { font-size: 0.78rem; color: var(--muted); }

/* ── Sunday's route ── */
.map {
  position: relative;
  aspect-ratio: 16 / 9;
  max-width: 100%;
  border: 1px solid var(--subtle);
  background: var(--paper);
}
.map__frame { position: absolute; inset: 0; width: 100%; height: 100%; border: 0; }
.map__open {
  display: inline-flex;
  align-items: center;
  margin-top: 1rem;
  min-height: 2.9rem;
  padding: 0 1.3rem;
  background: var(--dark);
  color: #F5F4F0;
  font-size: 0.86rem;
  text-decoration: none;
  transition: background 0.2s;
}
.map__open:hover { background: var(--accent); }
.map__open:focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; }

.stops { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 1.4rem; }
.stops__item { border-top: 2px solid var(--dark); padding-top: 0.8rem; min-width: 0; }
.stops__t { color: var(--accent); font-size: 0.78rem; font-weight: 500; }
.stops__name { font-family: var(--font-serif); font-weight: 400; font-size: 1.15rem; margin: 0.3rem 0; }
.stops__note { font-size: 0.82rem; color: var(--muted); line-height: 1.55; margin-bottom: 0.5rem; }
.stops__map { font-size: 0.8rem; color: var(--dark); text-decoration-color: var(--accent); text-underline-offset: 0.25em; }
.stops__map:hover { color: var(--accent); }
.stops__map:focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; }

.rules { list-style: none; padding: 0; margin: 0; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0.8rem 2.4rem; font-size: 0.9rem; line-height: 1.55; }
.rules li { padding-left: 1.4rem; position: relative; }
.rules li::before { content: '!'; position: absolute; left: 0; color: var(--accent); font: 600 1.05rem/1.4 var(--font-serif); }

@media (max-width: 900px) {
  .stations { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .stops { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
@media (max-width: 640px) {
  .body { padding: 2.5rem 1rem 4rem; gap: 2.6rem; }
  .odh__inner { padding: 6rem 1rem 1.6rem; grid-template-columns: minmax(0, 1fr); }
  .odh__photo { object-position: 70% 30%; }
  .odh::after {
    background: linear-gradient(to bottom, rgba(12, 12, 10, 0.55) 0%, rgba(12, 12, 10, 0.72) 35%, rgba(12, 12, 10, 0.92) 70%, var(--hero-bg) 100%);
  }
  .stops, .rules { grid-template-columns: minmax(0, 1fr); }
  .route__row { grid-template-columns: minmax(0, 1fr); gap: 0.4rem; }
  .map { aspect-ratio: 4 / 5; }
  .route__when { flex-direction: row; gap: 0.8rem; align-items: baseline; }
  .odh__tabs { padding: 0 1rem; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 1rem; }
  .intro { grid-template-columns: minmax(0, 1fr); }
  .intro__date { flex-direction: row; align-items: baseline; gap: 0.8rem; font-size: 3.6rem; }
}
@media (prefers-reduced-motion: reduce) {
  .live-card__dot { animation: none; }
}

/* Thai has no case and spaced-out letters break up words — same rule as the
   site-wide Thai override in main.css, for this page's own label classes. */
html:lang(th) .live-card__k {
  letter-spacing: 0.035em;
  text-transform: none;
}
</style>
