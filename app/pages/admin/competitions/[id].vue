<script setup lang="ts">
// One competition: its phase, settings, roster, judges and the live tally.
//
// The phase buttons are the whole permission model — they alone decide
// whether attendees can upload, vote, or see results — so they sit at the top
// where the admin running the event can reach them quickly.
definePageMeta({ layout: 'admin', middleware: 'admin' })

const { t } = useI18n()
const localePath = useLocalePath()
const route = useRoute()
const id = computed(() => String(route.params.id || ''))
const api = computed(() => `/api/admin/competitions/${encodeURIComponent(id.value)}`)

type Status = 'draft' | 'submissions' | 'voting' | 'closed' | 'results'
const PHASES: Status[] = ['draft', 'submissions', 'voting', 'closed', 'results']

interface Competition {
  id: string
  title: string
  description: string | null
  status: Status
  accessMode: 'roster' | 'open'
  accessCode: string | null
  scoring: 'public' | 'judges' | 'both'
  publicWeight: number
  judgeWeight: number
  maxEntriesPerPerson: number
  votesPerPerson: number
  votesPerJudge: number
  maxBytesPerPhoto: number
}

interface Participant {
  id: string
  role: 'attendee' | 'judge'
  name: string
  phone: string | null
  groupName: string | null
  judgeCode: string | null
  lastSeenAt: string | null
  entries: number
  votes: number
}

interface Result {
  id: string
  title: string | null
  name: string
  groupName: string | null
  attendeeVotes: number
  judgeVotes: number
  score: number
  rank: number
  imageUrl: string
}

interface Detail {
  competition: Competition
  participants: Participant[]
  results: Result[]
}

const { data, refresh, error: loadError } = await useFetch<Detail>(api, { key: () => `admin-competition-${id.value}` })

useHead(() => ({ title: data.value?.competition.title || t('adminCompetitions.title') }))

const message = ref('')
const error = ref('')
function fail(err: unknown, fallback: string) {
  error.value = (err as { data?: { message?: string } })?.data?.message || fallback
}

// ── Settings form ───────────────────────────────────────────────────────────
const form = reactive({
  title: '',
  description: '',
  accessMode: 'roster' as Competition['accessMode'],
  accessCode: '',
  scoring: 'public' as Competition['scoring'],
  publicWeight: 1,
  judgeWeight: 1,
  maxEntriesPerPerson: 3,
  votesPerPerson: 2,
  votesPerJudge: 5,
  maxMb: 15
})

function resetForm() {
  const c = data.value?.competition
  if (!c) return
  form.title = c.title
  form.description = c.description ?? ''
  form.accessMode = c.accessMode
  form.accessCode = c.accessCode ?? ''
  form.scoring = c.scoring
  form.publicWeight = c.publicWeight
  form.judgeWeight = c.judgeWeight
  form.maxEntriesPerPerson = c.maxEntriesPerPerson
  form.votesPerPerson = c.votesPerPerson
  form.votesPerJudge = c.votesPerJudge
  form.maxMb = Math.round(c.maxBytesPerPhoto / (1024 * 1024))
}
watch(() => data.value?.competition, resetForm, { immediate: true })

const saving = ref(false)
async function patch(body: Record<string, unknown>, success: string) {
  saving.value = true
  error.value = ''
  message.value = ''
  try {
    await $fetch(api.value, { method: 'PATCH', body })
    await refresh()
    message.value = success
  } catch (err) {
    fail(err, t('admin.saveFailed'))
  } finally {
    saving.value = false
  }
}

function saveSettings() {
  return patch({
    title: form.title.trim(),
    description: form.description.trim() || null,
    accessMode: form.accessMode,
    accessCode: form.accessCode.trim() || null,
    scoring: form.scoring,
    publicWeight: Number(form.publicWeight),
    judgeWeight: Number(form.judgeWeight),
    maxEntriesPerPerson: Number(form.maxEntriesPerPerson),
    votesPerPerson: Number(form.votesPerPerson),
    votesPerJudge: Number(form.votesPerJudge),
    maxBytesPerPhoto: Math.min(15, Math.max(1, Number(form.maxMb))) * 1024 * 1024
  }, t('adminCompetitions.saved'))
}

