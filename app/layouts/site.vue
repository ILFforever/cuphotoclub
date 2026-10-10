<script setup lang="ts">
import { defaultSite } from '~/utils/defaultSite'

// Emit per-locale SEO head tags for all public pages: <html lang/dir>,
// <link rel="canonical">, hreflang alternates (en/th/x-default), and og:locale.
// Uses i18n.baseUrl (nuxt.config) so URLs are absolute on the real domain.
const localeHead = useLocaleHead()
useHead(localeHead)

// Shared chrome for inner pages (albums, events, and the rest): reading-progress bar,
// the dark→light nav handoff, header parallax, and the footer — all driven by
// the page's own markup via data-attributes:
//   [data-chrome-header] → nav goes light once this element scrolls past
//                          (no such element on a page → nav is always light)
//   [data-chrome-glass]  → while still over the header, the nav picks up a
//                          faint dark glass panel once this element (the
//                          header's first text) scrolls up under it, so the
//                          light nav text stays readable against it
//   [data-parallax]      → translated on scroll for a parallax header
//   [data-hero-dim]      → darkened as its header scrolls upward
const site = ref(defaultSite)
const localizedSite = useLocalizedSite(site)

const navLight = ref(false)
const navGlass = ref(false)
const progress = ref(0)

function heroDimProgress(el: HTMLElement): number {
  const header = el.closest<HTMLElement>('[data-chrome-header]')
  if (!header) return 0
  const rect = header.getBoundingClientRect()
  const distance = Math.min(Math.max(-rect.top, 0), rect.height * 0.62)
  return distance / (rect.height * 0.62 || 1)
}

function onScroll() {
  const total = document.body.scrollHeight - window.innerHeight
  progress.value = total > 0 ? (window.scrollY / total) * 100 : 0

  const header = document.querySelector('[data-chrome-header]')
  navLight.value = header ? header.getBoundingClientRect().bottom < 64 : true

  // Glass is the in-between state: the nav is still transparent over a dark
  // header, but its text now overlaps the header's own text. Measure the nav
  // instead of hardcoding its height, which differs between breakpoints.
  const navEl = document.querySelector<HTMLElement>('[data-site-nav]')
  const glassFrom = document.querySelector<HTMLElement>('[data-chrome-glass]')
  navGlass.value = !navLight.value && !!glassFrom && !!navEl
    && glassFrom.getBoundingClientRect().top < navEl.getBoundingClientRect().bottom

  const els = document.querySelectorAll<HTMLElement>('[data-parallax]')
  for (const el of els) el.style.transform = `translateY(${window.scrollY * 0.2}px)`

  const dimmable = document.querySelectorAll<HTMLElement>('[data-hero-dim]')
  for (const el of dimmable) el.style.setProperty('--hero-dim', heroDimProgress(el).toFixed(3))
}

onMounted(() => {
  onScroll()
  window.addEventListener('scroll', onScroll, { passive: true })
})
onUnmounted(() => window.removeEventListener('scroll', onScroll))

// This layout is shared across public pages, so it is NOT re-mounted on
// client-side navigation — onMounted runs once. Without this, navLight goes
// stale: leaving a hero-less page (which forces navLight = true) and returning
// to a page with a hero would keep the nav's light background sitting over the
// hero until the next scroll. Re-run onScroll once the new page is in the DOM.
useNuxtApp().hook('page:finish', () => nextTick(onScroll))
</script>

<template>
  <div>
    <div id="progress-track" :class="{ 'is-light': navLight }">
      <div id="progress" :style="{ width: progress + '%' }" />
    </div>
    <SiteNav v-if="localizedSite" :links="localizedSite.nav.links" :light="navLight" :glass="navGlass" />
    <main>
      <slot />
    </main>
    <SiteFooter v-if="localizedSite" :footer="localizedSite.footer" />
  </div>
</template>
