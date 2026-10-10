<script setup lang="ts">
// Staff contacts for Basic Control & One Day Trip 2026 — the nurses, then every
// group leader by group, each row a tap-to-call link. Built on the live page's
// pattern (OnedayLive.vue): photo band into the dark ground, one narrow column.
// Names and groups are in shared/oneday2026.ts; the numbers come from the
// sheet's จัดกลุ่ม tab (server/utils/onedaySheet.ts), so they never enter the
// repo. Groups are tabs, one group at a time; the picked tab is remembered
// (the same stored group as the live page).
import { ONEDAY_GROUP_LEADERS, ONEDAY_STAFF_ROLES, splitNames } from '~~/shared/oneday2026'

definePageMeta({ layout: 'contribute' })

const { t, locale } = useI18n()
const localePath = useLocalePath()
const switchLocalePath = useSwitchLocalePath()
useSeoMeta({
  title: () => `${t('oneday.contacts.pageTitle')} · ${t('oneday.title')}`,
  description: () => t('oneday.contacts.lead'),
  robots: 'noindex, nofollow',
  themeColor: '#0C0C0A'
})

const { data: contacts } = await useOnedayContacts()
const ready = computed(() => contacts.value?.source === 'sheet')

const GROUP_KEY = 'oneday2026-group'
const group = ref(0)
function setGroup(g: number) {
  group.value = g
  try { localStorage.setItem(GROUP_KEY, String(g)) } catch { /* not remembered */ }
}
onMounted(() => {
  try {
    const g = Number(localStorage.getItem(GROUP_KEY))
    if (g >= 1 && g <= 5) group.value = g
  } catch { /* storage blocked */ }
})

// Group colours from the planning sheet's จัดกลุ่ม tab, lifted so they read on
// the dark ground. Used only as a thin rule and the group number.
const GROUP_HUES: Record<number, string> = {
  1: '#E77BA6', // pink
  2: '#A68BD6', // purple
  3: '#6FA8E6', // blue
  4: '#86C26F', // green
  5: '#F0A55A' // orange
}
const hue = (g: number) => ({ '--gc': GROUP_HUES[g] })

const nurses = new Set(splitNames(ONEDAY_STAFF_ROLES.find(r => r.role.en === 'First aid')?.names ?? ''))
const groupOf = new Map(ONEDAY_GROUP_LEADERS.flatMap((names, i) => names.map(n => [n, i + 1] as const)))

interface Person { name: string, nurse: boolean, group: number, phone: string | null, shown: string }

function person(name: string): Person {
  const phone = contacts.value?.phones[name] ?? null
  return { name, nurse: nurses.has(name), group: groupOf.get(name) ?? 0, phone, shown: phone ? formatOnedayPhone(phone) : '' }
}

const firstAid = computed(() => [...nurses].map(person))

// The open tab: the remembered group, or group 1.
const active = computed(() => group.value || 1)
const leaders = computed(() => (ONEDAY_GROUP_LEADERS[active.value - 1] ?? []).map(person))

// Left/right arrows move between tabs (WAI-ARIA tabs pattern).
function onTabKey(e: KeyboardEvent) {
  if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
  e.preventDefault()
  const g = ((active.value - 1 + (e.key === 'ArrowRight' ? 1 : 4)) % 5) + 1
  setGroup(g)
  nextTick(() => document.getElementById(`odc-tab-${g}`)?.focus())
}
</script>