function setPhase(status: Status) {
  if (status === data.value?.competition.status) return
  if (!confirm(t('adminCompetitions.phaseConfirm', { phase: t(`adminCompetitions.status.${status}`) }))) return
  return patch({ status }, t('adminCompetitions.phaseChanged'))
}

// ── Links ───────────────────────────────────────────────────────────────────
const publicPath = computed(() => localePath(`/compete/${id.value}`))
const resultsPath = computed(() => localePath(`/compete/${id.value}/results`))
const publicUrl = computed(() => import.meta.client ? `${window.location.origin}${publicPath.value}` : publicPath.value)
async function copyLink() {
  try {
    await navigator.clipboard.writeText(publicUrl.value)
    message.value = t('admin.linkCopied')
  } catch {
    error.value = publicUrl.value
  }
}

// ── Roster ──────────────────────────────────────────────────────────────────
const attendees = computed(() => (data.value?.participants ?? []).filter(p => p.role === 'attendee'))
const judges = computed(() => (data.value?.participants ?? []).filter(p => p.role === 'judge'))
const rosterText = ref('')
const importing = ref(false)
const rosterFilter = ref('')
const filteredAttendees = computed(() => {
  const q = rosterFilter.value.trim().toLowerCase()
  if (!q) return attendees.value
  return attendees.value.filter(p =>
    p.name.toLowerCase().includes(q)
    || (p.phone ?? '').includes(q.replace(/\D/g, '') || q)
    || (p.groupName ?? '').toLowerCase().includes(q)
  )
})

async function importRoster() {
  importing.value = true
  error.value = ''
  message.value = ''
  try {
    const res = await $fetch<{ imported: number, skippedCount: number, skipped: string[] }>(`${api.value}/roster`, {
      method: 'POST',
      body: { text: rosterText.value }
    })
    message.value = t('adminCompetitions.imported', { n: res.imported, skipped: res.skippedCount })
    if (res.skippedCount) error.value = `${t('adminCompetitions.skippedRows')}\n${res.skipped.join('\n')}`
    rosterText.value = ''
    await refresh()
  } catch (err) {
    fail(err, t('admin.saveFailed'))
  } finally {
    importing.value = false
  }
}

async function onRosterFile(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (file) rosterText.value = await file.text()
}

async function removeParticipant(p: Participant) {
  if (!confirm(t('adminCompetitions.removeParticipantConfirm', { name: p.name }))) return
  try {
    await $fetch(`${api.value}/participants/${encodeURIComponent(p.id)}`, { method: 'DELETE' })
    await refresh()
  } catch (err) {
    fail(err, t('admin.deleteFailed'))
  }
}

// ── Judges ──────────────────────────────────────────────────────────────────
const judgeName = ref('')
async function addJudge() {
  if (!judgeName.value.trim()) return
  try {
    await $fetch(`${api.value}/judges`, { method: 'POST', body: { name: judgeName.value.trim() } })
    judgeName.value = ''
    await refresh()
  } catch (err) {
    fail(err, t('admin.saveFailed'))
  }
}

// ── Entries ─────────────────────────────────────────────────────────────────
async function removeEntry(entry: Result) {
  if (!confirm(t('adminCompetitions.removeEntryConfirm'))) return
  try {
    await $fetch(`${api.value}/entries/${encodeURIComponent(entry.id)}`, { method: 'DELETE' })
    await refresh()
  } catch (err) {
    fail(err, t('admin.deleteFailed'))
  }
}

const totalVotes = computed(() => (data.value?.participants ?? []).reduce((sum, p) => sum + p.votes, 0))
const votersUsed = computed(() => (data.value?.participants ?? []).filter(p => p.votes > 0).length)

// ── Delete ──────────────────────────────────────────────────────────────────
async function deleteCompetition() {
  if (!confirm(t('adminCompetitions.deleteConfirm', { title: data.value?.competition.title ?? '' }))) return
  try {
    await $fetch(api.value, { method: 'DELETE' })
    await navigateTo(localePath('/admin/competitions'))
  } catch (err) {
    fail(err, t('admin.deleteFailed'))
  }
}

