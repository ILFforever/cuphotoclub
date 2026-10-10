<script setup lang="ts">
// Unlisted staff page: shows the state of the Google Sheet sync and offers
// "Sync now". Open by design — it can only re-read the sheet, and the server
// refuses to fetch more than once every 10 seconds. Who can change the
// schedule is decided by who can edit the sheet.
import type { OnedaySyncStatus } from '~~/shared/oneday2026'
import { ONEDAY_STAFF_NAMES, bangkokNow, fromMinutes } from '~~/shared/oneday2026'

definePageMeta({ layout: 'contribute' })

const { t } = useI18n()
const localePath = useLocalePath()
useSeoMeta({
  title: () => `${t('oneday.sync.pageTitle')} · ${t('oneday.title')}`,
  robots: 'noindex, nofollow',
  themeColor: '#0C0C0A'
})

const { data: status } = await useFetch<OnedaySyncStatus>('/api/events/oneday-2026/sync', { key: 'oneday-sync' })

const syncing = ref(false)
const message = ref<{ tone: 'ok' | 'warn' | 'crit', text: string } | null>(null)

function bangkokTime(iso: string | null) {
  if (!iso) return t('oneday.sync.never')
  const b = bangkokNow(Date.parse(iso))
  return `${fromMinutes(b.minutes)}:${String(b.seconds).padStart(2, '0')}`
}

const errorText = computed(() => {
  const s = status.value
  if (!s?.error) return ''
  return t(`oneday.sync.errors.${s.error}`, { tab: s.errorTab ?? '' })
})

async function syncNow() {
  syncing.value = true
  message.value = null
  try {
    const res = await $fetch<OnedaySyncStatus>('/api/events/oneday-2026/sync', { method: 'POST' })
    status.value = res
    if (res.throttled) message.value = { tone: 'warn', text: t('oneday.sync.throttled') }
    else if (res.ok) message.value = { tone: 'ok', text: t('oneday.sync.ok') }
  } catch {
    message.value = { tone: 'crit', text: t('oneday.sync.failed') }
  } finally {
    syncing.value = false
  }
}
</script>

<template>
  <div class="sync">
    <div class="sync__inner">
      <p class="mark"><span class="mark__cu">CU</span>PHOTOCLUB</p>
      <p class="kicker">{{ t('oneday.title') }}</p>
      <h1 class="sync__title">{{ t('oneday.sync.pageTitle') }}</h1>
      <p class="sync__lead">{{ t('oneday.sync.lead') }}</p>

      <button type="button" class="btn" :disabled="syncing" @click="syncNow">
        {{ syncing ? t('oneday.sync.syncing') : t('oneday.sync.syncNow') }}
      </button>

      <p v-if="message" class="banner" :class="`banner--${message.tone}`" role="status">{{ message.text }}</p>
      <p v-if="errorText" class="banner banner--crit" role="alert">{{ errorText }}</p>

      <dl v-if="status" class="facts">
        <div class="facts__row">
          <dt>{{ t('oneday.sync.lastSync') }}</dt>
          <dd class="num">{{ bangkokTime(status.syncedAt) }}</dd>
        </div>
        <div class="facts__row">
          <dt>{{ t('oneday.sync.lastAttempt') }}</dt>
          <dd class="num">{{ bangkokTime(status.lastAttemptAt) }}</dd>
        </div>
        <div class="facts__row">
          <dt>{{ t('oneday.sync.rows') }}</dt>
          <dd class="num">{{ status.itemCount }}</dd>
        </div>
        <div class="facts__row">
          <dt>{{ t('oneday.sync.staffPhones') }}</dt>
          <dd class="num">{{ status.staffPhoneCount ?? 0 }} / {{ ONEDAY_STAFF_NAMES.length }}</dd>
        </div>
      </dl>

      <section v-if="status?.warnings.length" class="warnings">
        <p class="lbl">{{ t('oneday.sync.skipped') }}</p>
        <ul>
          <li v-for="(w, i) in status.warnings" :key="i">
            <span class="warnings__where">{{ w.row ? t('oneday.sync.row', { n: w.row }) : t('oneday.sync.tabNote', { tab: w.tab }) }}</span>
            {{ t(`oneday.sync.warn.${w.code}`, { value: w.value }) }}
          </li>
        </ul>
      </section>

      <div class="links">
        <NuxtLink :to="localePath('/events/oneday-2026/staff/help')">{{ t('oneday.staff.openHelp') }}</NuxtLink>
        <NuxtLink :to="localePath('/events/oneday-2026/staff')">{{ t('oneday.live.staffView') }}</NuxtLink>
        <NuxtLink :to="localePath('/events/oneday-2026/live')">{{ t('oneday.sync.openLive') }}</NuxtLink>
        <NuxtLink :to="localePath('/events/oneday-2026/contacts')">{{ t('oneday.contacts.pageTitle') }}</NuxtLink>
      </div>
    </div>
  </div>
