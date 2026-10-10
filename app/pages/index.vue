<script setup lang="ts">
import { defaultSite } from '~/utils/defaultSite'
import { prewarmPhotoGrid } from '~/utils/photoGridPreload'

definePageMeta({ layout: 'site' })

const site = ref(defaultSite)
const { t } = useI18n()
const localePath = useLocalePath()
const localizedPath = useLocalizedContentPath()
const localizedSite = useLocalizedSite(site)

// All awaited fetches run in parallel — awaiting them one after another
// would serialize three round trips into the SSR time.
const [{ data: home }, { data: heroImagesData }, { data: landingImagesData }] = await Promise.all([
  useAsyncData('home', () =>
    $fetch('/api/home').catch(() => ({ albums: [], events: [] }))
  ),
  useAsyncData('hero-images', () =>
    $fetch<{ images: string[] }>('/api/hero-images').catch(() => ({ images: [] }))
  ),
  useAsyncData('landing-images', () =>
    $fetch<{ historyImage: string, clubroomImage: string }>('/api/landing-images')
      .catch(() => ({ historyImage: '', clubroomImage: '' }))
  )
])

function imageSrc(key: string | null | undefined) {
  const value = key?.trim()
  if (!value) return ''
  if (/^(https?:)?\/\//.test(value) || value.startsWith('/') || value.startsWith('data:') || value.startsWith('blob:')) {
    return value
  }
  return `/images/${value.replace(/^\/+/, '')}`
}

function albumPath(a: { slug: string }) {
  return albumRoutePath(a.slug)
}

// ── Hero background: randomise from the admin-managed image pool.
//    The homepage HTML+payload is edge-cached (`swr` route rule in nuxt.config,
//    persisted in KV via hub.cache). A server-generated random seed would be
//    baked into that cached payload — frozen for the whole cache window and
//    identical for every visitor. So we render a deterministic image on the
//    server (index 0, so SSR + hydration match with no mismatch) and re-roll
//    on the client after mount, giving a fresh image on every page load.
//    The loading gate hides the swap (it re-arms whenever heroIndex changes).
const heroImages = computed(() => heroImagesData.value?.images ?? [])
const heroIndex = ref(0)
const heroWithImage = computed(() => {
  const base = localizedSite.value?.hero
  if (!base) return base
  const imgs = heroImages.value
  if (!imgs.length) return base
  return { ...base, image: `/images/${imgs[heroIndex.value % imgs.length]}` }
})

const historyWithImage = computed(() => {
  const base = localizedSite.value?.history
  if (!base) return base
  const managedImage = landingImagesData.value?.historyImage
  if (!managedImage) return base
  return { ...base, image: imageSrc(managedImage) }
})

// ── Featured Work: FeaturedWork.vue lays out a randomised, rectangle-guaranteed
//    wall from these albums. The randomness is driven by a seed that is created
//    once on the server and serialised via useState, so the server and client
//    renders are identical (no hydration mismatch). A fresh page load → new seed
//    → new layout.
const featuredSeed = useState('featured-seed', () => Math.floor(Math.random() * 2147483647))

const featuredAlbums = computed(() =>
  (home.value?.albums ?? [])
    .map(a => ({
      title: a.title,
      category: t('common.album'),
      cover: imageSrc(a.coverKey),
      path: localizedPath(albumPath(a))
    }))
    .filter(a => a.cover)
)

// Until a dedicated clubroom photograph is uploaded, use a real image from the
// club archive rather than presenting the logo as a photograph. The fallback
// remains deterministic for empty or offline data states.
const clubroomWithImage = computed(() => {
  const base = localizedSite.value?.about
  if (!base) return base
  const managedImage = landingImagesData.value?.clubroomImage
  if (managedImage) return { ...base, image: imageSrc(managedImage) }
  const archivePhoto = featuredAlbums.value[0]
  if (!archivePhoto) return base
  return { ...base, image: archivePhoto.cover, imageAlt: archivePhoto.title }
})

// ── Activities: its own numbered chapter after Latest. The API already
//    returns the cover and summary, so the section can present the next event
//    the way Featured Work and Latest present theirs. Events deliberately stay
//    out of the editorial "Latest" feed below.
const activityItems = computed(() =>
  (home.value?.events ?? [])
    .map(event => ({
      title: event.title,
      summary: event.summary ?? '',
      image: imageSrc(event.coverR2Key),
      date: event.eventDate ? new Date(event.eventDate).toISOString() : '',
      endDate: event.endDate ? new Date(event.endDate).toISOString() : '',
      location: event.location ?? '',
      path: localizedPath(`/activities/${event.slug}`)
    }))
    .sort((a, b) => (a.date || '9999').localeCompare(b.date || '9999'))
)