function formatPhone(phone: string | null) {
  if (!phone) return ''
  return phone.length === 10 ? `${phone.slice(0, 3)}-${phone.slice(3, 6)}-${phone.slice(6)}` : phone
}
</script>

<template>
  <div class="admin-wrap">
    <div class="page-head">
      <div>
        <NuxtLink :to="localePath('/admin/competitions')" class="back">{{ t('adminCompetitions.title') }}</NuxtLink>
        <h1>{{ data?.competition.title || t('adminCompetitions.title') }}</h1>
      </div>
      <div v-if="data" class="page-head__actions">
        <button class="btn btn--ghost" type="button" @click="copyLink">{{ t('adminCompetitions.copyLink') }}</button>
        <a class="btn btn--ghost" :href="publicPath" target="_blank" rel="noopener">{{ t('adminCompetitions.openPage') }}</a>
        <a class="btn" :href="resultsPath" target="_blank" rel="noopener">{{ t('adminCompetitions.openReveal') }}</a>
      </div>
    </div>

    <p v-if="loadError" class="error">{{ t('adminCompetitions.notFound') }}</p>

    <template v-if="data">
      <p v-if="message" class="notice" role="status">{{ message }}</p>
      <p v-if="error" class="error" role="alert">{{ error }}</p>

      <!-- Phase -->
      <section class="panel">
        <h2 class="panel__title">{{ t('adminCompetitions.phase') }}</h2>
        <div class="phases">
          <button
            v-for="phase in PHASES"
            :key="phase"
            type="button"
            class="phase"
            :class="{ 'is-current': data.competition.status === phase }"
            :disabled="saving"
            @click="setPhase(phase)"
          >
            <span class="phase__name">{{ t(`adminCompetitions.status.${phase}`) }}</span>
            <span class="phase__hint">{{ t(`adminCompetitions.statusHint.${phase}`) }}</span>
          </button>
        </div>
        <p class="stats">
          {{ t('adminCompetitions.participantCount', { n: attendees.length }) }} ·
          {{ t('adminCompetitions.judgeCount', { n: judges.length }) }} ·
          {{ t('adminCompetitions.entryCount', { n: data.results.length }) }} ·
          {{ t('adminCompetitions.voteStats', { votes: totalVotes, voters: votersUsed }) }}
        </p>
      </section>

      <!-- Settings -->
      <section class="panel">
        <h2 class="panel__title">{{ t('adminCompetitions.settings') }}</h2>
        <form class="form" @submit.prevent="saveSettings">
          <label class="field field--wide">
            <span class="label">{{ t('adminCompetitions.fieldTitle') }}</span>
            <input v-model="form.title" class="input" type="text" maxlength="200" required>
          </label>
          <label class="field field--wide">
            <span class="label">{{ t('adminCompetitions.fieldDescription') }}</span>
            <textarea v-model="form.description" class="input" rows="3" maxlength="2000" />
          </label>
          <label class="field">
            <span class="label">{{ t('adminCompetitions.accessMode') }}</span>
            <select v-model="form.accessMode" class="input">
              <option value="roster">{{ t('adminCompetitions.accessRoster') }}</option>
              <option value="open">{{ t('adminCompetitions.accessOpen') }}</option>
            </select>
          </label>
          <label v-if="form.accessMode === 'roster'" class="field">
            <span class="label">{{ t('adminCompetitions.accessCode') }}</span>
            <input v-model="form.accessCode" class="input" type="text" maxlength="32" :placeholder="t('adminCompetitions.accessCodePlaceholder')">
            <span class="hint">{{ t('adminCompetitions.accessCodeHint') }}</span>
          </label>
          <label class="field">
            <span class="label">{{ t('adminCompetitions.scoringLabel') }}</span>
            <select v-model="form.scoring" class="input">
              <option value="public">{{ t('adminCompetitions.scoring.public') }}</option>
              <option value="judges">{{ t('adminCompetitions.scoring.judges') }}</option>
              <option value="both">{{ t('adminCompetitions.scoring.both') }}</option>
            </select>
          </label>
          <template v-if="form.scoring === 'both'">
            <label class="field field--small">
              <span class="label">{{ t('adminCompetitions.publicWeight') }}</span>
              <input v-model.number="form.publicWeight" class="input" type="number" min="0" max="100">
            </label>
            <label class="field field--small">
              <span class="label">{{ t('adminCompetitions.judgeWeight') }}</span>
              <input v-model.number="form.judgeWeight" class="input" type="number" min="0" max="100">
            </label>
          </template>
          <label class="field field--small">
            <span class="label">{{ t('adminCompetitions.maxEntries') }}</span>
            <input v-model.number="form.maxEntriesPerPerson" class="input" type="number" min="1" max="50">
          </label>
          <label v-if="form.scoring !== 'judges'" class="field field--small">
            <span class="label">{{ t('adminCompetitions.votesPerPerson') }}</span>
            <input v-model.number="form.votesPerPerson" class="input" type="number" min="1" max="50">
          </label>
          <label v-if="form.scoring !== 'public'" class="field field--small">
            <span class="label">{{ t('adminCompetitions.votesPerJudge') }}</span>
            <input v-model.number="form.votesPerJudge" class="input" type="number" min="1" max="200">
          </label>
          <label class="field field--small">
            <span class="label">{{ t('adminCompetitions.maxMb') }}</span>
            <input v-model.number="form.maxMb" class="input" type="number" min="1" max="15">
          </label>
          <div class="form__actions">
            <button class="btn" type="submit" :disabled="saving">{{ saving ? t('admin.saving') : t('admin.save') }}</button>
          </div>
        </form>
      </section>

      <!-- Roster -->
      <section class="panel">
        <h2 class="panel__title">{{ t('adminCompetitions.attendees') }} <span class="panel__count">{{ attendees.length }}</span></h2>
        <template v-if="data.competition.accessMode === 'roster'">
          <p class="hint">{{ t('adminCompetitions.rosterHint') }}</p>
          <textarea v-model="rosterText" class="input input--mono" rows="5" :placeholder="t('adminCompetitions.rosterPlaceholder')" />
          <div class="row-actions">
            <label class="btn btn--ghost btn--file">
              {{ t('adminCompetitions.chooseCsv') }}
              <input type="file" accept=".csv,.tsv,.txt,text/csv,text/plain" @change="onRosterFile">
            </label>
            <button class="btn" type="button" :disabled="importing || !rosterText.trim()" @click="importRoster">
              {{ importing ? t('admin.saving') : t('adminCompetitions.importRoster') }}
            </button>
          </div>
        </template>
        <p v-else class="hint">{{ t('adminCompetitions.openHint') }}</p>

        <input v-if="attendees.length > 8" v-model="rosterFilter" class="input filter" type="search" :placeholder="t('admin.search')">
        <table v-if="filteredAttendees.length" class="table">
          <thead>
            <tr>
              <th>{{ t('adminCompetitions.colName') }}</th>
              <th>{{ t('adminCompetitions.colPhone') }}</th>
              <th>{{ t('adminCompetitions.colGroup') }}</th>
              <th class="num">{{ t('adminCompetitions.colEntries') }}</th>
              <th class="num">{{ t('adminCompetitions.colVotes') }}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            <tr v-for="p in filteredAttendees" :key="p.id">
              <td>{{ p.name }}</td>
              <td class="mono">{{ formatPhone(p.phone) }}</td>
              <td>{{ p.groupName }}</td>
              <td class="num">{{ p.entries }}</td>
              <td class="num">{{ p.votes }}</td>
              <td class="num"><button class="minibtn" type="button" @click="removeParticipant(p)">{{ t('admin.delete') }}</button></td>
            </tr>
          </tbody>
        </table>
      </section>

      <!-- Judges -->
      <section v-if="data.competition.scoring !== 'public'" class="panel">
        <h2 class="panel__title">{{ t('adminCompetitions.judges') }} <span class="panel__count">{{ judges.length }}</span></h2>
        <p class="hint">{{ t('adminCompetitions.judgesHint') }}</p>
        <form class="row-actions" @submit.prevent="addJudge">
          <input v-model="judgeName" class="input input--inline" type="text" maxlength="120" :placeholder="t('adminCompetitions.judgeName')">
          <button class="btn" type="submit" :disabled="!judgeName.trim()">{{ t('adminCompetitions.addJudge') }}</button>
        </form>
        <table v-if="judges.length" class="table">
          <thead>
            <tr>
              <th>{{ t('adminCompetitions.colName') }}</th>
              <th>{{ t('adminCompetitions.colCode') }}</th>
              <th class="num">{{ t('adminCompetitions.colVotes') }}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            <tr v-for="p in judges" :key="p.id">
              <td>{{ p.name }}</td>
              <td class="mono">{{ p.judgeCode }}</td>
              <td class="num">{{ p.votes }} / {{ data.competition.votesPerJudge }}</td>
              <td class="num"><button class="minibtn" type="button" @click="removeParticipant(p)">{{ t('admin.delete') }}</button></td>
            </tr>
          </tbody>
        </table>
      </section>

      <!-- Entries + tally -->
      <section class="panel">
        <h2 class="panel__title">{{ t('adminCompetitions.entries') }} <span class="panel__count">{{ data.results.length }}</span></h2>
        <p class="hint">{{ t('adminCompetitions.entriesHint') }}</p>
        <p v-if="!data.results.length" class="hint">{{ t('adminCompetitions.noEntries') }}</p>
        <ul v-else class="entries">
          <li v-for="entry in data.results" :key="entry.id" class="entry">
            <a :href="entry.imageUrl" target="_blank" rel="noopener" class="entry__img-link">
              <img class="entry__img" :src="entry.imageUrl" alt="" loading="lazy">
            </a>
            <div class="entry__body">
              <p class="entry__rank">#{{ entry.rank }} · {{ t('adminCompetitions.score', { n: entry.score }) }}</p>
              <p class="entry__title">{{ entry.title || t('adminCompetitions.untitled') }}</p>
              <p class="entry__by">{{ entry.name }}<template v-if="entry.groupName"> · {{ entry.groupName }}</template></p>
              <p class="entry__votes">
                <template v-if="data.competition.scoring !== 'judges'">{{ t('adminCompetitions.attendeeVotes', { n: entry.attendeeVotes }) }}</template>
                <template v-if="data.competition.scoring === 'both'"> · </template>
                <template v-if="data.competition.scoring !== 'public'">{{ t('adminCompetitions.judgeVotes', { n: entry.judgeVotes }) }}</template>
              </p>
              <button class="minibtn" type="button" @click="removeEntry(entry)">{{ t('adminCompetitions.removeEntry') }}</button>
            </div>
          </li>
        </ul>
      </section>

      <section class="panel panel--danger">
        <button class="btn btn--danger" type="button" @click="deleteCompetition">{{ t('adminCompetitions.delete') }}</button>
      </section>
    </template>
  </div>
