<script setup lang="ts">
definePageMeta({ layout: 'admin', middleware: 'admin' })

const { t } = useI18n()
const localePath = useLocalePath()
// Every card on this page renders a single number, so it takes a single
// endpoint of count(*) queries. Fetching the eight underlying list endpoints
// instead meant downloading every album (rows JSON and all) to show a count.
// The card that opens the collections list counts collections — every other
// card counts whatever is on the page it links to.
const { data: stats } = await useFetch('/api/admin/stats')
const { user } = useUserSession()
const canManage = computed(() => user.value?.role === 'owner' || user.value?.role === 'admin')

const primarySections = computed(() => [
  {
    key: 'albums',
    title: t('admin.albums'),
    count: stats.value?.albums ?? 0,
    meta: t('admin.galleryWork'),
    to: localePath('/admin/albums'),
    newTo: localePath('/admin/albums/new'),
    quickLabel: t('admin.newAlbum')
  },
  {
    key: 'posts',
    title: t('admin.posts'),
    count: stats.value?.posts ?? 0,
    meta: t('admin.editorialWriting'),
    to: localePath('/admin/posts'),
    newTo: localePath('/admin/posts/new'),
    quickLabel: t('admin.newPost')
  },
  {
    key: 'activities',
    title: t('admin.activities'),
    count: stats.value?.events ?? 0,
    meta: t('admin.activityWork'),
    to: localePath('/admin/activities')
  },
  {
    key: 'submissions',
    title: t('adminPool.title'),
    count: stats.value?.collections ?? 0,
    meta: t('adminPool.sub'),
    to: localePath('/admin/submissions')
  },
  {
    key: 'competitions',
    title: t('adminCompetitions.title'),
    count: stats.value?.competitions ?? 0,
    meta: t('adminCompetitions.sub'),
    to: localePath('/admin/competitions')
  }
])

interface SecondarySection {
  key: string
  title: string
  count: number | null
  meta: string
  to: string
  target?: '_blank'
}

const secondarySections = computed<SecondarySection[]>(() => [
  {
    key: 'members',
    title: t('admin.membersTitle'),
    count: stats.value?.members ?? 0,
    meta: t('admin.memberWork'),
    to: localePath('/admin/members')
  },
  {
    key: 'heroImages',
    title: t('admin.heroImagesTitle'),
    count: stats.value?.heroImages ?? 0,
    meta: t('admin.heroImagesMeta'),
    to: localePath('/admin/hero-images')
  },
  {
    // History + Clubroom share one page; the count is how many of the two slots
    // currently have an image set.
    key: 'landingImages',
    title: t('admin.landingImagesTitle'),
    count: stats.value?.landingImages ?? 0,
    meta: t('admin.landingImagesMeta'),
    to: localePath('/admin/landing-images')
  },
  {
    key: 'r2Images',
    title: t('admin.r2ImagesTitle'),
    count: null as number | null,
    meta: t('admin.r2ImagesMeta'),
    to: localePath('/admin/r2-images')
  },
  {
    key: 'cost',
    title: t('admin.costTitle'),
    count: null as number | null,
    meta: t('admin.costMeta'),
    to: localePath('/admin/cost')
  },
  {
    key: 'account',
    title: t('admin.account'),
    count: null as number | null,
    meta: t('admin.accountMeta'),
    to: localePath('/admin/account')
  }
])

const adminSections = computed(() => [
  {
    key: 'users',
    title: t('admin.iamTitle'),
    meta: t('admin.iamMeta'),
    to: localePath('/admin/users')
  },
  {
    key: 'logs',
    title: t('admin.logsTitle'),
    meta: t('admin.logsMeta'),
    to: localePath('/admin/logs')
  }
])

useHead({ title: () => `${t('admin.dashboard')} - Admin` })
</script>

