<script setup lang="ts">
// Live AP for Basic Control & One Day Trip 2026 — used by /events/oneday-2026/live
// (participants) and /events/oneday-2026/staff (adds staff-only rows, owners
// and kit). One tab per day; it opens on today's tab. Built for a phone on a
// moving bus: what's on now, what's next, and a red banner for every bus call.
import type { OnedayDay } from '~~/shared/oneday2026'
import { ONEDAY_DAYS, ONEDAY_GROUP_LEADERS, ONEDAY_STAFF_ROLES, bangkokNow, fromMinutes, stationFor } from '~~/shared/oneday2026'

const props = defineProps<{ staff?: boolean }>()

const { t, locale } = useI18n()
const localePath = useLocalePath()
const switchLocalePath = useSwitchLocalePath()

const { data: ap } = await useOnedayAp()
const now = useOnedayClock()

const DAYS: OnedayDay[] = ['bc', 'odt']
const lang = computed<OnedayLang>(() => (locale.value === 'th' ? 'th' : 'en'))
const day = ref<OnedayDay>(defaultOnedayDay(now.value))
const todayDate = computed(() => bangkokNow(now.value).date)

// Workshop group, remembered on this phone.
const GROUP_KEY = 'oneday2026-group'
const group = ref(0)
onMounted(() => {
  try {
    const g = Number(localStorage.getItem(GROUP_KEY))
    if (g >= 1 && g <= 5) group.value = g
  } catch { /* storage blocked — group just isn't remembered */ }
})
function setGroup(g: number) {
  group.value = g
  try { localStorage.setItem(GROUP_KEY, String(g)) } catch { /* ignore */ }
}

const labels = computed(() => ({
  round: (n: number) => t('oneday.live.round', { n }),
  rotate: t('oneday.live.rotate'),
  walkTo: (n: number, name: string) => t('oneday.live.walkTo', { n, name }),
  walkNext: t('oneday.live.walkNext')
}))

const view = computed(() => ap.value
  ? buildOnedayDay(ap.value, day.value, { at: now.value, lang: lang.value, group: group.value, staff: !!props.staff, labels: labels.value })
  : null)

const current = computed(() => view.value?.current ?? null)
const next = computed(() => view.value?.next ?? null)
const comingUp = computed(() => {
  const v = view.value
  if (!v) return []
  return v.items.filter(i => i.startMin > v.nowMin && i !== v.next).slice(0, 3)
})
const progress = computed(() => {
  const c = current.value
  if (!c || !view.value) return 0
  return Math.min(100, Math.max(0, ((view.value.nowMin - c.startMin) / Math.max(1, c.endMin - c.startMin)) * 100))
})
const minLeft = computed(() => (current.value && view.value ? current.value.endMin - view.value.nowMin : 0))
const nextIn = computed(() => (next.value && view.value ? next.value.startMin - view.value.nowMin : 0))

const announcement = computed(() => {
  const a = ap.value?.control.announcement
  return a ? (a[lang.value] || a.th) : ''
})
const announcementLevel = computed(() => ap.value?.control.announcementLevel ?? 'info')
const delayText = computed(() => {
  const d = view.value?.delayMinutes ?? 0
  if (!d) return ''
  return d > 0 ? t('oneday.live.late', { n: d }) : t('oneday.live.early', { n: -d })
})
const updatedAt = computed(() => {
  const at = ap.value?.syncedAt
  return at ? fromMinutes(bangkokNow(Date.parse(at)).minutes) : ''
})
const firstStart = computed(() => view.value?.items[0]?.shownStart ?? '')

const tripRoute = onedayTripRouteUrls(useRuntimeConfig().public.googleMapsEmbedKey || '')