</template>

<style scoped>
.admin-wrap { max-width: 1120px; margin: 0 auto; padding: 3rem 2rem 5rem; }
.page-head { display: flex; align-items: flex-end; justify-content: space-between; flex-wrap: wrap; margin-bottom: 2rem; gap: 1.5rem; }
.page-head h1 { font-family: var(--font-serif); font-size: 2.3rem; font-weight: 200; margin-top: 0.5rem; }
.page-head__actions { display: flex; flex-wrap: wrap; gap: 0.5rem; }
.back { display: inline-block; font-size: 0.58rem; letter-spacing: 0.18em; text-transform: uppercase; color: var(--muted); text-decoration: none; }
.back:hover { color: var(--accent); }

.notice, .error {
  border-left: 2px solid var(--accent);
  padding: 0.5rem 0.75rem;
  margin-bottom: 1rem;
  font-family: var(--font-sans);
  font-size: 0.8rem;
  background: #fff;
  white-space: pre-line;
}
.notice { border-left-color: #2F7D4F; }

.panel {
  border: 1px solid var(--subtle);
  background: var(--paper);
  padding: 1.25rem;
  margin-bottom: 1.25rem;
  display: flex;
  flex-direction: column;
  gap: 0.9rem;
}
.panel--danger { background: transparent; border-style: dashed; align-items: flex-start; }
.panel__title {
  font-family: var(--font-sans);
  font-size: 0.62rem;
  font-weight: 600;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--dark);
}
.panel__count { color: var(--muted); font-weight: 400; margin-left: 0.3rem; }
.hint { font-family: var(--font-sans); font-size: 0.74rem; line-height: 1.55; color: var(--muted); }
.stats { font-family: var(--font-sans); font-size: 0.74rem; color: var(--muted); }

