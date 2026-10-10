<script setup lang="ts">
// Announcement from the Live Control tab, shown as a popup: a bottom sheet on
// phones, a centred card on desktop. It pops up on every page load and whenever
// the text or level changes; "Don't show this again" silences that one
// announcement on this phone (a new one still pops up). With `inline`, the live page also keeps a full-size card with the
// whole message, so it stays visible after the popup is dismissed.
import type { OnedayLevel } from '~~/shared/oneday2026'

const props = defineProps<{ text: string, level: OnedayLevel, inline?: boolean }>()

const { t } = useI18n()

const MUTED_KEY = 'oneday2026-announcement-muted'
const open = ref(false)
const panel = ref<HTMLElement | null>(null)
useFocusTrap(panel, open)

const signature = computed(() => `${props.level}|${props.text}`)

function muted(): string {
  try { return localStorage.getItem(MUTED_KEY) || '' } catch { return '' }
}

function check() {
  open.value = !!props.text && muted() !== signature.value
}

onMounted(check)
// The live AP is re-polled every 30 s; a new or edited announcement pops up.
watch(signature, check)

function dismiss() {
  open.value = false
}

function dontShowAgain() {
  try { localStorage.setItem(MUTED_KEY, signature.value) } catch { /* shows again next load */ }
  open.value = false
}

function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') dismiss()
}
</script>

<template>
  <section
    v-if="inline && text"
    class="ann-inline"
    :class="`ann-inline--${level}`"
    role="status"
  >
    <p class="ann-inline__k"><span class="ann-inline__dot" aria-hidden="true" />{{ t(`oneday.announce.${level}`) }}</p>
    <p class="ann-inline__text">{{ text }}</p>
  </section>

  <Teleport to="body">
    <Transition name="ann">
      <div v-if="open && text" class="ann" @click.self="dismiss" @keydown="onKey">
        <div
          ref="panel"
          class="ann__card"
          :class="`ann__card--${level}`"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="oneday-ann-k"
          aria-describedby="oneday-ann-text"
        >
          <p id="oneday-ann-k" class="ann__k">{{ t(`oneday.announce.${level}`) }}</p>
          <p id="oneday-ann-text" class="ann__text">{{ text }}</p>
          <button type="button" class="ann__ok" @click="dismiss">{{ t('oneday.announce.ok') }}</button>
          <button type="button" class="ann__mute" @click="dontShowAgain">{{ t('oneday.announce.dontShow') }}</button>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
/* ── Popup ── */
.ann {
  position: fixed;
  inset: 0;
  /* Above SiteNav (200), below the first-visit welcome (300). */
  z-index: 250;
  background: rgba(12, 12, 10, 0.6);
  display: flex;
  align-items: flex-end;
  justify-content: center;
  padding: 1rem 1rem calc(1rem + env(safe-area-inset-bottom, 0px));
}
.ann__card {
  --lv: var(--accent);
  width: min(100%, 28rem);
  background: #F5F4F0;
  color: var(--dark);
  border-top: 4px solid var(--lv);
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.45);
  padding: 1.3rem 1.3rem 1.2rem;
  display: flex;
  flex-direction: column;
  gap: 0.7rem;
  font-family: var(--font-sans);
}
.ann__card--warn { --lv: #C58A00; }
.ann__card--crit { --lv: #C81E3A; }
.ann__k {
  font-size: 0.62rem;
  font-weight: 600;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: var(--lv);
}
.ann__text {
  font-family: var(--font-serif);
  font-size: clamp(1.25rem, 5vw, 1.55rem);
  font-weight: 400;
  line-height: 1.35;
  white-space: pre-line;
  overflow-wrap: anywhere;
}
.ann__ok {
  margin-top: 0.4rem;
  min-height: 3rem;
  border: 1px solid var(--lv);
  background: var(--lv);
  color: #fff;
  font-size: 0.95rem;
  font-weight: 500;
  cursor: pointer;
}
.ann__ok:hover { filter: brightness(0.92); }
.ann__ok:focus-visible, .ann__mute:focus-visible { outline: 2px solid var(--dark); outline-offset: 3px; }
.ann__mute {
  align-self: center;
  min-height: 2.5rem;
  padding: 0 0.8rem;
  border: 0;
  background: none;
  color: var(--muted);
  font-size: 0.82rem;
  text-decoration: underline;
  text-underline-offset: 0.25em;
  cursor: pointer;
}
.ann__mute:hover { color: var(--dark); }

@media (min-width: 640px) {
  .ann { align-items: center; }
  .ann__card { padding: 1.6rem 1.6rem 1.4rem; }
}

.ann-enter-active, .ann-leave-active { transition: opacity 0.25s; }
.ann-enter-active .ann__card, .ann-leave-active .ann__card { transition: transform 0.25s; }
.ann-enter-from, .ann-leave-to { opacity: 0; }
.ann-enter-from .ann__card, .ann-leave-to .ann__card { transform: translateY(1.5rem); }
@media (prefers-reduced-motion: reduce) {
  .ann-enter-active, .ann-leave-active, .ann-enter-active .ann__card, .ann-leave-active .ann__card { transition: none; }
}

/* ── Inline card (live page) ── */
.ann-inline {
  --lv: var(--accent);
  border: 1px solid var(--lv);
  border-left-width: 5px;
  background: color-mix(in srgb, var(--lv) 22%, var(--hero-bg));
  color: #F5F4F0;
  padding: 0.95rem 1rem 1.05rem;
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
  font-family: var(--font-sans);
}
.ann-inline--warn { --lv: #F2B43A; }
.ann-inline--crit { --lv: #FF3355; }
.ann-inline__k {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.62rem;
  font-weight: 600;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: var(--lv);
}
.ann-inline--info .ann-inline__k { color: #FF7AB0; }
.ann-inline__dot { width: 8px; height: 8px; border-radius: 50%; background: currentColor; animation: ann-pulse 1.6s infinite; }
@keyframes ann-pulse { 50% { opacity: 0.25; } }
.ann-inline__text {
  font-family: var(--font-serif);
  font-size: clamp(1.2rem, 5vw, 1.45rem);
  font-weight: 400;
  line-height: 1.35;
  white-space: pre-line;
  overflow-wrap: anywhere;
}
@media (prefers-reduced-motion: reduce) { .ann-inline__dot { animation: none; } }

html:lang(th) .ann__k,
html:lang(th) .ann-inline__k {
  letter-spacing: 0.035em;
  text-transform: none;
}
</style>
