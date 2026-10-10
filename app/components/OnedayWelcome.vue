<script setup lang="ts">
// First-visit welcome for the Basic Control & One Day Trip pages. Most people
// arrive from a QR code in the LINE group, and some are international
// students, so the first screen welcomes them to the activity, says what the
// page does, and asks for a language — the choice is how they step in.
// Same visual pattern as the contribute page's welcome: photo band on phones,
// photo/panel split on desktop, one dark surface. Shown once per phone;
// either language button leads to the details page.
import { ONEDAY_DAYS } from '~~/shared/oneday2026'

const { t, locale } = useI18n()
const localePath = useLocalePath()

const KEY = 'oneday2026-welcomed'
const open = ref(false)
const panel = ref<HTMLElement | null>(null)
useFocusTrap(panel, open)

const lang = computed(() => (locale.value === 'th' ? 'th' : 'en'))

function remember() {
  try { localStorage.setItem(KEY, '1') } catch { /* storage blocked — it may show again */ }
}

function setScrollLock(on: boolean) {
  document.documentElement.style.overflow = on ? 'hidden' : ''
}

onMounted(() => {
  try { open.value = !localStorage.getItem(KEY) } catch { open.value = false }
})
watch(open, (v) => { if (import.meta.client) setScrollLock(v) })
onBeforeUnmount(() => { if (open.value) setScrollLock(false) })

// Picking a language takes them to the event details, in that language.
async function choose(code: 'th' | 'en') {
  remember()
  open.value = false
  await navigateTo(localePath('/events/oneday-2026', code))
}

function skip() {
  remember()
  open.value = false
}

function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') skip()
}
</script>

<template>
  <Transition name="welcome">
    <div
      v-if="open"
      ref="panel"
      class="welcome"
      role="dialog"
      aria-modal="true"
      aria-labelledby="oneday-welcome-title"
      @keydown="onKey"
    >
      <div class="welcome__art">
        <img class="welcome__cover" src="/events/oneday-2026/bushbuck.jpg" :alt="t('oneday.photos.bushbuck')" width="1280" height="853">
        <p class="mark"><span class="mark__cu">CU</span>PHOTOCLUB</p>
      </div>

      <div class="welcome__panel">
        <p class="welcome__kicker">{{ t('oneday.eyebrow') }}</p>
        <h1 id="oneday-welcome-title" class="welcome__title">
          {{ t('oneday.welcome.title') }}
          <span class="welcome__name">{{ t('oneday.title') }}</span>
        </h1>
        <p class="welcome__dates">
          <span>{{ t('oneday.days.bc') }} · {{ ONEDAY_DAYS.bc.name[lang] }}</span>
          <span>{{ t('oneday.days.odt') }} · {{ ONEDAY_DAYS.odt.name[lang] }}</span>
        </p>
        <p class="welcome__lead">{{ t('oneday.welcome.lead') }}</p>
        <p class="welcome__note">{{ t('oneday.welcome.pageNote') }}</p>

        <div class="welcome__cut" aria-hidden="true" />

        <p class="welcome__ask">{{ t('oneday.welcome.prompt') }}</p>
        <p class="welcome__ask welcome__ask--other" :lang="locale === 'th' ? 'en' : 'th'">{{ t('oneday.welcome.promptOther') }}</p>
        <div class="welcome__actions">
          <button type="button" class="welcome__btn" lang="th" @click="choose('th')">
            <span class="welcome__btn-main">ไทย</span>
            <span class="welcome__btn-sub">{{ t('oneday.welcome.continueTh') }}</span>
          </button>
          <button type="button" class="welcome__btn" lang="en" @click="choose('en')">
            <span class="welcome__btn-main">English</span>
            <span class="welcome__btn-sub">{{ t('oneday.welcome.continueEn') }}</span>
          </button>
        </div>
        <p class="welcome__later">{{ t('oneday.welcome.switchLater') }}</p>
      </div>

      <button type="button" class="welcome__skip" :aria-label="t('oneday.welcome.close')" @click="skip">×</button>
    </div>
  </Transition>
</template>

<style scoped>
.welcome {
  position: fixed;
  inset: 0;
  /* Above SiteNav (z-index 200) on the info page, so its logo can't sit on
     top of this screen's own. */
  z-index: 300;
  overflow-y: auto;
  overscroll-behavior: contain;
  background: var(--hero-bg);
  color: #F5F4F0;
  display: flex;
  flex-direction: column;
  font-family: var(--font-sans);
}