.phases { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 0.5rem; }
.phase {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  text-align: left;
  border: 1px solid var(--subtle);
  background: #fff;
  padding: 0.7rem 0.75rem;
  cursor: pointer;
  color: var(--dark);
}
.phase:hover { border-color: var(--accent); }
.phase.is-current { border-color: var(--accent); background: var(--accent); color: #fff; }
.phase__name { font-family: var(--font-sans); font-size: 0.62rem; font-weight: 600; letter-spacing: 0.14em; text-transform: uppercase; }
.phase__hint { font-family: var(--font-sans); font-size: 0.68rem; line-height: 1.4; opacity: 0.75; }

.form { display: flex; flex-wrap: wrap; gap: 0.9rem 1rem; align-items: flex-start; }
.field { display: flex; flex-direction: column; gap: 0.35rem; flex: 1 1 14rem; }
.field--wide { flex-basis: 100%; }
.field--small { flex: 0 1 9.5rem; }
.form__actions { flex-basis: 100%; }
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
.input--mono, .mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.78rem; }
.input--inline { flex: 1 1 14rem; width: auto; }
.filter { max-width: 20rem; }

.row-actions { display: flex; flex-wrap: wrap; gap: 0.5rem; align-items: center; }
.btn {
  display: inline-flex;
  align-items: center;
  border: 1px solid var(--dark);
  background: var(--dark);
  color: #fff;
  padding: 0.6rem 1.1rem;
  font-family: var(--font-sans);
  font-size: 0.6rem;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  text-decoration: none;
  cursor: pointer;
}
.btn:disabled { opacity: 0.5; cursor: default; }
.btn--ghost { background: transparent; color: var(--dark); }
.btn--ghost:hover { border-color: var(--accent); color: var(--accent); }
.btn--danger { background: transparent; border-color: #B0243C; color: #B0243C; }
.btn--file { position: relative; overflow: hidden; }
.btn--file input { position: absolute; inset: 0; opacity: 0; cursor: pointer; }
.minibtn {
  border: 1px solid var(--subtle);
  background: #fff;
  padding: 0.28rem 0.55rem;
  font-family: var(--font-sans);
  font-size: 0.52rem;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--muted);
  cursor: pointer;
}
.minibtn:hover { border-color: var(--accent); color: var(--accent); }

