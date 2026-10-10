<script setup lang="ts">
// Public gallery of the club's event websites. Each card links to an event's
// own site. The list lives in shared/eventSites.ts.
import { EVENT_SITES } from '~~/shared/eventSites'

definePageMeta({ layout: 'site' })

const { t } = useI18n()
const localePath = useLocalePath()

useSeoMeta({
  title: () => t('events.pageTitle'),
  description: () => t('events.lead')
})
</script>

<template>
  <div class="events-page">
    <header class="page-head">
      <p class="page-head__kicker">{{ t('events.kicker') }}</p>
      <h1 class="page-head__title">{{ t('events.pageTitle') }}</h1>
      <p class="page-head__lead">{{ t('events.lead') }}</p>
    </header>

    <main class="events-body">
      <ul v-if="EVENT_SITES.length" class="cards">
        <li v-for="event in EVENT_SITES" :key="event.slug" class="card">
          <NuxtLink :to="localePath(event.path)" class="card__link">
            <div class="card__media">
              <img :src="event.coverSrc" :alt="t(event.title)" width="1280" height="853" loading="lazy" class="card__img">
            </div>
            <div class="card__body">
              <p class="card__status">{{ t(`events.status.${event.status}`) }}</p>
              <h2 class="card__title">{{ t(event.title) }}</h2>
              <p class="card__meta">{{ t(event.dateLabel) }} · {{ t(event.location) }}</p>
              <p class="card__desc">{{ t(event.description) }}</p>
              <span class="card__cta">{{ t('events.visit') }} →</span>
            </div>
          </NuxtLink>
        </li>
      </ul>
      <p v-else class="events-empty">{{ t('events.empty') }}</p>
    </main>
  </div>
</template>

<style scoped>
.events-page {
  min-height: 100vh;
}

/* ── Page header (matches /activities) ── */
.page-head {
  padding: 10rem 3rem 5rem;
  max-width: 1380px;
  margin: 0 auto;
  border-bottom: 1px solid var(--subtle);
}
.page-head__kicker {
  font-size: 0.54rem;
  letter-spacing: 0.28em;
  text-transform: uppercase;
  color: var(--accent);
  margin-bottom: 1.5rem;
}
.page-head__title {
  font-family: var(--font-serif);
  font-size: clamp(3rem, 7vw, 7rem);
  font-weight: 200;
  line-height: 0.98;
  letter-spacing: -0.01em;
  color: var(--dark);
  margin-bottom: 1.5rem;
}
.page-head__lead {
  font-size: 0.9rem;
  color: var(--muted);
  max-width: 480px;
  line-height: 1.8;
}

/* ── Card grid ── */
.events-body {
  max-width: 1380px;
  margin: 0 auto;
  padding: 3.5rem 3rem 6rem;
}
.cards {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(100%, 320px), 1fr));
  gap: 1.5rem;
}
.card {
  min-width: 0;
  background: var(--paper);
  border: 1px solid var(--subtle);
  transition: border-color 0.25s;
}
.card:hover { border-color: var(--accent); }
.card__link {
  display: flex;
  flex-direction: column;
  height: 100%;
  color: inherit;
  text-decoration: none;
}
.card__media {
  aspect-ratio: 3 / 2;
  overflow: hidden;
  background: var(--subtle);
}
.card__img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform 0.4s ease;
}
.card:hover .card__img { transform: scale(1.02); }
.card__body {
  display: flex;
  flex-direction: column;
  flex: 1;
  padding: 1.5rem 1.5rem 1.4rem;
}
.card__status {
  font-size: 0.52rem;
  letter-spacing: 0.22em;
  text-transform: uppercase;
  color: var(--accent);
  margin-bottom: 0.7rem;
}
.card__title {
  font-family: var(--font-serif);
  font-size: clamp(1.25rem, 2vw, 1.6rem);
  font-weight: 300;
  line-height: 1.2;
  letter-spacing: -0.01em;
  color: var(--dark);
  margin-bottom: 0.7rem;
  overflow-wrap: anywhere;
}
.card__meta {
  font-size: 0.66rem;
  letter-spacing: 0.06em;
  color: var(--muted);
  margin-bottom: 1rem;
}
.card__desc {
  font-size: 0.84rem;
  line-height: 1.7;
  color: var(--muted);
  margin-bottom: 1.25rem;
}
.card__cta {
  margin-top: auto;
  font-size: 0.58rem;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--dark);
  border-bottom: 1px solid var(--accent);
  padding-bottom: 2px;
  width: fit-content;
}
.card:hover .card__cta { color: var(--accent); }

.events-empty {
  font-size: 0.9rem;
  color: var(--muted);
}

/* ── Phone: 16px side gutter, no horizontal scroll ── */
@media (max-width: 760px) {
  .page-head {
    padding: 8rem 16px 3rem;
  }
  .events-body {
    padding: 2.25rem 16px 4rem;
  }
  .cards {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