.welcome__art {
  position: relative;
  flex: none;
  height: 42svh;
  min-height: 15rem;
  overflow: hidden;
}
.welcome__cover {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: 55% 45%;
  display: block;
}
.welcome__art::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(to bottom, rgba(12, 12, 10, 0.35) 0%, rgba(12, 12, 10, 0.05) 38%, var(--hero-bg) 100%);
}
.mark {
  position: absolute;
  z-index: 2;
  top: calc(1.15rem + env(safe-area-inset-top, 0px));
  left: 1.5rem;
  font-family: var(--font-latin-sans);
  font-size: 0.6rem;
  font-weight: 500;
  letter-spacing: 0.22em;
  color: rgba(245, 244, 240, 0.85);
}
.mark__cu { color: var(--accent); }

.welcome__panel {
  position: relative;
  z-index: 1;
  flex: 1;
  margin-top: -3.25rem;
  padding: 0 1.5rem calc(2.5rem + env(safe-area-inset-bottom, 0px));
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}
.welcome__kicker {
  font-size: 0.58rem;
  letter-spacing: 0.24em;
  text-transform: uppercase;
  color: var(--accent);
}
.welcome__title {
  font-family: var(--font-serif);
  font-weight: 300;
  font-size: clamp(1.15rem, 4.5vw, 1.5rem);
  line-height: 1.25;
  color: rgba(245, 244, 240, 0.8);
}
.welcome__name {
  display: block;
  margin-top: 0.2rem;
  font-weight: 200;
  font-size: clamp(2.2rem, 9vw, 3.6rem);
  line-height: 1.02;
  letter-spacing: -0.01em;
  color: #F5F4F0;
  text-wrap: balance;
}
.welcome__dates {
  display: flex;
  flex-wrap: wrap;
  gap: 0.3rem 1.4rem;
  font-size: 0.74rem;
  letter-spacing: 0.06em;
  color: rgba(245, 244, 240, 0.65);
}
.welcome__lead {
  max-width: 34rem;
  font-size: 0.9rem;
  line-height: 1.7;
  color: rgba(245, 244, 240, 0.82);
}
.welcome__note { font-size: 0.76rem; color: rgba(245, 244, 240, 0.55); }
.welcome__cut { height: 2px; width: 3rem; background: var(--accent); margin: 0.6rem 0 0.4rem; }
.welcome__ask { font-family: var(--font-serif); font-size: 1.15rem; font-weight: 300; }
.welcome__ask--other { font-size: 0.95rem; color: rgba(245, 244, 240, 0.6); margin-top: -0.5rem; }
.welcome__actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.6rem;
  margin-top: 0.3rem;
  max-width: 30rem;
}
.welcome__btn {
  min-height: 4.2rem;
  padding: 0.7rem 0.9rem;
  border: 1px solid var(--accent);
  background: var(--accent);
  color: #fff;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  justify-content: center;
  gap: 0.15rem;
  text-align: left;
  cursor: pointer;
  transition: background 0.2s, color 0.2s;
}
.welcome__btn + .welcome__btn { background: transparent; color: #F5F4F0; border-color: rgba(245, 244, 240, 0.4); }
.welcome__btn:hover { background: #F5F4F0; color: var(--dark); border-color: #F5F4F0; }
.welcome__btn:focus-visible, .welcome__skip:focus-visible { outline: 2px solid #F5F4F0; outline-offset: 3px; }
.welcome__btn-main { font-size: 1.05rem; font-weight: 500; }
.welcome__btn-sub { font-size: 0.7rem; opacity: 0.8; }
.welcome__later { font-size: 0.72rem; color: rgba(245, 244, 240, 0.5); }

.welcome__skip {
  position: absolute;
  z-index: 3;
  top: calc(0.6rem + env(safe-area-inset-top, 0px));
  right: 0.6rem;
  width: 2.75rem;
  height: 2.75rem;
  border: 0;
  background: rgba(12, 12, 10, 0.45);
  color: #F5F4F0;
  font-size: 1.4rem;
  line-height: 1;
  cursor: pointer;
}

@media (min-width: 900px) {
  .welcome {
    display: grid;
    grid-template-columns: 1.1fr 0.9fr;
    overflow: hidden;
  }
  .welcome__art { height: auto; min-height: 100%; }
  .welcome__art::after {
    background:
      linear-gradient(to bottom, rgba(12, 12, 10, 0.35) 0%, rgba(12, 12, 10, 0) 22%),
      linear-gradient(to right, rgba(12, 12, 10, 0.05) 50%, rgba(12, 12, 10, 0.55) 100%);
  }
  .mark { top: 1.6rem; left: 2rem; }
  .welcome__panel {
    margin-top: 0;
    padding: 4rem 3.25rem;
    justify-content: center;
    max-width: 36rem;
    overflow-y: auto;
  }
}

.welcome-enter-active, .welcome-leave-active { transition: opacity 0.35s; }
.welcome-enter-from, .welcome-leave-to { opacity: 0; }
@media (prefers-reduced-motion: reduce) {
  .welcome-enter-active, .welcome-leave-active { transition: none; }
}

html:lang(th) .welcome__kicker {
  letter-spacing: 0.035em;
  text-transform: none;
}
</style>
