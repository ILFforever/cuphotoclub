<script setup lang="ts">
// Unlisted staff page: what the Live Control tab is set to right now, a
// "Sync now" button, and plain help for every setting and Live AP column.
// Changes are still made in the Google Sheet — this page never writes; the
// sheet's edit access decides who can change the live page. The sheet link is
// deliberately not shown (the workbook also holds participant data).
import type { OnedaySyncStatus } from '~~/shared/oneday2026'
import { ONEDAY_KINDS, bangkokNow, fromMinutes } from '~~/shared/oneday2026'

definePageMeta({ layout: 'contribute' })

const { t, locale } = useI18n()
const localePath = useLocalePath()
useSeoMeta({
  title: () => `${t('oneday.control.pageTitle')} · ${t('oneday.title')}`,
  robots: 'noindex, nofollow',
  themeColor: '#0C0C0A'
})

const { data: ap, refresh: refreshAp } = await useOnedayAp()
const { data: status } = await useFetch<OnedaySyncStatus>('/api/events/oneday-2026/sync', { key: 'oneday-sync' })
const lang = computed(() => (locale.value === 'th' ? 'th' : 'en'))

const syncing = ref(false)
const message = ref<{ tone: 'ok' | 'warn' | 'crit', text: string } | null>(null)

async function syncNow() {
  syncing.value = true
  message.value = null
  try {
    const res = await $fetch<OnedaySyncStatus>('/api/events/oneday-2026/sync', { method: 'POST' })
    status.value = res
    await refreshAp()
    if (res.throttled) message.value = { tone: 'warn', text: t('oneday.sync.throttled') }
    else if (res.ok) message.value = { tone: 'ok', text: t('oneday.sync.ok') }
    else if (res.error) message.value = { tone: 'crit', text: t(`oneday.sync.errors.${res.error}`, { tab: res.errorTab ?? '' }) }
  } catch {
    message.value = { tone: 'crit', text: t('oneday.sync.failed') }
  } finally {
    syncing.value = false
  }
}

function bangkokTime(iso: string | null | undefined) {
  if (!iso) return t('oneday.sync.never')
  return fromMinutes(bangkokNow(Date.parse(iso)).minutes)
}

const ctl = computed(() => ap.value?.control)
const announcement = computed(() => {
  const a = ctl.value?.announcement
  return a ? (a[lang.value] || a.th) : ''
})
const empty = computed(() => t('oneday.control.empty'))

// Live Control fields, in sheet order.
const FIELDS = ['delay_minutes', 'delay_from', 'announcement_th', 'announcement_en', 'announcement_level'] as const
const current = computed<Record<(typeof FIELDS)[number], string>>(() => {
  const c = ctl.value
  return {
    delay_minutes: String(c?.delayMinutes ?? 0),
    delay_from: c?.delayFrom || empty.value,
    announcement_th: c?.announcement.th || empty.value,
    announcement_en: c?.announcement.en || empty.value,
    announcement_level: c?.announcementLevel ?? 'info'
  }
})

const RECIPES = ['late', 'rain', 'urgent', 'clear'] as const
const AP_COLUMNS = ['day', 'start', 'type', 'round', 'staff_only', 'text', 'warning', 'owner', 'staff_note'] as const
</script>

