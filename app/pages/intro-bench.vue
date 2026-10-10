<script setup lang="ts">
// Scratch comparison page — NOT linked from nav. Stacks a few candidate
// "who we are" treatments between the hero and Featured Work so we can judge
// them in real context before picking one to wire into index.vue for real.
import { defaultSite } from '~/utils/defaultSite'

definePageMeta({ layout: false })

const site = ref(defaultSite)
const localizedSite = useLocalizedSite(site)

const { data: home } = await useAsyncData('home', () =>
  $fetch('/api/home').catch(() => ({ albums: [], events: [] }))
)

function imageSrc(key: string | null | undefined) {
  const value = key?.trim()
  if (!value) return ''
  if (/^(https?:)?\/\//.test(value) || value.startsWith('/') || value.startsWith('data:') || value.startsWith('blob:')) {
    return value
  }
  return `/images/${value.replace(/^\/+/, '')}`
}

const featuredSeed = useState('featured-seed-bench', () => Math.floor(Math.random() * 2147483647))
const featuredAlbums = computed(() =>
  (home.value?.albums ?? [])
    .map(a => ({
      title: a.title,
      category: 'Album',
      cover: imageSrc(a.coverKey),
      path: albumRoutePath(a.slug)
    }))
    .filter(a => a.cover)
)

useHead({ title: 'Intro pattern bench — internal' })
useSeoMeta({ robots: 'noindex, nofollow' })
</script>

<template>
  <div v-if="localizedSite">
    <SiteNav :links="localizedSite.nav.links" :light="false" />
    <SiteHero :hero="localizedSite.hero" />
    <div class="cut-line" />

    <!-- ───────────────────────── PATTERN 1 ───────────────────────── -->
    <p class="bench-tag">Pattern 1 — Slim mission banner (light, one line)</p>
    <section class="p1">
      <p class="p1__text">
        <strong>CU Photo Club</strong> is Chulalongkorn University's photography society — open to every student, camera or no experience required.
        <a href="/#about">Join the club →</a>
      </p>
    </section>

    <!-- ───────────────────────── PATTERN 2 ───────────────────────── -->
    <p class="bench-tag">Pattern 2 — Eyebrow + heading + short body (dark, continues hero)</p>
    <section class="p2">
      <div class="p2__inner">
        <p class="p2__eyebrow"><span>01</span> Who we are</p>
        <h2 class="p2__heading">A community that <em>sees</em></h2>
        <p class="p2__body">
          Founded in 1967, we're a student-run photography club documenting campus life, culture, and the city around us —
          weekly meetups, workshops, and an archive that keeps growing.
        </p>
      </div>
    </section>

    <!-- ───────────────────────── PATTERN 3 ───────────────────────── -->
    <p class="bench-tag">Pattern 3 — Stat strip (light, credibility-first)</p>
    <section class="p3">
      <div class="p3__inner">
        <p class="p3__lead">A student photography club at Chulalongkorn University, running since 1967.</p>
        <div class="p3__stats">
          <div><strong>1967</strong><span>Founded</span></div>
          <div><strong>50+</strong><span>Years archiving</span></div>
          <div><strong>Open</strong><span>To all students</span></div>
        </div>
      </div>
    </section>

    <!-- ───────────────────────── PATTERN 4 ───────────────────────── -->
    <p class="bench-tag">Pattern 4 — Pull-quote (dark, typographic, minimal)</p>
    <section class="p4">
      <p class="p4__quote">Every photograph we make is a letter to the future.</p>
      <p class="p4__sub">CU Photo Club · Chulalongkorn University · Est. 1967</p>
    </section>

    <!-- ───────────────────────── PATTERN 5 ───────────────────────── -->
    <p class="bench-tag">Pattern 5 — Photo pile + casual text (light, photo-forward, informal) — LIVE on homepage now</p>
    <section class="p5">
      <div class="p5__inner">
        <div class="p5__photos">
          <div
            v-for="(a, i) in featuredAlbums.slice(0, 3)"
            :key="i"
            class="p5__photo"
            :style="{ '--r': `${(i - 1) * 6}deg` }"
          >
            <img :src="a.cover" :alt="a.title" loading="lazy">
          </div>
        </div>
        <div class="p5__text">
          <p class="p5__lead">We're just a bunch of students who really like cameras.</p>
          <p class="p5__body">
            Since 1967 we've been meeting up, teaching each other, and shooting everything from campus life
            to street corners of Bangkok — no experience needed, just curiosity.
          </p>
          <a href="/#about" class="p5__link">Come shoot with us →</a>
        </div>
      </div>
    </section>

    <div class="cut-line" />
    <p class="bench-tag">↓ Real Featured Work, for comparison</p>
    <FeaturedWork :albums="featuredAlbums" :seed="featuredSeed" />
  </div>
</template>

