<script setup lang="ts">
// Staff live schedule: the participant view plus staff-only rows, owners and
// kit. Unlisted — shared with staff only, never linked from the public pages.
definePageMeta({ layout: 'contribute' })

const { t } = useI18n()
useSeoMeta({
  title: () => `${t('oneday.live.staffView')} · ${t('oneday.title')}`,
  robots: 'noindex, nofollow',
  themeColor: '#0C0C0A'
})
</script>

<template>
  <OnedayLive staff />
</template>