<template>
  <div class="admin-wrap">
    <section class="dash">
      <div class="dash__head">
        <p class="kicker">{{ t('admin.brand') }}</p>
        <h1>{{ t('admin.dashboard') }}</h1>
        <p>{{ t('admin.dashboardLead') }}</p>
      </div>

      <div class="dash__group">
        <p class="dash__label">{{ t('admin.sectionContent') }}</p>
        <div class="primary">
          <article v-for="section in primarySections" :key="section.key" class="pcard">
            <NuxtLink :to="section.to" class="pcard__link">
              <span class="pcard__count">{{ section.count }}</span>
              <span class="pcard__text">
                <strong>{{ section.title }}</strong>
                <small>{{ section.meta }}</small>
              </span>
            </NuxtLink>
            <NuxtLink v-if="section.newTo && section.quickLabel" :to="section.newTo" class="pcard__new">{{ section.quickLabel }}</NuxtLink>
          </article>
        </div>
      </div>

      <div class="dash__group">
        <p class="dash__label">{{ t('admin.sectionUtilities') }}</p>
        <div class="secondary" role="list">
          <NuxtLink
            v-for="section in secondarySections"
            :key="section.key"
            :to="section.to"
            class="scard"
            role="listitem"
            :target="section.target"
            :rel="section.target === '_blank' ? 'noopener noreferrer' : undefined"
          >
            <span v-if="section.count !== null" class="scard__count">{{ section.count }}</span>
            <span class="scard__text">
              <strong>{{ section.title }}</strong>
              <small>{{ section.meta }}</small>
            </span>
          </NuxtLink>
        </div>
      </div>

      <div v-if="canManage" class="dash__group dash__group--admin">
        <p class="dash__label">{{ t('admin.sectionAdminTools') }}</p>
        <div class="admintools">
          <NuxtLink v-for="section in adminSections" :key="section.key" :to="section.to" class="acard">
            <strong>{{ section.title }}</strong>
            <small>{{ section.meta }}</small>
          </NuxtLink>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.admin-wrap { max-width: 1120px; margin: 0 auto; padding: 3rem 2rem 5rem; }
.dash { display: grid; gap: 2.75rem; }
.dash__head { max-width: 720px; }
.kicker { color: var(--accent); font-size: 0.58rem; letter-spacing: 0.2em; text-transform: uppercase; margin-bottom: 1rem; }
.dash__head h1 { font-family: var(--font-serif); font-size: clamp(3rem, 7vw, 6.5rem); line-height: 0.95; font-weight: 200; margin-bottom: 1rem; }
.dash__head p:last-child { color: var(--muted); line-height: 1.8; max-width: 560px; }

.dash__group { display: grid; gap: 1.25rem; }
.dash__label { color: var(--accent); font-size: 0.56rem; letter-spacing: 0.2em; text-transform: uppercase; }

/* Primary — featured content cards */
.primary { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 1px; background: var(--subtle); border: 1px solid var(--subtle); }
.pcard { display: flex; flex-direction: column; background: var(--body-bg); }
.pcard__link { display: grid; grid-template-columns: auto 1fr; gap: 1.5rem; align-items: start; padding: 2rem 1.75rem; color: var(--dark); text-decoration: none; transition: color 0.2s; }
.pcard__link:hover { color: var(--accent); }
.pcard__count { font-family: var(--font-serif); font-size: 4.5rem; line-height: 0.85; font-weight: 200; }
.pcard__text strong { display: block; font-size: 1rem; font-weight: 500; margin-bottom: 0.5rem; }
.pcard__text small { display: block; color: var(--muted); font-size: 0.74rem; line-height: 1.6; }
.pcard__new { align-self: flex-start; margin: 0 1.75rem 1.75rem; font-size: 0.6rem; letter-spacing: 0.18em; text-transform: uppercase; padding: 0.75rem 1.25rem; background: var(--dark); color: #F5F4F0; text-decoration: none; transition: background 0.2s; }
.pcard__new:hover { background: var(--accent); }

/* Secondary — compact utility tiles */
.secondary { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); border-top: 1px solid var(--subtle); }
.scard { display: grid; grid-template-columns: auto 1fr; gap: 1rem; align-items: center; padding: 1.25rem 0; color: var(--dark); text-decoration: none; border-bottom: 1px solid var(--subtle); transition: color 0.2s; }
.scard:not(:first-child) { padding-left: 1.25rem; border-left: 1px solid var(--subtle); }
.scard:not(:last-child) { padding-right: 1.25rem; }
.scard:hover { color: var(--accent); }
.scard__count { font-family: var(--font-serif); font-size: 2.25rem; line-height: 0.9; font-weight: 200; }
.scard__text strong { display: block; font-weight: 500; margin-bottom: 0.3rem; }
.scard__text small { color: var(--muted); font-size: 0.68rem; line-height: 1.5; }

/* Admin tools — visually set apart */
.dash__group--admin { padding: 1.5rem; border: 1px solid var(--subtle); background: var(--paper); }
.admintools { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 0.75rem; }
.acard { display: grid; gap: 0.35rem; padding: 1.1rem 1.25rem; border: 1px solid var(--subtle); color: var(--dark); text-decoration: none; transition: border-color 0.2s, color 0.2s; }
.acard:hover { border-color: var(--accent); color: var(--accent); }
.acard strong { font-weight: 500; letter-spacing: 0.04em; }
.acard small { color: var(--muted); font-size: 0.68rem; line-height: 1.5; }

@media (max-width: 720px) {
  .secondary { grid-template-columns: 1fr; }
  .scard:nth-child(n) { padding-left: 0; padding-right: 0; border-left: 0; }
}
</style>
