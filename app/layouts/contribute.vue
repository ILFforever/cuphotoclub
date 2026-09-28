<script setup lang="ts">
// Chrome for the participant upload page — deliberately NOT the site layout.
//
// Two things are removed on purpose:
//   • SiteNav, because the upload screen owns the top of the viewport with its
//     own sticky bar (counter, code, selection actions) and two stacked bars on
//     a phone leave nothing for the photos.
//   • SiteFooter, because its nav columns invite a tap away from a page that may
//     have an upload running; leaving mid-batch loses the batch.
//
// What survives is the one thing SiteNav was carrying that this page cannot do
// without: the language switcher. Attendees reach this page by scanning a QR
// code, so it is often the first and only page of the site they ever see.
const { t } = useI18n()
const localePath = useLocalePath()
const route = useRoute()
// The competition page borrows this layout; its entries ARE shown to voters,
// so the collection promise ("nothing is public") would be untrue there.
const endStripLine = computed(() =>
  route.path.includes('/compete/') ? t('compete.endStripLine') : t('contribute.endStripLine')
)

const localeHead = useLocaleHead()
useHead(localeHead)
</script>

<template>
  <div class="contrib-shell">
    <main class="contrib-shell__main">
      <slot />
    </main>

    <footer class="endstrip">
      <div class="endstrip__inner">
        <span class="endstrip__brand"><span class="endstrip__cu">CU</span>PHOTOCLUB</span>
        <p class="endstrip__line">{{ endStripLine }}</p>
        <div class="endstrip__aside">
          <NuxtLink class="endstrip__contact" :to="localePath('/contacts')">
            {{ t('contribute.endStripContact') }}
          </NuxtLink>
          <LangSwitcher />
        </div>
      </div>
    </footer>
  </div>
</template>

<style scoped>
.contrib-shell {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}
.contrib-shell__main { flex: 1; }

.endstrip {
  background: var(--dark);
  color: rgba(245, 244, 240, 0.7);
  padding: 2rem 1.5rem;
}
.endstrip__inner {
  max-width: 980px;
  margin: 0 auto;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.75rem 1.5rem;
}
.endstrip__brand {
  font-family: var(--font-latin-sans);
  font-size: 0.72rem;
  font-weight: 500;
  letter-spacing: 0.18em;
  color: #F5F4F0;
  user-select: none;
}
.endstrip__cu { color: var(--accent); }
.endstrip__line {
  flex: 1 1 16rem;
  font-family: var(--font-sans);
  font-size: 0.7rem;
  line-height: 1.7;
  color: rgba(245, 244, 240, 0.42);
}
.endstrip__aside {
  display: flex;
  align-items: center;
  gap: 1rem;
  margin-left: auto;
}
.endstrip__contact {
  font-family: var(--font-sans);
  font-size: 0.58rem;
  letter-spacing: 0.22em;
  text-transform: uppercase;
  text-decoration: none;
  color: rgba(245, 244, 240, 0.55);
  transition: color 0.2s;
}
.endstrip__contact:hover { color: var(--accent); }

@media (max-width: 640px) {
  .endstrip__inner { flex-direction: column; align-items: flex-start; }
  /* flex: 1 1 16rem was written for the row layout above, where 16rem is a
     sensible basis *width*. In a column flex container the same rule reads
     its basis as a *height* instead, reserving 16rem of empty vertical space
     under the one-line blurb — the "huge gap before the footer links" bug. */
  .endstrip__line { flex: none; }
  .endstrip__aside { margin-left: 0; }
}
</style>
