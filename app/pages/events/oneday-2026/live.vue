<script setup lang="ts">
// Participant live schedule — the link/QR shared in the LINE group.
// Temporary: see shared/oneday2026.ts for how to take the event down.
definePageMeta({ layout: 'contribute' })

const { t } = useI18n()
useSeoMeta({
  title: () => `${t('oneday.live.pageTitle')} · ${t('oneday.title')}`,
  robots: 'noindex, nofollow',
  themeColor: '#0C0C0A'
})
</script>

<template>
  <OnedayLive />
</template>
