<script setup lang="ts">
// Competitions overview: create one on top, existing ones below. Everything
// about a single competition (phase, roster, judges, tally) lives on its own
// page one level down.
definePageMeta({ layout: 'admin', middleware: 'admin' })

const { t } = useI18n()
const localePath = useLocalePath()

useHead(() => ({ title: t('adminCompetitions.title') }))

interface CompetitionRow {
  id: string
  title: string
  status: 'draft' | 'submissions' | 'voting' | 'closed' | 'results'
  accessMode: 'roster' | 'open'
  scoring: 'public' | 'judges' | 'both'
  participantCount: number
  entryCount: number
}

const { data: rows, refresh } = await useFetch<CompetitionRow[]>('/api/admin/competitions')

const title = ref('')
const accessMode = ref<'roster' | 'open'>('roster')
const creating = ref(false)
const error = ref('')

async function create() {
  if (!title.value.trim()) return
  creating.value = true
  error.value = ''
  try {
    const created = await $fetch<{ id: string }>('/api/admin/competitions', {
      method: 'POST',
      body: { title: title.value.trim(), accessMode: accessMode.value }
    })
    title.value = ''
    await refresh()
    await navigateTo(localePath(`/admin/competitions/${created.id}`))
  } catch (err) {
    error.value = (err as { data?: { message?: string } })?.data?.message || t('adminCompetitions.createFailed')
  } finally {
    creating.value = false
  }
}
</script>

<template>
  <div class="admin-wrap">
    <div class="page-head">
      <div>
        <NuxtLink :to="localePath('/admin')" class="back">{{ t('admin.dashboard') }}</NuxtLink>
        <h1>{{ t('adminCompetitions.title') }}</h1>
        <p class="sub">{{ t('adminCompetitions.sub') }}</p>
      </div>
    </div>

    <form class="create" @submit.prevent="create">
      <label class="create__field create__field--grow">
        <span class="label">{{ t('adminCompetitions.newTitle') }}</span>
        <input v-model="title" class="input" type="text" maxlength="200" required :placeholder="t('adminCompetitions.newTitlePlaceholder')">
      </label>
      <label class="create__field">
        <span class="label">{{ t('adminCompetitions.accessMode') }}</span>
        <select v-model="accessMode" class="input">
          <option value="roster">{{ t('adminCompetitions.accessRoster') }}</option>
          <option value="open">{{ t('adminCompetitions.accessOpen') }}</option>
        </select>
      </label>
      <button class="btn" type="submit" :disabled="creating || !title.trim()">
        {{ creating ? t('admin.saving') : t('adminCompetitions.create') }}
      </button>
    </form>
    <p v-if="error" class="error">{{ error }}</p>

    <p v-if="!rows?.length" class="empty">{{ t('adminCompetitions.empty') }}</p>
    <ul v-else class="list">
      <li v-for="row in rows" :key="row.id" class="item">
        <NuxtLink :to="localePath(`/admin/competitions/${row.id}`)" class="item__link">
          <span class="pill" :class="`pill--${row.status}`">{{ t(`adminCompetitions.status.${row.status}`) }}</span>
          <span class="item__title">{{ row.title }}</span>
          <span class="item__meta">
            {{ t(`adminCompetitions.scoring.${row.scoring}`) }} ·
            {{ t('adminCompetitions.participantCount', { n: row.participantCount }) }} ·
            {{ t('adminCompetitions.entryCount', { n: row.entryCount }) }}
          </span>
        </NuxtLink>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.admin-wrap { max-width: 1120px; margin: 0 auto; padding: 3rem 2rem 5rem; }
.page-head { display: flex; align-items: flex-end; justify-content: space-between; margin-bottom: 2rem; gap: 1.5rem; }
.page-head h1 { font-family: var(--font-serif); font-size: 2.5rem; font-weight: 200; margin-top: 0.5rem; }
.back { display: inline-block; font-size: 0.58rem; letter-spacing: 0.18em; text-transform: uppercase; color: var(--muted); text-decoration: none; }
.back:hover { color: var(--accent); }
.sub { font-size: 0.7rem; letter-spacing: 0.1em; color: var(--muted); margin-top: 0.35rem; }

.create {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 0.9rem;
  border: 1px solid var(--subtle);
  background: var(--paper);
  padding: 1.1rem 1.25rem;
}
.create__field { display: flex; flex-direction: column; gap: 0.35rem; }
.create__field--grow { flex: 1 1 18rem; }
.label { font-family: var(--font-sans); font-size: 0.55rem; letter-spacing: 0.16em; text-transform: uppercase; color: var(--muted); }
.input {
  border: 1px solid var(--subtle);
  background: #fff;
  padding: 0.55rem 0.7rem;
  font-family: var(--font-sans);
  font-size: 0.85rem;
  color: var(--dark);
  width: 100%;
}
.input:focus { outline: none; border-color: var(--accent); }
.btn {
  border: 1px solid var(--dark);
  background: var(--dark);
  color: #fff;
  padding: 0.6rem 1.1rem;
  font-family: var(--font-sans);
  font-size: 0.6rem;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  cursor: pointer;
}
.btn:disabled { opacity: 0.5; cursor: default; }
.error { margin-top: 0.8rem; border-left: 2px solid var(--accent); padding: 0.4rem 0.7rem; font-size: 0.8rem; }
.empty { margin-top: 2rem; font-family: var(--font-sans); font-size: 0.85rem; color: var(--muted); }

.list { list-style: none; margin: 2rem 0 0; padding: 0; }
.item { border-top: 1px solid var(--subtle); }
.item__link {
  display: grid;
  grid-template-columns: 7.5rem minmax(0, 1fr) auto;
  align-items: center;
  gap: 1rem;
  padding: 1rem 0.25rem;
  text-decoration: none;
  color: var(--dark);
}
.item__link:hover .item__title { color: var(--accent); }
.item__title { font-family: var(--font-serif); font-size: 1.2rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.item__meta { font-family: var(--font-sans); font-size: 0.72rem; color: var(--muted); white-space: nowrap; }

.pill {
  justify-self: start;
  font-family: var(--font-sans);
  font-size: 0.5rem;
  font-weight: 600;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  border: 1px solid currentColor;
  padding: 0.18rem 0.4rem;
  color: var(--muted);
}
.pill--submissions, .pill--voting { color: var(--accent); }
.pill--results { color: #2F7D4F; }

@media (max-width: 700px) {
  .admin-wrap { padding: 2rem 1rem 4rem; }
  .item__link { grid-template-columns: 1fr; gap: 0.35rem; }
  .item__meta { white-space: normal; }
}
</style>