// ── Stories: albums only, newest first.
const feed = computed(() => {
  const albumItems = (home.value?.albums ?? [])
    .map(a => ({
      title: a.title,
      tag: t('common.album'),
      date: a.eventDate ?? '',
      published: a.eventDate ?? '',
      image: imageSrc(a.coverKey),
      excerpt: t('albums.metaFrames', { count: a.photoCount }),
      path: localizedPath(albumPath(a))
    }))
    .filter(a => a.image)
  return albumItems.sort((a, b) => b.published.localeCompare(a.published))
})

const leadStory = computed(() => feed.value[0] ?? null)
const smallStories = computed(() => feed.value.slice(1, 5))

// ── Scroll UI: reading-progress bar + nav dark→light handoff at the hero edge.
const navLight = ref(false)
const progress = ref(0)
const constructionNoticeOpen = ref(false)
const constructionNoticeKey = 'cu-photo-construction-notice-dismissed'

// ── Landing gate: hold a loading screen until the hero image is on screen so
//    visitors never see the page assemble behind a blank hero. A safety timeout
//    guarantees the page is revealed even if the image errors or never fires
//    its load event.
const heroReady = ref(false)
let heroReadyTimer: ReturnType<typeof setTimeout> | null = null

function onHeroReady() {
  heroReady.value = true
  if (heroReadyTimer) {
    clearTimeout(heroReadyTimer)
    heroReadyTimer = null
  }
}

// While the loading screen is up, freeze background scrolling.
watch(heroReady, (ready) => {
  if (import.meta.client) {
    document.documentElement.style.overflow = ready ? '' : 'hidden'
  }
}, { immediate: true })

// Client re-roll changes the hero src → hold the gate until the new image is
// actually on screen (SiteHero re-emits `ready` on load). Running inside the
// synchronous mount flush means heroReady never visibly flips, so no flicker.
watch(heroIndex, () => {
  heroReady.value = false
  if (heroReadyTimer) clearTimeout(heroReadyTimer)
  heroReadyTimer = setTimeout(onHeroReady, 6000)
})

// ── Intro strip: deal the photo pile in the first time the section scrolls into
//    view, then stop observing (one-shot — it should never replay on scroll-up).
const introSection = ref<HTMLElement | null>(null)
const introVisible = ref(false)
let introObserver: IntersectionObserver | null = null

function onScroll() {
  const total = document.body.scrollHeight - window.innerHeight
  progress.value = total > 0 ? (window.scrollY / total) * 100 : 0
  navLight.value = window.scrollY > window.innerHeight * 0.9
}

function dismissConstructionNotice() {
  constructionNoticeOpen.value = false
  if (import.meta.client) sessionStorage.setItem(constructionNoticeKey, '1')
}

function prewarmPhotoGridWhenIdle() {
  // typeof check (not `in`): `in` narrows window to never in the else branch
  // because lib.dom declares requestIdleCallback unconditionally.
  if (typeof window.requestIdleCallback === 'function') {
    window.requestIdleCallback(() => void prewarmPhotoGrid(), { timeout: 3000 })
    return
  }
  window.setTimeout(() => void prewarmPhotoGrid(), 1200)
}

onMounted(() => {
  onScroll()
  prewarmPhotoGridWhenIdle()
  // Re-roll the hero image on the client so the edge-cached SSR payload doesn't
  // freeze it to a single image for every visitor (see heroWithImage above).
  if (heroImages.value.length > 1) {
    heroIndex.value = Math.floor(Math.random() * heroImages.value.length)
  }
  constructionNoticeOpen.value = sessionStorage.getItem(constructionNoticeKey) !== '1'
  window.addEventListener('scroll', onScroll, { passive: true })
  if (introSection.value) {
    introObserver = new IntersectionObserver(([entry]) => {
      if (!entry?.isIntersecting) return
      introVisible.value = true
      introObserver?.disconnect()
      introObserver = null
    }, { threshold: 0.25 })
    introObserver.observe(introSection.value)
  }
  // Fallback: never trap the visitor behind the loading screen.
  heroReadyTimer = setTimeout(onHeroReady, 6000)
})
onUnmounted(() => {
  window.removeEventListener('scroll', onScroll)
  introObserver?.disconnect()
  if (heroReadyTimer) clearTimeout(heroReadyTimer)
  if (import.meta.client) document.documentElement.style.overflow = ''
})