<template>
  <div class="ctl">
    <div class="ctl__inner">
      <p class="mark"><span class="mark__cu">CU</span>PHOTOCLUB</p>
      <p class="kicker">{{ t('oneday.live.staffView') }}</p>
      <h1 class="ctl__title">{{ t('oneday.control.pageTitle') }}</h1>
      <p class="ctl__lead">{{ t('oneday.control.lead') }}</p>

      <!-- Right now -->
      <section class="block">
        <h2 class="block__h">{{ t('oneday.control.now') }}</h2>
        <div class="state">
          <p class="state__sync">
            <span class="dot" :class="{ 'is-off': ap?.source !== 'sheet' }" aria-hidden="true" />
            {{ ap?.source === 'sheet' ? t('oneday.staff.synced', { time: bangkokTime(ap?.syncedAt) }) : t('oneday.staff.builtIn') }}
          </p>
          <button type="button" class="btn" :disabled="syncing" @click="syncNow">
            {{ syncing ? t('oneday.sync.syncing') : t('oneday.sync.syncNow') }}
          </button>
        </div>
        <p v-if="message" class="banner" :class="`banner--${message.tone}`" role="status">{{ message.text }}</p>
        <p v-else-if="status?.error" class="banner banner--crit" role="alert">
          {{ t(`oneday.sync.errors.${status.error}`, { tab: status.errorTab ?? '' }) }}
        </p>

        <dl class="values">
          <div v-for="f in FIELDS" :key="f" class="values__row">
            <dt><code>{{ f }}</code></dt>
            <dd>{{ current[f] }}</dd>
          </div>
        </dl>

        <template v-if="announcement">
          <p class="sub">{{ t('oneday.control.preview') }}</p>
          <OnedayAnnouncement :text="announcement" :level="ctl?.announcementLevel ?? 'info'" inline />
        </template>
      </section>

      <!-- How to -->
      <section class="block">
        <h2 class="block__h">{{ t('oneday.control.howTitle') }}</h2>
        <ol class="steps">
          <li>{{ t('oneday.control.step1') }}</li>
          <li>{{ t('oneday.control.step2') }}</li>
          <li>{{ t('oneday.control.step3') }}</li>
        </ol>
      </section>

      <!-- Each setting -->
      <section class="block">
        <h2 class="block__h">{{ t('oneday.control.fieldsTitle') }}</h2>
        <div class="fields">
          <article v-for="f in FIELDS" :key="f" class="field">
            <h3 class="field__name"><code>{{ f }}</code></h3>
            <p>{{ t(`oneday.control.field.${f}.what`) }}</p>
            <p class="field__meta"><span>{{ t('oneday.control.allowed') }}</span> {{ t(`oneday.control.field.${f}.allowed`) }}</p>
            <p class="field__meta"><span>{{ t('oneday.control.example') }}</span> <code>{{ t(`oneday.control.field.${f}.example`) }}</code></p>
          </article>
        </div>
        <div class="levels">
          <p class="sub">{{ t('oneday.control.levelsTitle') }}</p>
          <ul class="levels__list">
            <li class="levels__item levels__item--info"><code>info</code> {{ t('oneday.control.levelInfo') }}</li>
            <li class="levels__item levels__item--warn"><code>warn</code> {{ t('oneday.control.levelWarn') }}</li>
            <li class="levels__item levels__item--crit"><code>crit</code> {{ t('oneday.control.levelCrit') }}</li>
          </ul>
        </div>
      </section>

      <!-- Recipes -->
      <section class="block">
        <h2 class="block__h">{{ t('oneday.control.recipesTitle') }}</h2>
        <div class="recipes">
          <article v-for="r in RECIPES" :key="r" class="recipe">
            <h3 class="recipe__name">{{ t(`oneday.control.recipe.${r}.name`) }}</h3>
            <p class="recipe__set"><code>{{ t(`oneday.control.recipe.${r}.set`) }}</code></p>
            <p class="recipe__result">{{ t(`oneday.control.recipe.${r}.result`) }}</p>
          </article>
        </div>
      </section>

      <!-- Live AP -->
      <section class="block">
        <h2 class="block__h">{{ t('oneday.control.apTitle') }}</h2>
        <p>{{ t('oneday.control.apLead') }}</p>
        <dl class="values values--ap">
          <div v-for="c in AP_COLUMNS" :key="c" class="values__row">
            <dt><code>{{ t(`oneday.control.ap.${c}.name`) }}</code></dt>
            <dd>{{ t(`oneday.control.ap.${c}.what`) }}</dd>
          </div>
        </dl>
        <p class="sub">{{ t('oneday.control.typesTitle') }}</p>
        <dl class="values values--types">
          <div v-for="k in ONEDAY_KINDS" :key="k" class="values__row">
            <dt><code>{{ k }}</code></dt>
            <dd>{{ t(`oneday.control.kind.${k}`) }}</dd>
          </div>
        </dl>
      </section>

      <!-- Gotchas -->
      <section class="block">
        <h2 class="block__h">{{ t('oneday.control.gotchasTitle') }}</h2>
        <ul class="gotchas">
          <li>{{ t('oneday.control.gotcha1') }}</li>
          <li>{{ t('oneday.control.gotcha2') }}</li>
          <li>{{ t('oneday.control.gotcha3') }}</li>
          <li>{{ t('oneday.control.gotcha4') }}</li>
        </ul>
      </section>

      <div class="links">
        <NuxtLink :to="localePath('/events/oneday-2026/staff')">{{ t('oneday.live.staffView') }}</NuxtLink>
        <NuxtLink :to="localePath('/events/oneday-2026/staff/sync')">{{ t('oneday.control.syncDetails') }}</NuxtLink>
        <NuxtLink :to="localePath('/events/oneday-2026/live')">{{ t('oneday.sync.openLive') }}</NuxtLink>
      </div>
    </div>
  </div>
</template>

<style scoped>
.ctl {
  min-height: 100vh;
  background: var(--hero-bg);
  color: #F5F4F0;
  font-family: var(--font-sans);
}
.ctl__inner {
  max-width: 44rem;
  margin: 0 auto;
  padding: 1.4rem 1rem 4rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}
.mark {
  font-family: var(--font-latin-sans);
  font-size: 0.6rem;
  font-weight: 500;
  letter-spacing: 0.22em;
  color: rgba(245, 244, 240, 0.72);
  margin-bottom: 0.8rem;
}
.mark__cu { color: var(--accent); }
.kicker { font-size: 0.6rem; letter-spacing: 0.24em; text-transform: uppercase; color: var(--accent); }
.ctl__title { font-family: var(--font-serif); font-weight: 300; font-size: clamp(1.9rem, 7vw, 2.6rem); line-height: 1.1; }
.ctl__lead { font-size: 0.9rem; line-height: 1.7; color: rgba(245, 244, 240, 0.75); max-width: 60ch; }