// ── Staff view only ──
const delayState = computed(() => {
  const c = ap.value?.control
  if (!c?.delayMinutes) return t('oneday.staff.onTime')
  return c.delayFrom
    ? t('oneday.staff.delayFrom', { n: c.delayMinutes, time: c.delayFrom })
    : t('oneday.staff.delayAll', { n: c.delayMinutes })
})
// The workshop round that matters now: the one running, the one groups are
// walking to, or round 1 during the 13:00 briefing.
const staffRound = computed(() => {
  const v = view.value
  if (!props.staff || !v || v.day !== 'bc') return 0
  if (v.current?.round) return v.current.round
  return v.current?.kind === 'brief' ? 1 : 0
})
const groupsNow = computed(() => ONEDAY_GROUP_LEADERS.map((leaders, i) => ({
  g: i + 1,
  leaders: leaders.join(', '),
  station: staffRound.value ? stationFor(i + 1, staffRound.value) : null
})))
const groupsLabel = computed(() => {
  if (!staffRound.value) return t('oneday.staff.groups')
  return view.value?.current?.kind === 'round'
    ? t('oneday.staff.roundNow', { n: staffRound.value })
    : t('oneday.staff.roundNext', { n: staffRound.value })
})

const staffLine = (i: { owner: string, kit: string }) =>
  props.staff && (i.owner || i.kit)
    ? [i.owner && `${t('oneday.live.owner')}: ${i.owner}`, i.kit && `${t('oneday.live.kit')}: ${i.kit}`].filter(Boolean).join(' · ')
    : ''
</script>