<style scoped>
.bench-tag {
  margin: 0;
  padding: 0.6rem 1.5rem;
  background: #ffe680;
  color: #1a1a1a;
  font-family: var(--font-sans);
  font-size: 0.62rem;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

/* Pattern 1 */
.p1 { background: var(--body-bg); padding: 2rem 3rem; }
.p1__text {
  max-width: 780px; margin: 0 auto; text-align: center;
  font-size: 0.95rem; line-height: 1.8; color: var(--dark);
}
.p1__text strong { color: var(--dark); }
.p1__text a { color: var(--accent); text-decoration: none; margin-left: 0.5rem; white-space: nowrap; }
.p1__text a:hover { text-decoration: underline; }

/* Pattern 2 */
.p2 { background: var(--dark); padding: 5rem 3rem; }
.p2__inner { max-width: 700px; margin: 0 auto; text-align: center; }
.p2__eyebrow {
  display: flex; align-items: center; justify-content: center; gap: 0.75rem;
  font-size: 0.58rem; letter-spacing: 0.28em; text-transform: uppercase;
  color: rgba(245, 244, 240, 0.5); margin-bottom: 1.5rem;
}
.p2__eyebrow span { color: var(--accent); font-weight: 500; }
.p2__heading {
  font-family: var(--font-serif); font-size: clamp(2rem, 4vw, 3rem); font-weight: 200;
  line-height: 1.1; letter-spacing: -0.02em; color: #F5F4F0; margin-bottom: 1.5rem;
}
.p2__heading em { font-style: italic; color: var(--accent); }
.p2__body { font-size: 0.9rem; line-height: 1.9; color: rgba(245, 244, 240, 0.55); }

/* Pattern 3 */
.p3 { background: var(--body-bg); padding: 4rem 3rem; border-top: 1px solid var(--subtle); border-bottom: 1px solid var(--subtle); }
.p3__inner { max-width: 900px; margin: 0 auto; display: flex; align-items: center; justify-content: space-between; gap: 3rem; flex-wrap: wrap; }
.p3__lead { font-family: var(--font-serif); font-size: clamp(1.3rem, 2.4vw, 1.9rem); font-weight: 300; line-height: 1.4; max-width: 420px; color: var(--dark); }
.p3__stats { display: flex; gap: 2.5rem; }
.p3__stats strong { display: block; font-family: var(--font-serif); font-size: 2rem; font-weight: 200; color: var(--dark); line-height: 1; }
.p3__stats span { display: block; margin-top: 0.4rem; font-size: 0.56rem; letter-spacing: 0.14em; text-transform: uppercase; color: var(--muted); }

/* Pattern 4 */
.p4 { background: var(--dark); padding: 5rem 3rem; text-align: center; }
.p4__quote {
  max-width: 760px; margin: 0 auto 1.5rem; font-family: var(--font-serif); font-style: italic;
  font-size: clamp(1.6rem, 3.2vw, 2.6rem); font-weight: 200; line-height: 1.35; color: #F5F4F0;
}
.p4__sub { font-size: 0.56rem; letter-spacing: 0.22em; text-transform: uppercase; color: var(--accent); }

@media (max-width: 720px) {
  .p3__inner { flex-direction: column; align-items: flex-start; gap: 1.75rem; }
}

/* Pattern 5 */
.p5 { background: var(--body-bg); padding: 4rem 3rem; }
.p5__inner { max-width: 1100px; margin: 0 auto; display: flex; align-items: center; gap: 3.5rem; }
.p5__photos { display: flex; flex-shrink: 0; }
.p5__photo {
  width: 120px; height: 120px; margin-left: -28px; border: 6px solid #fff;
  box-shadow: 0 0.6rem 1.6rem rgba(12, 12, 10, 0.18); background: var(--paper);
  transform: rotate(var(--r)); transition: transform 0.2s ease;
}
.p5__photo:first-child { margin-left: 0; }
.p5__photo img { width: 100%; height: 100%; object-fit: cover; display: block; }
.p5__photos:hover .p5__photo { transform: rotate(0deg) translateY(-4px); }
.p5__text { max-width: 480px; }
.p5__lead {
  font-family: var(--font-serif); font-size: clamp(1.4rem, 2.6vw, 2rem); font-weight: 300;
  line-height: 1.3; color: var(--dark); margin-bottom: 1rem;
}
.p5__body { font-size: 0.85rem; line-height: 1.85; color: var(--muted); margin-bottom: 1.25rem; }
.p5__link { color: var(--accent); text-decoration: none; font-size: 0.75rem; font-weight: 500; }
.p5__link:hover { text-decoration: underline; }

@media (max-width: 720px) {
  .p5__inner { flex-direction: column; align-items: flex-start; gap: 2rem; }
  .p5__photos { align-self: center; }
}
</style>