// The homepage sets its own full title, so opt out of app.vue's titleTemplate
// (which would append a second "· CU Photo Club").
const origin = useSiteOrigin()
useHead({
  titleTemplate: null,
  title: () => `${t('nav.logo')} — Chulalongkorn University`,
  script: [
    {
      // WebSite structured data + sitelinks search box.
      type: 'application/ld+json',
      innerHTML: JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'WebSite',
        name: 'CU Photo Club',
        url: origin,
        potentialAction: {
          '@type': 'SearchAction',
          target: `${origin}/search?q={search_term_string}`,
          'query-input': 'required name=search_term_string'
        }
      })
    }
  ]
})
useSeoMeta({
  description: () => t('home.metaDescription'),
  ogTitle: () => `${t('nav.logo')} — Chulalongkorn University`,
  ogDescription: () => t('home.metaDescription'),
  ogImage: `${origin}/club-icon.jpg`
})
</script>

<template>
  <div v-if="localizedSite">
    <Teleport to="body">
      <Transition name="hero-gate">
        <div v-if="!heroReady" class="hero-gate" aria-hidden="true">
          <div class="hero-gate__mark">CU PHOTOCLUB</div>
          <div class="hero-gate__bar"><span /></div>
        </div>
      </Transition>
    </Teleport>

    <div id="progress" :style="{ width: progress + '%' }" />

    <SiteNav :links="localizedSite.nav.links" :light="navLight" />

    <SiteHero :hero="heroWithImage ?? localizedSite.hero" :data-chapter="t('nav.logo')" @ready="onHeroReady" />

    <!-- Signature pink line: dark → light transition -->
    <div class="cut-line" />

    <section ref="introSection" class="intro-photos" :class="{ 'intro-photos--in': introVisible }">
      <div class="intro-photos__inner">
        <div class="intro-photos__pile">
          <NuxtLink
            v-for="(a, i) in featuredAlbums.slice(0, 3)"
            :key="i"
            :to="a.path"
            class="intro-photos__photo"
            :style="{ '--r': `${(i - 1) * 6}deg`, '--i': i }"
          >
            <AppImg :src="a.cover" :alt="a.title" sizes="140px" optimize />
          </NuxtLink>
        </div>
        <div class="intro-photos__text">
          <div class="eyebrow intro-photos__eyebrow">{{ t('home.introEyebrow') }}</div>
          <p class="intro-photos__lead">{{ t('home.introLead') }}</p>
          <p class="intro-photos__body">{{ t('home.introBody') }}</p>
          <NuxtLink :to="localePath('/contacts')" class="intro-photos__link">{{ t('home.introLink') }}</NuxtLink>
        </div>
      </div>
    </section>

    <FeaturedWork :albums="featuredAlbums" :seed="featuredSeed" :data-chapter="t('home.featuredWork')" />

    <StoriesSection :lead="leadStory" :items="smallStories" :data-chapter="t('home.latest')" />

    <ActivitiesSection :items="activityItems" :data-chapter="t('home.activitiesEyebrow')" />

    <HistorySection :history="historyWithImage ?? localizedSite.history" :data-chapter="t('nav.history')" />

    <AboutSection :about="clubroomWithImage ?? localizedSite.about" :data-chapter="t('site.about.eyebrow')" />

    <Teleport to="body">
      <div
        v-if="constructionNoticeOpen"
        class="construction-notice"
        role="dialog"
        aria-modal="true"
        aria-labelledby="construction-title"
      >
        <div class="construction-notice__backdrop" @click="dismissConstructionNotice" />
        <section class="construction-notice__panel">
          <p class="construction-notice__kicker">CU PHOTOCLUB / NOTICE</p>
          <div class="construction-notice__heading">
            <h2 id="construction-title">{{ t('home.constructionTitle') }}</h2>
            <span class="construction-notice__mark" aria-hidden="true">
              <Icon name="heroicons:wrench-screwdriver" />
            </span>
          </div>
          <p>
            {{ t('home.constructionBody') }}
          </p>
          <button type="button" class="construction-notice__button" @click="dismissConstructionNotice">
            {{ t('home.constructionButton') }}
          </button>
        </section>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
/* ── Landing loading screen: sits above everything until the hero image is
   ready, then fades away to reveal the fully-assembled page. */