<template>
  <div class="odc">
    <div class="odc__art">
      <img class="odc__cover" src="/events/oneday-2026/bushbuck.jpg" :alt="t('oneday.photos.bushbuck')" width="1280" height="853">
      <p class="mark"><span class="mark__cu">CU</span>PHOTOCLUB</p>
    </div>

    <div class="odc__main">
      <header class="top">
        <div class="top__row">
          <p class="kicker">{{ t('oneday.title') }}</p>
          <nav class="lang" :aria-label="t('oneday.live.language')">
            <NuxtLink :to="switchLocalePath('th')" class="lang__opt" :class="{ 'is-active': locale === 'th' }" lang="th" hreflang="th">ไทย</NuxtLink>
            <span class="lang__sep" aria-hidden="true">/</span>
            <NuxtLink :to="switchLocalePath('en')" class="lang__opt" :class="{ 'is-active': locale === 'en' }" lang="en" hreflang="en" aria-label="English">EN</NuxtLink>
          </nav>
        </div>
        <h1 class="top__title">{{ t('oneday.contacts.pageTitle') }}</h1>
        <p class="top__lead">{{ t('oneday.contacts.lead') }}</p>
      </header>

      <main class="body">
        <p v-if="!ready" class="banner" role="status">{{ t('oneday.contacts.notReady') }}</p>

        <!-- Nurses: the one block with the accent, same as "Now" on the live page -->
        <section class="aid" aria-labelledby="odc-aid">
          <p id="odc-aid" class="aid__k">{{ t('oneday.contacts.firstAid') }}</p>
          <p class="aid__lead">{{ t('oneday.contacts.firstAidLead') }}</p>
          <ul class="calls">
            <li v-for="p in firstAid" :key="p.name">
              <component
                :is="p.phone ? 'a' : 'div'"
                :href="p.phone ? `tel:${p.phone}` : undefined"
                class="call"
                :aria-label="p.phone ? t('oneday.contacts.call', { name: p.name, phone: p.shown }) : undefined"
              >
                <span class="call__who">
                  <span class="call__name">{{ p.name }}</span>
                  <span v-if="p.group" class="call__g" :style="hue(p.group)">{{ t('oneday.info.groupN', { n: p.group }) }}</span>
                </span>
                <span v-if="p.phone" class="num call__no">{{ p.shown }}</span>
                <span v-else class="call__none">{{ t('oneday.contacts.noPhone') }}</span>
              </component>
            </li>
          </ul>
        </section>

        <section class="grp">
          <div class="tabs" role="tablist" :aria-label="t('oneday.info.group')" @keydown="onTabKey">
            <button
              v-for="g in 5"
              :id="`odc-tab-${g}`"
              :key="g"
              type="button"
              role="tab"
              class="tab"
              :style="hue(g)"
              :aria-selected="active === g"
              aria-controls="odc-panel"
              :tabindex="active === g ? 0 : -1"
              @click="setGroup(g)"
            >{{ t('oneday.info.groupN', { n: g }) }}</button>
          </div>
          <ul id="odc-panel" class="calls" role="tabpanel" :aria-labelledby="`odc-tab-${active}`">
            <li v-for="p in leaders" :key="p.name">
              <component
                :is="p.phone ? 'a' : 'div'"
                :href="p.phone ? `tel:${p.phone}` : undefined"
                class="call"
                :aria-label="p.phone ? t('oneday.contacts.call', { name: p.name, phone: p.shown }) : undefined"
              >
                <span class="call__who">
                  <span class="call__name">
                    {{ p.name }}<span v-if="p.nurse" class="chip">{{ t('oneday.contacts.firstAid') }}</span>
                  </span>
                </span>
                <span v-if="p.phone" class="num call__no">{{ p.shown }}</span>
                <span v-else class="call__none">{{ t('oneday.contacts.noPhone') }}</span>
              </component>
            </li>
          </ul>
        </section>

        <footer class="foot">
          <p>{{ t('oneday.contacts.privacy') }}</p>
          <span class="foot__links">
            <NuxtLink :to="localePath('/events/oneday-2026/live')" class="foot__link">{{ t('oneday.info.openLive') }}</NuxtLink>
            <NuxtLink :to="localePath('/events/oneday-2026')" class="foot__link">{{ t('oneday.live.info') }}</NuxtLink>
          </span>
        </footer>
      </main>
    </div>
  </div>
</template>

<style scoped>
/* Same ground, type and spacing as OnedayLive.vue, so the two read as one app. */
.odc {
  min-height: 100vh;
  background: var(--hero-bg);
  color: #F5F4F0;
  font-family: var(--font-sans);
}
.num { font-family: var(--font-latin-sans); font-variant-numeric: tabular-nums; }

/* ── Photo + header ── */
.odc__art {
  position: relative;
  height: clamp(12rem, 30svh, 18rem);
  overflow: hidden;
}
.odc__cover {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: 62% 40%;
  display: block;
}
.odc__art::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(to bottom, rgba(12, 12, 10, 0.35) 0%, rgba(12, 12, 10, 0.05) 35%, var(--hero-bg) 100%);
}
.odc__art .mark { position: absolute; z-index: 2; top: 1.1rem; left: 1rem; }
.odc__main { position: relative; z-index: 1; margin-top: -3rem; }

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
.kicker {
  font-size: 0.6rem;
  letter-spacing: 0.24em;
  text-transform: uppercase;
  color: var(--accent);
}
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
.lang__opt:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.top__title {
  margin-top: 0.5rem;
  font-family: var(--font-serif);
  font-weight: 300;
  font-size: clamp(1.7rem, 7vw, 2.6rem);
  line-height: 1.08;
  text-wrap: balance;
}
.top__lead {
  margin-top: 0.6rem;
  font-size: 0.86rem;
  line-height: 1.6;
  color: rgba(245, 244, 240, 0.7);
  max-width: 34rem;
}