<template>
  <div class="odl">
    <!-- Same treatment as the contribute page: the photo is a band on phones
         that fades into the dark ground, and the left half on desktop (sticky
         while the schedule scrolls). Everything else sits on one dark surface. -->
    <div class="odl__art">
      <img class="odl__cover" src="/events/oneday-2026/marmoset.jpg" :alt="t('oneday.photos.marmoset')" width="1280" height="853">
      <p class="mark"><span class="mark__cu">CU</span>PHOTOCLUB</p>
    </div>

    <div class="odl__main">
    <header class="top">
      <div class="top__row">
        <p class="kicker">
          {{ t('oneday.live.eyebrow') }}
          <span v-if="staff" class="badge">{{ t('oneday.live.staffView') }}</span>
        </p>
        <nav class="lang" :aria-label="t('oneday.live.language')">
          <NuxtLink :to="switchLocalePath('th')" class="lang__opt" :class="{ 'is-active': locale === 'th' }" lang="th" hreflang="th">ไทย</NuxtLink>
          <span class="lang__sep" aria-hidden="true">/</span>
          <NuxtLink :to="switchLocalePath('en')" class="lang__opt" :class="{ 'is-active': locale === 'en' }" lang="en" hreflang="en" aria-label="English">EN</NuxtLink>
        </nav>
      </div>
      <h1 class="top__title">{{ t('oneday.title') }}</h1>

      <div class="tabs" role="tablist" :aria-label="t('oneday.live.dayLabel')">
        <button
          v-for="d in DAYS"
          :key="d"
          type="button"
          role="tab"
          class="tab"
          :aria-selected="day === d"
          @click="day = d"
        >
          <span class="tab__date">
            {{ t(`oneday.days.${d}`) }}
            <span v-if="ONEDAY_DAYS[d].date === todayDate" class="tab__today">{{ t('oneday.live.today') }}</span>
          </span>
          <span class="tab__name">{{ ONEDAY_DAYS[d].name[lang] }}</span>
        </button>
      </div>
    </header>

    <main v-if="view" class="body" role="tabpanel">
      <section v-if="staff" class="sbar">
        <p class="sbar__item">
          <span class="sbar__dot" :class="{ 'is-off': ap?.source !== 'sheet' }" aria-hidden="true" />
          {{ ap?.source === 'sheet' ? t('oneday.staff.synced', { time: updatedAt }) : t('oneday.staff.builtIn') }}
        </p>
        <p class="sbar__item">{{ delayState }}</p>
        <span class="sbar__links">
          <NuxtLink :to="localePath('/events/oneday-2026/staff/help')" class="sbar__link">{{ t('oneday.staff.openHelp') }}</NuxtLink>
          <NuxtLink :to="localePath('/events/oneday-2026/staff/sync')" class="sbar__link">{{ t('oneday.staff.openSync') }}</NuxtLink>
        </span>
      </section>

      <OnedayAnnouncement :text="announcement" :level="announcementLevel" inline />

      <div v-if="view.busCall" class="banner banner--crit" role="alert">
        <strong>{{ view.busCall.minutes ? t('oneday.live.boardingIn', { n: view.busCall.minutes }) : t('oneday.live.boardingNow') }}</strong>
        · {{ t('oneday.live.busLeaves', { time: view.busCall.leavesAt }) }}
        <span v-if="view.busCall.item.text.place" class="banner__sub">{{ view.busCall.item.text.place }}</span>
        <span v-if="view.busCall.item.text.warning" class="banner__sub">{{ view.busCall.item.text.warning }}</span>
      </div>

      <p v-if="delayText" class="banner banner--warn">{{ delayText }}</p>

      <section v-if="day === 'bc'" class="groups">
        <p class="lbl">{{ t('oneday.live.yourGroup') }}</p>
        <div class="seg" role="group" :aria-label="t('oneday.live.yourGroup')">
          <button
            v-for="g in 5"
            :key="g"
            type="button"
            class="seg__btn"
            :aria-pressed="group === g"
            @click="setGroup(g)"
          >{{ g }}</button>
        </div>
        <p v-if="!group" class="hint">{{ t('oneday.live.pickGroup') }}</p>
      </section>

      <!-- Before / after the day -->
      <section v-if="view.phase === 'before'" class="card card--state">
        <p class="card__title">{{ t('oneday.live.notStarted') }}</p>
        <p class="card__meta">
          {{ view.relation === 'future'
            ? t('oneday.live.startsOn', { date: t(`oneday.days.${day}`), time: firstStart })
            : t('oneday.live.startsAt', { time: firstStart }) }}
        </p>
      </section>
      <section v-else-if="view.phase === 'ended'" class="card card--state">
        <p class="card__title">{{ t('oneday.live.ended') }}</p>
        <p class="card__meta">{{ t('oneday.live.endedLead') }}</p>
      </section>

      <!-- Now -->
      <template v-if="view.phase === 'during'">
        <section v-if="current" class="card card--now">
          <p class="card__k">
            <span>{{ t('oneday.live.now') }}<span v-if="current.staffOnly" class="chip">{{ t('oneday.live.staffOnly') }}</span></span>
            <span class="num">{{ current.shownStart }}–{{ current.shownEnd }}</span>
          </p>
          <h2 class="card__title">{{ current.text.title }}</h2>
          <p v-if="current.text.detail" class="card__meta">{{ current.text.detail }}</p>
          <p v-if="current.text.place" class="card__meta">{{ current.text.place }}</p>
          <p v-if="current.text.warning" class="note">{{ current.text.warning }}</p>
          <p v-if="current.station" class="station">{{ t('oneday.live.hosts') }}: <strong>{{ current.station.hosts }}</strong></p>
          <p v-if="staffLine(current)" class="staff">{{ staffLine(current) }}</p>
          <p v-if="staff && current.staffNote" class="snote">{{ current.staffNote }}</p>
          <div class="bar" aria-hidden="true"><i :style="{ width: `${progress}%` }" /></div>
          <p class="count tnum">{{ t('oneday.live.minLeft', { n: minLeft }) }}</p>
        </section>
        <section v-else class="card card--now">
          <p class="card__k"><span>{{ t('oneday.live.now') }}</span></p>
          <h2 class="card__title">{{ t('oneday.live.between') }}</h2>
        </section>
      </template>

      <!-- Next -->
      <section v-if="next && view.phase !== 'ended'" class="card card--next">
        <p class="card__k">
          <span>{{ t('oneday.live.next') }}<span v-if="next.staffOnly" class="chip">{{ t('oneday.live.staffOnly') }}</span></span>
          <span v-if="view.relation === 'today'" class="tnum">{{ t('oneday.live.inMin', { n: nextIn }) }}</span>
        </p>
        <h2 class="card__title card__title--sm"><span class="num">{{ next.shownStart }}</span> · {{ next.text.title }}</h2>
        <p v-if="next.text.place" class="card__meta">{{ next.text.place }}</p>
        <p v-if="next.text.warning && view.busCall?.item !== next" class="note">{{ next.text.warning }}</p>
        <p v-if="staffLine(next)" class="staff">{{ staffLine(next) }}</p>
        <p v-if="staff && next.staffNote" class="snote">{{ next.staffNote }}</p>
      </section>

      <section v-if="comingUp.length && view.phase === 'during'">
        <p class="lbl">{{ t('oneday.live.comingUp') }}</p>
        <ul class="later">
          <li v-for="i in comingUp" :key="i.key">
            <span class="num later__t">{{ i.shownStart }}</span>
            <span>{{ i.text.title }}<span v-if="i.staffOnly" class="chip">{{ t('oneday.live.staffOnly') }}</span></span>
          </li>
        </ul>
      </section>

      <section v-if="staff" class="sgroups">
        <p class="lbl">{{ groupsLabel }}</p>
        <ul class="sgroups__list">
          <li v-for="row in groupsNow" :key="row.g" class="sgroups__row">
            <span class="sgroups__g">{{ t('oneday.info.groupN', { n: row.g }) }}</span>
            <span class="sgroups__body">
              <span v-if="row.station" class="sgroups__st">{{ t('oneday.info.stationN', { n: row.station.n }) }} · {{ row.station.name }} · {{ row.station.place[lang] }}</span>
              <span class="sgroups__leaders">{{ row.leaders }}</span>
            </span>
          </li>
        </ul>
      </section>

      <!-- Full day -->
      <section>
        <a v-if="day === 'odt'" :href="tripRoute.open" target="_blank" rel="noopener" class="route-link">{{ t('oneday.live.route') }}</a>
        <p class="lbl">{{ t('oneday.live.fullDay') }}</p>
        <ol class="day">
          <li v-for="i in view.items" :key="i.key" class="day__item" :class="[`is-${i.status}`, `kind-${i.kind}`]">
            <span class="num day__t">{{ i.shownStart }}</span>
            <div class="day__body">
              <p class="day__title">
                {{ i.text.title }}
                <span v-if="i.staffOnly" class="chip">{{ t('oneday.live.staffOnly') }}</span>
                <span v-if="i.delayed" class="chip chip--warn">+{{ view.delayMinutes }}</span>
              </p>
              <p v-if="i.shownEnd || i.text.place" class="day__meta">
                <template v-if="i.shownEnd"><span class="num">{{ i.shownStart }}–{{ i.shownEnd }}</span></template>
                <template v-if="i.shownEnd && i.text.place"> · </template>{{ i.text.place }}
              </p>
              <p v-if="i.text.warning && i.status !== 'done'" class="day__note">{{ i.text.warning }}</p>
              <p v-if="staffLine(i)" class="staff">{{ staffLine(i) }}</p>
              <p v-if="staff && i.staffNote" class="snote">{{ i.staffNote }}</p>
            </div>
          </li>
        </ol>
      </section>

      <details v-if="staff" class="roles">
        <summary class="roles__sum">{{ t('oneday.staff.roles') }}</summary>
        <dl class="roles__list">
          <div v-for="r in ONEDAY_STAFF_ROLES" :key="r.role.en" class="roles__row">
            <dt>{{ r.role[lang] }}</dt>
            <dd>{{ r.names }}</dd>
          </div>
        </dl>
      </details>

      <footer class="foot">
        <p v-if="updatedAt">{{ t('oneday.live.updated', { time: updatedAt }) }}</p>
        <NuxtLink :to="localePath('/events/oneday-2026/contacts')" class="foot__link">{{ t('oneday.contacts.pageTitle') }}</NuxtLink>
        <NuxtLink :to="localePath('/events/oneday-2026')" class="foot__link">{{ t('oneday.live.info') }}</NuxtLink>
      </footer>
    </main>
    </div>

    <OnedayWelcome />
  </div>