.hero-gate {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1.75rem;
  background: var(--hero-bg);
}
.hero-gate__mark {
  font-family: var(--font-latin-sans);
  font-size: 0.62rem;
  letter-spacing: 0.42em;
  text-transform: uppercase;
  color: rgba(245, 244, 240, 0.65);
  padding-left: 0.42em;
}
.hero-gate__bar {
  position: relative;
  width: 120px;
  height: 1px;
  background: rgba(245, 244, 240, 0.14);
  overflow: hidden;
}
.hero-gate__bar span {
  position: absolute;
  inset: 0;
  width: 40%;
  background: var(--accent);
  animation: hero-gate-slide 1.1s cubic-bezier(0.65, 0, 0.35, 1) infinite;
}
@keyframes hero-gate-slide {
  0% { transform: translateX(-100%); }
  100% { transform: translateX(350%); }
}
.hero-gate-leave-active {
  transition: opacity 0.6s ease;
}
.hero-gate-leave-to {
  opacity: 0;
}
@media (prefers-reduced-motion: reduce) {
  .hero-gate__bar span { animation: none; width: 100%; opacity: 0.5; }
}

.intro-photos { background: var(--body-bg); padding: 4rem 3rem; }
.intro-photos__inner { max-width: 1100px; margin: 0 auto; display: flex; align-items: center; gap: 3.5rem; }
.intro-photos__pile { display: flex; flex-shrink: 0; padding: 1.75rem 0; }

/* Prints in a pile: they overlap at rest, fan apart when you reach for them,
   and the one under the cursor lifts clear of the others. `translate`/`scale`
   stay separate from `transform` so the deal-in entrance can animate position
   without fighting the hover tilt. */
.intro-photos__photo {
  --d: calc(var(--i, 0) * 110ms);
  display: block; position: relative; z-index: 1;
  width: 140px; height: 140px; margin-left: -34px; border: 6px solid #fff;
  box-shadow: 0 0.6rem 1.6rem rgba(12, 12, 10, 0.18); background: var(--paper);
  overflow: hidden; transform: rotate(var(--r));
  translate: 0 1.5rem; scale: 0.94; opacity: 0;
  transition:
    transform 0.45s cubic-bezier(0.2, 0.7, 0.2, 1),
    box-shadow 0.45s ease,
    translate 0.8s cubic-bezier(0.18, 0.84, 0.24, 1) var(--d),
    scale 0.8s cubic-bezier(0.18, 0.84, 0.24, 1) var(--d),
    opacity 0.7s ease var(--d);
}
.intro-photos__photo:first-child { margin-left: 0; }
.intro-photos__photo :deep(img) { width: 100%; height: 100%; object-fit: cover; display: block; }

/* Deal-in: staggered, once, the first time the strip scrolls into view. */
.intro-photos--in .intro-photos__photo { translate: 0 0; scale: 1; opacity: 1; }

/* Fan the whole pile out, exaggerating each print's own tilt... */
.intro-photos__pile:hover .intro-photos__photo,
.intro-photos__pile:focus-within .intro-photos__photo {
  transform: rotate(calc(var(--r) * 1.5)) translate(calc((var(--i) - 1) * 16px), -6px);
}
/* ...and let the print you're pointing at (or tabbed to) come forward. */
.intro-photos__pile .intro-photos__photo:hover,
.intro-photos__pile .intro-photos__photo:focus-visible {
  z-index: 3;
  transform: rotate(0deg) translate(calc((var(--i) - 1) * 16px), -16px) scale(1.06);
  box-shadow: 0 1.4rem 2.6rem rgba(12, 12, 10, 0.28);
}
.intro-photos__photo:focus-visible { outline: 2px solid var(--accent); outline-offset: 4px; }

.intro-photos__text { max-width: 480px; }
.intro-photos__eyebrow { margin-bottom: 1.25rem; }
.intro-photos__text > * {
  translate: 0 0.75rem; opacity: 0;
  transition:
    translate 0.7s cubic-bezier(0.18, 0.84, 0.24, 1) var(--d),
    opacity 0.7s ease var(--d);
}
.intro-photos__text > :nth-child(1) { --d: 140ms; }
.intro-photos__text > :nth-child(2) { --d: 230ms; }
.intro-photos__text > :nth-child(3) { --d: 320ms; }
.intro-photos__text > :nth-child(4) { --d: 410ms; }
.intro-photos--in .intro-photos__text > * { translate: 0 0; opacity: 1; }
.intro-photos__lead {
  font-family: var(--font-serif); font-size: clamp(1.4rem, 2.6vw, 2rem); font-weight: 300;
  line-height: 1.3; color: var(--dark); margin-bottom: 1rem;
}
.intro-photos__body { font-size: 0.85rem; line-height: 1.85; color: var(--muted); margin-bottom: 1.25rem; }
.intro-photos__link { display: inline-block; color: var(--accent); text-decoration: none; font-size: 0.75rem; font-weight: 500; }
.intro-photos__link:hover { text-decoration: underline; }