.table { width: 100%; border-collapse: collapse; font-family: var(--font-sans); font-size: 0.8rem; background: #fff; }
.table th {
  text-align: left;
  font-size: 0.52rem;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--muted);
  font-weight: 500;
  padding: 0.5rem 0.6rem;
  border-bottom: 1px solid var(--subtle);
}
.table td { padding: 0.5rem 0.6rem; border-bottom: 1px solid var(--subtle); color: var(--dark); }
.table .num { text-align: right; white-space: nowrap; }

.entries { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: 0.9rem; }
.entry { background: #fff; border: 1px solid var(--subtle); display: flex; flex-direction: column; }
.entry__img-link { display: block; }
.entry__img { display: block; width: 100%; aspect-ratio: 4 / 3; object-fit: cover; background: var(--subtle); }
.entry__body { padding: 0.65rem 0.75rem 0.8rem; display: flex; flex-direction: column; gap: 0.25rem; align-items: flex-start; }
.entry__rank { font-family: var(--font-sans); font-size: 0.55rem; letter-spacing: 0.14em; text-transform: uppercase; color: var(--accent); font-weight: 600; }
.entry__title { font-family: var(--font-serif); font-size: 1rem; color: var(--dark); }
.entry__by, .entry__votes { font-family: var(--font-sans); font-size: 0.72rem; color: var(--muted); }

@media (max-width: 800px) {
  .admin-wrap { padding: 2rem 1rem 4rem; }
  .phases { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .table { display: block; overflow-x: auto; }
}
</style>