</template>

<style scoped>
.sync {
  min-height: 100vh;
  background: var(--hero-bg);
  color: #F5F4F0;
  font-family: var(--font-sans);
}
.sync__inner {
  max-width: 34rem;
  margin: 0 auto;
  padding: 1.4rem 1rem 3rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
  align-items: flex-start;
}
.num { font-family: var(--font-latin-sans); font-variant-numeric: tabular-nums; }
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
.sync__title { font-family: var(--font-serif); font-weight: 300; font-size: clamp(1.8rem, 7vw, 2.4rem); line-height: 1.1; }
.sync__lead { font-size: 0.86rem; line-height: 1.65; color: rgba(245, 244, 240, 0.72); }
.btn {
  min-height: 3rem;
  padding: 0.75rem 1.6rem;
  border: 1px solid var(--accent);
  background: var(--accent);
  color: #fff;
  font-size: 0.72rem;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  cursor: pointer;
}
.btn:disabled { opacity: 0.6; cursor: wait; }
.btn:focus-visible { outline: 2px solid #F5F4F0; outline-offset: 3px; }
.banner {
  width: 100%;
  padding: 0.75rem 0.9rem;
  font-size: 0.84rem;
  line-height: 1.5;
  border-left: 3px solid rgba(245, 244, 240, 0.5);
  background: rgba(245, 244, 240, 0.07);
}
.banner--ok { border-left-color: #5CC98F; color: #9BE0BB; background: rgba(92, 201, 143, 0.12); }
.banner--warn { border-left-color: #F2B43A; color: #F6CD7A; background: rgba(242, 180, 58, 0.12); }
.banner--crit { border-left-color: #FF5C77; color: #FF9AAB; background: rgba(255, 92, 119, 0.14); }
.facts { width: 100%; border-top: 1px solid rgba(245, 244, 240, 0.14); }
.facts__row {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.65rem 0;
  border-bottom: 1px solid rgba(245, 244, 240, 0.1);
  font-size: 0.84rem;
}
.facts__row dt { color: rgba(245, 244, 240, 0.6); }
.lbl { font-size: 0.6rem; letter-spacing: 0.22em; text-transform: uppercase; color: rgba(245, 244, 240, 0.55); margin-bottom: 0.4rem; }
.warnings { width: 100%; }
.warnings ul { list-style: none; padding: 0; margin: 0; font-size: 0.82rem; }
.warnings li { padding: 0.5rem 0; border-bottom: 1px solid rgba(245, 244, 240, 0.1); color: #F6CD7A; }
.warnings__where { color: rgba(245, 244, 240, 0.6); margin-right: 0.5rem; }
.links { display: flex; flex-wrap: wrap; gap: 0.6rem 1.4rem; font-size: 0.8rem; }
.links a { color: #F5F4F0; text-decoration-color: var(--accent); text-underline-offset: 0.25em; }
.links a:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }

/* Thai has no case and spaced-out letters break up words — same rule as the
   site-wide Thai override in main.css, for this page's own label classes. */
html:lang(th) .lbl,
html:lang(th) .btn {
  letter-spacing: 0.035em;
  text-transform: none;
}
</style>