/* ── Body ── */
.body {
  max-width: 40rem;
  margin: 0 auto;
  padding: 1.4rem 1rem 3rem;
  display: flex;
  flex-direction: column;
  gap: 1.6rem;
}
.banner {
  padding: 0.75rem 0.9rem;
  font-size: 0.86rem;
  line-height: 1.5;
  border-left: 3px solid #F2B43A;
  background: rgba(242, 180, 58, 0.12);
  color: #F6CD7A;
}


/* ── A phone row: the whole row is the tap target ── */
.calls { list-style: none; padding: 0; margin: 0; }
.calls li + li { border-top: 1px solid rgba(245, 244, 240, 0.1); }
.call {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  min-height: 3.2rem;
  padding: 0.5rem 0;
  color: inherit;
  text-decoration: none;
}
.call__who { display: flex; flex-direction: column; gap: 0.1rem; min-width: 0; }
.call__name { font-size: 1rem; }
.call__g { font-size: 0.72rem; color: var(--gc); }
.call__no {
  flex-shrink: 0;
  font-size: 0.95rem;
  letter-spacing: 0.02em;
  text-decoration: underline;
  text-decoration-color: rgba(232, 24, 110, 0.6);
  text-underline-offset: 0.3em;
}
a.call:hover .call__no, a.call:active .call__no { color: var(--accent); text-decoration-color: var(--accent); }
a.call:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.call__none { flex-shrink: 0; font-size: 0.74rem; color: rgba(245, 244, 240, 0.45); }

.chip {
  display: inline-block;
  margin-left: 0.5rem;
  padding: 0 0.35rem;
  border: 1px solid rgba(232, 24, 110, 0.6);
  font-size: 0.62rem;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  vertical-align: 0.2em;
  color: #FF9AAB;
}

/* ── Nurses: bordered in the accent, like the live page's "Now" card ── */
.aid {
  border: 1px solid var(--accent);
  background: rgba(232, 24, 110, 0.08);
  padding: 0.9rem 1rem 0.3rem;
}
.aid__k {
  font-size: 0.6rem;
  letter-spacing: 0.22em;
  text-transform: uppercase;
  color: var(--accent);
}
.aid__lead { margin: 0.35rem 0 0.4rem; font-size: 0.84rem; color: rgba(245, 244, 240, 0.7); }
.aid .calls li + li { border-top-color: rgba(232, 24, 110, 0.22); }


/* ── Group tabs: the live page's day tabs, five across; the open tab's bar
   takes that group's colour from the planning sheet. ── */
.tabs {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  border-bottom: 1px solid rgba(245, 244, 240, 0.14);
  margin-bottom: 0.2rem;
}
.tab {
  padding: 0.75rem 0.1rem 0.7rem;
  margin-bottom: -1px;
  border: 0;
  border-bottom: 3px solid transparent;
  background: none;
  color: rgba(245, 244, 240, 0.5);
  font-family: var(--font-sans);
  font-size: 0.86rem;
  white-space: nowrap;
  cursor: pointer;
  transition: color 0.15s, border-color 0.15s;
}
.tab:hover { color: rgba(245, 244, 240, 0.85); }
.tab[aria-selected="true"] { color: #F5F4F0; border-bottom-color: var(--gc); }
.tab:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }

.foot {
  margin-top: 0.4rem;
  padding-top: 1rem;
  border-top: 1px solid rgba(245, 244, 240, 0.12);
  display: flex;
  flex-direction: column;
  gap: 0.7rem;
  font-size: 0.74rem;
  line-height: 1.5;
  color: rgba(245, 244, 240, 0.5);
}
.foot__links { display: flex; flex-wrap: wrap; gap: 0.6rem 1.4rem; }
.foot__link { color: #F5F4F0; text-decoration-color: var(--accent); text-underline-offset: 0.25em; }
.foot__link:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }

/* Desktop: photo left (sticky), contacts right — same split as the live page. */
@media (min-width: 900px) {
  .odc {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 42rem);
    align-items: start;
  }
  .odc__art {
    position: sticky;
    top: 0;
    height: 100vh;
    height: 100svh;
  }
  .odc__cover { object-position: 30% 50%; }
  .odc__art::after {
    background:
      linear-gradient(to bottom, rgba(12, 12, 10, 0.35) 0%, rgba(12, 12, 10, 0) 22%),
      linear-gradient(to right, rgba(12, 12, 10, 0) 55%, var(--hero-bg) 100%);
  }
  .odc__art .mark { top: 1.6rem; left: 2rem; }
  .odc__main { margin-top: 0; padding-top: 2.5rem; }
  .top, .body { padding-left: 2rem; padding-right: 2rem; }
}

/* Thai has no case and spaced-out letters break up words. */
html:lang(th) .kicker,
html:lang(th) .aid__k,
html:lang(th) .chip {
  letter-spacing: 0.035em;
  text-transform: none;
}
</style>