</template>

<style scoped>
.odl {
  min-height: 100vh;
  background: var(--hero-bg);
  color: #F5F4F0;
  font-family: var(--font-sans);
}
.num { font-family: var(--font-latin-sans); font-variant-numeric: tabular-nums; }
/* Translated text with numbers in it: keep the locale's font. */
.tnum { font-variant-numeric: tabular-nums; }

/* ── Photo + header (contribute-page pattern) ── */
.odl__art {
  position: relative;
  height: clamp(14rem, 36svh, 22rem);
  overflow: hidden;
}
.odl__cover {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: 38% 52%;
  display: block;
}
/* Fades the photo into the dark ground below and keeps the mark legible. */
.odl__art::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(to bottom, rgba(12, 12, 10, 0.35) 0%, rgba(12, 12, 10, 0.05) 35%, var(--hero-bg) 100%);
}
.odl__art .mark {
  position: absolute;
  z-index: 2;
  top: 1.1rem;
  left: 1rem;
}
.odl__main { position: relative; z-index: 1; margin-top: -3rem; }

.top { max-width: 40rem; margin: 0 auto; padding: 0 1rem; }
.top__row { display: flex; align-items: center; justify-content: space-between; gap: 1rem; }
.mark {
  font-family: var(--font-latin-sans);
  font-size: 0.6rem;
  font-weight: 500;
  letter-spacing: 0.22em;
  color: rgba(245, 244, 240, 0.85);
}
.mark__cu { color: var(--accent); }
.lang { display: inline-flex; align-items: center; gap: 0.15rem; }
.lang__opt {
  padding: 0.35rem 0.4rem;
  font-size: 0.72rem;
  color: rgba(245, 244, 240, 0.5);
  text-decoration: none;
  border-bottom: 1px solid transparent;
}
.lang__sep { font-size: 0.6rem; color: rgba(245, 244, 240, 0.3); }
.lang__opt:hover { color: var(--accent); }
.lang__opt.is-active { color: #F5F4F0; border-bottom-color: var(--accent); }
.lang__opt:focus-visible, .foot__link:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.kicker {
  font-size: 0.6rem;
  letter-spacing: 0.24em;
  text-transform: uppercase;
  color: var(--accent);
  display: flex;
  align-items: center;
  gap: 0.6rem;
}
.badge {
  border: 1px solid var(--accent);
  padding: 0.1rem 0.4rem;
  letter-spacing: 0.16em;
}
.top__title {
  margin-top: 0.5rem;
  font-family: var(--font-serif);
  font-weight: 300;
  font-size: clamp(1.7rem, 7vw, 2.6rem);
  line-height: 1.08;
  text-wrap: balance;
}
/* One faint track under both tabs; the active tab's pink bar sits on top of
   it (the -1px margin overlaps the track) so there is only one coloured line,
   matching the pink underline on the active language. */
.tabs {
  display: grid;
  grid-template-columns: 1fr 1fr;
  margin-top: 1.1rem;
  border-bottom: 1px solid rgba(245, 244, 240, 0.14);
}
.tab {
  text-align: left;
  padding: 0.7rem 0.2rem 0.8rem;
  margin-bottom: -1px;
  border: 0;
  border-bottom: 3px solid transparent;
  background: none;
  color: rgba(245, 244, 240, 0.5);
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
}
.tab[aria-selected="true"] { color: #F5F4F0; border-bottom-color: var(--accent); }
.tab:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
.tab__date { font-size: 0.62rem; letter-spacing: 0.16em; text-transform: uppercase; display: flex; gap: 0.5rem; align-items: center; }
.tab__today { color: var(--accent); font-weight: 500; }
.tab__name { font-family: var(--font-serif); font-size: 1.1rem; font-weight: 300; }

/* ── Body ── */
.body {
  max-width: 40rem;
  margin: 0 auto;
  padding: 1rem 1rem 3rem;
  display: flex;
  flex-direction: column;
  gap: 0.9rem;
}
.banner {
  padding: 0.75rem 0.9rem;
  font-size: 0.86rem;
  line-height: 1.5;
  border-left: 3px solid rgba(245, 244, 240, 0.5);
  background: rgba(245, 244, 240, 0.07);
}
.banner strong { font-weight: 600; }
.banner__sub { display: block; opacity: 0.85; }
.banner--warn { border-left-color: #F2B43A; background: rgba(242, 180, 58, 0.12); color: #F6CD7A; }
.banner--crit { border-left-color: #FF5C77; background: rgba(255, 92, 119, 0.14); color: #FF9AAB; }

.lbl {
  font-size: 0.6rem;
  letter-spacing: 0.22em;
  text-transform: uppercase;
  color: rgba(245, 244, 240, 0.55);
  margin-bottom: 0.45rem;
}
.groups .seg { display: grid; grid-template-columns: repeat(5, 1fr); border: 1px solid rgba(245, 244, 240, 0.2); }
.seg__btn {
  min-height: 2.6rem;
  border: 0;
  background: none;
  color: rgba(245, 244, 240, 0.75);
  font-family: var(--font-latin-sans);
  font-size: 1rem;
  cursor: pointer;
}
.seg__btn + .seg__btn { border-left: 1px solid rgba(245, 244, 240, 0.2); }
.seg__btn[aria-pressed="true"] { background: var(--accent); color: #fff; }
.seg__btn:focus-visible { outline: 2px solid #F5F4F0; outline-offset: -3px; }
.hint { margin-top: 0.45rem; font-size: 0.78rem; color: rgba(245, 244, 240, 0.6); }

.card {
  border: 1px solid rgba(245, 244, 240, 0.16);
  background: rgba(245, 244, 240, 0.05);
  padding: 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}
.card--now { border-color: var(--accent); }
.card--state { text-align: center; padding: 2rem 1rem; }
.card__k {
  display: flex;
  justify-content: space-between;
  gap: 0.6rem;
  font-size: 0.6rem;
  letter-spacing: 0.22em;
  text-transform: uppercase;
  color: rgba(245, 244, 240, 0.55);
}
.card--now .card__k { color: var(--accent); }
/* Times keep normal spacing inside the tracked-out label row. */
.card__k .num, .card__k .tnum { letter-spacing: 0.04em; text-transform: none; }
.card__title {
  font-family: var(--font-serif);
  font-weight: 300;
  font-size: 1.65rem;
  line-height: 1.15;
  text-wrap: balance;
}
.card__title--sm { font-size: 1.2rem; }
.card__meta { font-size: 0.84rem; color: rgba(245, 244, 240, 0.7); line-height: 1.5; }
.note { font-size: 0.82rem; color: #F6CD7A; }
.station { background: rgba(232, 24, 110, 0.16); padding: 0.5rem 0.7rem; font-size: 0.84rem; }
.station strong { font-weight: 600; }
.staff { font-size: 0.74rem; color: rgba(245, 244, 240, 0.55); }
.bar { height: 3px; background: rgba(245, 244, 240, 0.15); margin-top: 0.5rem; }
.bar i { display: block; height: 100%; background: var(--accent); transition: width 0.6s; }
.count { font-size: 1.6rem; font-weight: 300; }
.chip {
  display: inline-block;
  margin-left: 0.45rem;
  padding: 0 0.35rem;
  border: 1px solid rgba(245, 244, 240, 0.3);
  font-family: var(--font-latin-sans);
  font-size: 0.55rem;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  vertical-align: 0.15em;
  color: rgba(245, 244, 240, 0.65);
}
.chip--warn { border-color: #F2B43A; color: #F6CD7A; }

.later { list-style: none; padding: 0; margin: 0; font-size: 0.86rem; }
.later li {
  display: grid;
  grid-template-columns: 3.4rem 1fr;
  gap: 0.6rem;
  padding: 0.55rem 0;
  border-top: 1px solid rgba(245, 244, 240, 0.1);
}
.later__t { color: rgba(245, 244, 240, 0.55); }

/* ── Full day ── */
.day { list-style: none; padding: 0; margin: 0; }
.day__item {
  display: grid;
  grid-template-columns: 3.4rem minmax(0, 1fr);
  gap: 0.6rem;
  padding: 0.6rem 0 0.6rem 0.6rem;
  border-left: 2px solid rgba(245, 244, 240, 0.12);
}
.day__item.is-done { opacity: 0.4; }
.day__item.is-now { border-left-color: var(--accent); background: rgba(232, 24, 110, 0.08); }
.day__t { font-size: 0.8rem; color: rgba(245, 244, 240, 0.6); padding-top: 0.1rem; }
.day__item.is-now .day__t { color: var(--accent); font-weight: 500; }
.day__title { font-size: 0.92rem; line-height: 1.4; }
.day__item.is-now .day__title { font-weight: 500; }
.kind-board .day__title, .kind-depart .day__title { color: #FF9AAB; }
.day__meta { font-size: 0.74rem; color: rgba(245, 244, 240, 0.55); }
.day__note { font-size: 0.74rem; color: #F6CD7A; }

.snote {
  font-size: 0.76rem;
  color: #F6CD7A;
  border-left: 2px solid #F2B43A;
  padding-left: 0.5rem;
  margin-top: 0.15rem;
}

/* ── Staff view ── */
.sbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.4rem 1.2rem;
  padding: 0.6rem 0.8rem;
  border: 1px dashed rgba(245, 244, 240, 0.25);
  font-size: 0.76rem;
  color: rgba(245, 244, 240, 0.75);
}
.sbar__item { display: inline-flex; align-items: center; gap: 0.45rem; }
.sbar__dot { width: 7px; height: 7px; border-radius: 50%; background: #5CC98F; }
.sbar__dot.is-off { background: #F2B43A; }
.sbar__links { margin-left: auto; display: inline-flex; gap: 1rem; }
.sbar__link { color: #F5F4F0; text-decoration-color: var(--accent); text-underline-offset: 0.25em; }
.sbar__link:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }

.sgroups__list { list-style: none; padding: 0; margin: 0; border-top: 1px solid rgba(245, 244, 240, 0.1); }
.sgroups__row {
  display: grid;
  grid-template-columns: 4.6rem minmax(0, 1fr);
  gap: 0.6rem;
  padding: 0.55rem 0;
  border-bottom: 1px solid rgba(245, 244, 240, 0.1);
  font-size: 0.84rem;
}
.sgroups__g { color: rgba(245, 244, 240, 0.6); }
.sgroups__body { display: flex; flex-direction: column; gap: 0.1rem; min-width: 0; }
.sgroups__st { color: #F5F4F0; font-weight: 500; }
.sgroups__leaders { font-size: 0.76rem; color: rgba(245, 244, 240, 0.6); }

.roles { border: 1px solid rgba(245, 244, 240, 0.16); }
.roles__sum {
  padding: 0.8rem 0.9rem;
  cursor: pointer;
  font-size: 0.86rem;
  list-style-position: inside;
}
.roles__sum:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
.roles__list { margin: 0; padding: 0 0.9rem 0.6rem; }
.roles__row {
  display: grid;
  grid-template-columns: minmax(0, 0.9fr) minmax(0, 1.1fr);
  gap: 0.6rem;
  padding: 0.45rem 0;
  border-top: 1px solid rgba(245, 244, 240, 0.1);
  font-size: 0.82rem;
}
.roles__row dt { color: rgba(245, 244, 240, 0.6); }

.route-link {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 2.9rem;
  margin-bottom: 1rem;
  border: 1px solid rgba(245, 244, 240, 0.3);
  color: #F5F4F0;
  font-size: 0.86rem;
  text-decoration: none;
}
.route-link:hover { border-color: var(--accent); color: var(--accent); }
.route-link:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }

.foot {
  margin-top: 1rem;
  padding-top: 1rem;
  border-top: 1px solid rgba(245, 244, 240, 0.12);
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 0.6rem;
  font-size: 0.74rem;
  color: rgba(245, 244, 240, 0.5);
}
.foot__link { color: #F5F4F0; text-decoration-color: var(--accent); text-underline-offset: 0.25em; }

/* Desktop: photo left (sticky), header + schedule right. */
@media (min-width: 900px) {
  .odl {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 42rem);
    align-items: start;
  }
  .odl__art {
    position: sticky;
    top: 0;
    height: 100vh;
    height: 100svh;
  }
  .odl__cover { object-position: 40% 50%; }
  .odl__art::after {
    background:
      linear-gradient(to bottom, rgba(12, 12, 10, 0.35) 0%, rgba(12, 12, 10, 0) 22%),
      linear-gradient(to right, rgba(12, 12, 10, 0) 55%, var(--hero-bg) 100%);
  }
  .odl__art .mark { top: 1.6rem; left: 2rem; }
  .odl__main { margin-top: 0; padding-top: 2.5rem; }
  .top, .body { padding-left: 2rem; padding-right: 2rem; }
}

@media (prefers-reduced-motion: reduce) {
  .bar i { transition: none; }
}

/* Thai has no case and spaced-out letters break up words — same rule as the
   site-wide Thai override in main.css, for this page's own label classes. */
html:lang(th) .card__k,
html:lang(th) .lbl,
html:lang(th) .tab__date,
html:lang(th) .badge,
html:lang(th) .chip {
  letter-spacing: 0.035em;
  text-transform: none;
}
</style>