/* No motion: show everything in place, no deal-in, no fan-out. */
@media (prefers-reduced-motion: reduce) {
  .intro-photos__photo,
  .intro-photos__text > * {
    translate: none; scale: none; opacity: 1; transition: none;
  }
  .intro-photos__pile:hover .intro-photos__photo,
  .intro-photos__pile:focus-within .intro-photos__photo { transform: rotate(var(--r)); }
  .intro-photos__pile .intro-photos__photo:hover,
  .intro-photos__pile .intro-photos__photo:focus-visible { transform: rotate(0deg); }
}

@media (max-width: 720px) {
  .intro-photos { padding: 3rem 1.5rem; }
  .intro-photos__inner { flex-direction: column; align-items: flex-start; gap: 2rem; }
  /* Narrower prints so the fanned-out pile still fits a phone's width. */
  .intro-photos__pile { align-self: center; padding: 1.25rem 0; }
  .intro-photos__photo { width: 112px; height: 112px; margin-left: -28px; }
  .intro-photos__pile:hover .intro-photos__photo,
  .intro-photos__pile:focus-within .intro-photos__photo {
    transform: rotate(calc(var(--r) * 1.5)) translate(calc((var(--i) - 1) * 10px), -6px);
  }
  .intro-photos__pile .intro-photos__photo:hover,
  .intro-photos__pile .intro-photos__photo:focus-visible {
    transform: rotate(0deg) translate(calc((var(--i) - 1) * 10px), -12px) scale(1.06);
  }
}

#progress {
  position: fixed;
  top: 0; left: 0;
  z-index: 200;
  height: 2px;
  background: var(--accent);
  transition: width 0.1s linear;
}

.construction-notice {
  position: fixed;
  inset: 0;
  z-index: 500;
  display: grid;
  place-items: center;
  padding: 1.25rem;
}

.construction-notice__backdrop {
  position: absolute;
  inset: 0;
  background: rgba(12, 12, 10, 0.72);
}

.construction-notice__panel {
  position: relative;
  width: min(100%, 520px);
  background: var(--body-bg);
  color: var(--dark);
  border-top: 2px solid var(--accent);
  padding: clamp(1.5rem, 5vw, 2.4rem);
  box-shadow: 0 1.5rem 4rem rgba(12, 12, 10, 0.34);
}

.construction-notice__heading {
  display: flex;
  align-items: center;
  gap: clamp(1rem, 4vw, 2rem);
}

.construction-notice__heading h2 {
  flex: 1;
}

.construction-notice__mark {
  display: inline-grid;
  place-items: center;
  flex-shrink: 0;
  color: var(--accent);
  font-size: clamp(3.25rem, 9vw, 4.6rem);
}

.construction-notice__mark :deep(svg),
.construction-notice__mark :deep(.iconify) {
  width: 1em;
  height: 1em;
  stroke-width: 1.15;
}

.construction-notice__kicker {
  font-family: var(--font-latin-sans);
  font-size: 0.54rem;
  letter-spacing: 0.22em;
  text-transform: uppercase;
  color: var(--accent);
  margin-bottom: 1rem;
}

.construction-notice h2 {
  font-family: var(--font-serif);
  font-size: clamp(2rem, 5vw, 3rem);
  font-weight: 300;
  line-height: 1.08;
  letter-spacing: 0;
}

.construction-notice p:not(.construction-notice__kicker) {
  margin-top: 1rem;
  color: var(--muted);
  line-height: 1.85;
}

.construction-notice__button {
  margin-top: 1.5rem;
  min-height: 2.65rem;
  border: 1px solid var(--dark);
  background: var(--dark);
  color: #F5F4F0;
  padding: 0.72rem 1rem;
  font-family: var(--font-sans);
  font-size: 0.62rem;
  letter-spacing: 0.12em;
  cursor: pointer;
  transition: background 0.2s ease, border-color 0.2s ease;
}

.construction-notice__button:hover {
  background: var(--accent);
  border-color: var(--accent);
}
</style>