.block {
  margin-top: 1.4rem;
  padding-top: 1.4rem;
  border-top: 1px solid rgba(245, 244, 240, 0.14);
  display: flex;
  flex-direction: column;
  gap: 0.8rem;
  font-size: 0.88rem;
  line-height: 1.65;
}
.block__h { font-family: var(--font-serif); font-weight: 300; font-size: 1.45rem; line-height: 1.2; }
.sub { font-size: 0.78rem; color: rgba(245, 244, 240, 0.6); margin-top: 0.4rem; }
code {
  font-family: ui-monospace, 'SF Mono', Menlo, monospace;
  font-size: 0.84em;
  background: rgba(245, 244, 240, 0.08);
  padding: 0.05rem 0.35rem;
  color: #F5F4F0;
  overflow-wrap: anywhere;
}

/* Right now */
.state { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 0.8rem; }
.state__sync { display: inline-flex; align-items: center; gap: 0.5rem; color: rgba(245, 244, 240, 0.8); }
.dot { width: 8px; height: 8px; border-radius: 50%; background: #5CC98F; }
.dot.is-off { background: #F2B43A; }
.btn {
  min-height: 2.9rem;
  padding: 0 1.4rem;
  border: 1px solid var(--accent);
  background: var(--accent);
  color: #fff;
  font-size: 0.86rem;
  font-weight: 500;
  cursor: pointer;
}
.btn:disabled { opacity: 0.6; cursor: wait; }
.btn:focus-visible { outline: 2px solid #F5F4F0; outline-offset: 3px; }
.banner { padding: 0.7rem 0.9rem; font-size: 0.84rem; border-left: 3px solid rgba(245, 244, 240, 0.5); background: rgba(245, 244, 240, 0.07); }
.banner--ok { border-left-color: #5CC98F; color: #9BE0BB; background: rgba(92, 201, 143, 0.12); }
.banner--warn { border-left-color: #F2B43A; color: #F6CD7A; background: rgba(242, 180, 58, 0.12); }
.banner--crit { border-left-color: #FF5C77; color: #FF9AAB; background: rgba(255, 92, 119, 0.14); }

.values { margin: 0; border-top: 1px solid rgba(245, 244, 240, 0.1); }
.values__row {
  display: grid;
  grid-template-columns: minmax(0, 11rem) minmax(0, 1fr);
  gap: 0.8rem;
  padding: 0.55rem 0;
  border-bottom: 1px solid rgba(245, 244, 240, 0.1);
}
.values__row dd { min-width: 0; overflow-wrap: anywhere; color: rgba(245, 244, 240, 0.85); }
.values--types .values__row { grid-template-columns: minmax(0, 6rem) minmax(0, 1fr); }

/* How to */
.steps { margin: 0; padding-left: 1.3rem; display: grid; gap: 0.5rem; list-style: decimal; }
.steps li::marker { color: var(--accent); font-weight: 600; }

/* Fields */
.fields { display: grid; gap: 0.8rem; }
.field {
  border: 1px solid rgba(245, 244, 240, 0.14);
  background: rgba(245, 244, 240, 0.04);
  padding: 0.9rem 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}
.field__name { font-size: 0.95rem; font-weight: 500; }
.field__meta { font-size: 0.8rem; color: rgba(245, 244, 240, 0.7); }
.field__meta span { color: rgba(245, 244, 240, 0.5); margin-right: 0.3rem; }
.levels__list { list-style: none; padding: 0; margin: 0; display: grid; gap: 0.4rem; }
.levels__item { padding: 0.5rem 0.8rem; border-left: 4px solid var(--accent); background: rgba(232, 24, 110, 0.12); }
.levels__item--warn { border-left-color: #F2B43A; background: rgba(242, 180, 58, 0.12); }
.levels__item--crit { border-left-color: #FF3355; background: rgba(255, 51, 85, 0.14); }

/* Recipes */
.recipes { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0.8rem; }
.recipe { border: 1px solid rgba(245, 244, 240, 0.14); padding: 0.9rem 1rem; display: flex; flex-direction: column; gap: 0.45rem; min-width: 0; }
.recipe__name { font-family: var(--font-serif); font-weight: 400; font-size: 1.1rem; }
.recipe__set { font-size: 0.8rem; white-space: pre-line; }
.recipe__result { font-size: 0.8rem; color: rgba(245, 244, 240, 0.65); }

.gotchas { margin: 0; padding-left: 1.2rem; display: grid; gap: 0.5rem; list-style: disc; }
.gotchas li::marker { color: #F2B43A; }

.links { margin-top: 1.6rem; display: flex; flex-wrap: wrap; gap: 0.6rem 1.4rem; font-size: 0.82rem; }
.links a { color: #F5F4F0; text-decoration-color: var(--accent); text-underline-offset: 0.25em; }
.links a:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }

@media (max-width: 560px) {
  .recipes { grid-template-columns: minmax(0, 1fr); }
  .values__row { grid-template-columns: minmax(0, 1fr); gap: 0.15rem; }
}

html:lang(th) .kicker {
  letter-spacing: 0.035em;
  text-transform: none;
}
</style>
