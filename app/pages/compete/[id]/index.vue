<script setup lang="ts">
// Participant page for a photo competition. What it shows depends on two
// things: whether this browser is signed in, and the competition's phase.
//
//   not signed in → join: phone (roster), a name (open), or a judge code
//   submissions   → upload entries (attendees), wait (judges)
//   voting        → anonymous gallery, tap to vote
//
// A competition asks one or more questions, each with its own pool. Tabs pick
// the question; the photo limit and the votes shown are that question's only.
//   closed        → gallery read-only, results coming
//   results       → link to the results page
//
// Uploads reuse R2ImageUploader against this competition's own session
// routes, the same way the contribute page does. Uses the contribute layout
// for the same reason that page does: attendees arrive from a QR code, and the
// site nav would only compete with the task.
definePageMeta({ layout: 'contribute' })

const { t } = useI18n()
const localePath = useLocalePath()
const route = useRoute()
const id = computed(() => String(route.params.id || ''))
const api = computed(() => `/api/compete/${encodeURIComponent(id.value)}`)

type Status = 'draft' | 'submissions' | 'voting' | 'closed' | 'results'
type Role = 'attendee' | 'judge'

interface CompetitionState {
  competition: {
    id: string
    title: string
    description: string | null
    status: Status
    accessMode: 'roster' | 'open'
    needsAccessCode: boolean
    scoring: 'public' | 'judges' | 'both'
    maxBytesPerPhoto: number
  }
  questions: Question[]
  me: {
    name: string
    groupName: string | null
    role: Role
    code: string | null
    votedEntryIds: string[]
  } | null
}

interface Question {
  id: string
  title: string
  description: string | null
  maxEntriesPerPerson: number
  votesPerPerson: number
  votesPerJudge: number
  mine: {
    entries: number
    remainingEntries: number
    votesAllowed: number
    votesUsed: number
  } | null
}

interface EntryItem {
  id: string
  questionId: string | null
  title: string | null
  mine?: boolean
  imageUrl: string
}

const { data: state, refresh } = await useFetch<CompetitionState>(api, {
  key: () => `compete-${id.value}`
})

const notFound = computed(() => !state.value)
if (import.meta.server && !state.value) {
  const event = useRequestEvent()
  if (event) setResponseStatus(event, 404)
}

const comp = computed(() => state.value?.competition ?? null)
const me = computed(() => state.value?.me ?? null)
const status = computed<Status>(() => comp.value?.status ?? 'draft')
const questions = computed(() => state.value?.questions ?? [])

// The question tab in view. Falls back to the first question whenever the
// selected one disappears (an admin deleted it) or nothing is selected yet.
const selectedQuestionId = ref<string | null>(null)
const activeQuestion = computed(() =>
  questions.value.find(question => question.id === selectedQuestionId.value) ?? questions.value[0] ?? null
)

useHead(() => ({ title: comp.value?.title || t('compete.title') }))

const errorMessage = ref('')
function apiMessage(err: unknown, fallback: string) {
  const data = (err as { data?: { message?: string } })?.data
  return data?.message || fallback
}

// ── Join ────────────────────────────────────────────────────────────────────
type JoinMode = 'phone' | 'open' | 'claim' | 'judge'
const joinMode = ref<JoinMode>(comp.value?.accessMode === 'open' ? 'open' : 'phone')
const phone = ref('')
const accessCode = ref('')
const nameInput = ref('')
const codeInput = ref('')
const match = ref<{ name: string, groupName: string | null } | null>(null)
const joining = ref(false)

function setJoinMode(mode: JoinMode) {
  joinMode.value = mode
  match.value = null
  errorMessage.value = ''
}

async function join(body: Record<string, unknown>) {
  joining.value = true
  errorMessage.value = ''
  try {
    const res = await $fetch<{ match?: { name: string, groupName: string | null }, signedIn?: boolean }>(
      `${api.value}/join`,
      { method: 'POST', body }
    )
    if (res.match) match.value = res.match
    if (res.signedIn) {
      match.value = null
      await refresh()
    }
  } catch (err) {
    errorMessage.value = apiMessage(err, t('compete.joinFailed'))
  } finally {
    joining.value = false
  }
}

function lookupPhone() {
  return join({ mode: 'phone', phone: phone.value, code: accessCode.value || undefined })
}
function confirmPhone() {
  return join({ mode: 'phone', phone: phone.value, code: accessCode.value || undefined, confirm: true })
}
function notMe() {
  match.value = null
  phone.value = ''
}

async function leave() {
  await $fetch(`${api.value}/leave`, { method: 'POST' }).catch(() => {})
  mine.value = []
  gallery.value = []
  phone.value = ''
  codeInput.value = ''
  await refresh()
}

// ── Entries ─────────────────────────────────────────────────────────────────
const mine = ref<EntryItem[]>([])
const gallery = ref<EntryItem[]>([])
const votedIds = ref<string[]>([])
watch(me, (value) => { votedIds.value = value?.votedEntryIds ?? [] }, { immediate: true })

const showGallery = computed(() => ['voting', 'closed'].includes(status.value))
const mineHere = computed(() => mine.value.filter(entry => entry.questionId === activeQuestion.value?.id))
const galleryHere = computed(() => gallery.value.filter(entry => entry.questionId === activeQuestion.value?.id))
const remainingHere = computed(() => {
  const question = activeQuestion.value
  if (!question?.mine) return 0
  return Math.max(0, question.maxEntriesPerPerson - mineHere.value.length)
})

function allowanceFor(questionId: string | null) {
  return questions.value.find(question => question.id === questionId)?.mine?.votesAllowed ?? 0
}
// Counted from the gallery rather than the server's votesUsed so the number
// follows each tap without a refetch. Votes are per question.
function votesUsedIn(questionId: string | null) {
  const inQuestion = new Set(gallery.value.filter(entry => entry.questionId === questionId).map(entry => entry.id))
  return votedIds.value.filter(entryId => inQuestion.has(entryId)).length
}
const votesAllowedHere = computed(() => allowanceFor(activeQuestion.value?.id ?? null))
const canVote = computed(() => status.value === 'voting' && votesAllowedHere.value > 0)
const votesLeft = computed(() => Math.max(0, votesAllowedHere.value - votesUsedIn(activeQuestion.value?.id ?? null)))

async function loadMine() {
  if (!me.value || me.value.role !== 'attendee') return
  try {
    mine.value = (await $fetch<{ entries: EntryItem[] }>(`${api.value}/mine`)).entries
  } catch (err) {
    errorMessage.value = apiMessage(err, t('compete.loadFailed'))
  }
}

async function loadGallery() {
  if (!me.value || !showGallery.value) return
  try {
    gallery.value = (await $fetch<{ entries: EntryItem[] }>(`${api.value}/entries`)).entries
  } catch (err) {
    errorMessage.value = apiMessage(err, t('compete.loadFailed'))
  }
}

onMounted(() => {
  watch([me, status], () => {
    loadMine()
    loadGallery()
  }, { immediate: true })
})

const uploadedKeys = ref<string[]>([])
async function onUploaded() {
  await refresh()
  await loadMine()
}

async function saveTitle(entry: EntryItem) {
  try {
    await $fetch(`${api.value}/mine/${encodeURIComponent(entry.id)}`, {
      method: 'PATCH',
      body: { title: entry.title?.trim() || null }
    })
  } catch (err) {
    errorMessage.value = apiMessage(err, t('compete.saveFailed'))
  }
}

async function removeEntry(entry: EntryItem) {
  if (!confirm(t('compete.removeConfirm'))) return
  try {
    await $fetch(`${api.value}/mine/${encodeURIComponent(entry.id)}`, { method: 'DELETE' })
    mine.value = mine.value.filter(item => item.id !== entry.id)
    await refresh()
  } catch (err) {
    errorMessage.value = apiMessage(err, t('compete.saveFailed'))
  }
}

// ── Voting ──────────────────────────────────────────────────────────────────
const votingBusy = ref<string | null>(null)

async function toggleVote(entry: EntryItem) {
  if (!canVote.value || entry.mine || votingBusy.value) return
  const voted = votedIds.value.includes(entry.id)
  const allowance = allowanceFor(entry.questionId)
  if (!voted && votesUsedIn(entry.questionId) >= allowance) {
    errorMessage.value = t('compete.noVotesLeft', { n: allowance })
    return
  }
  votingBusy.value = entry.id
  errorMessage.value = ''
  try {
    const res = voted
      ? await $fetch<{ votedEntryIds: string[] }>(`${api.value}/votes/${encodeURIComponent(entry.id)}`, { method: 'DELETE' })
      : await $fetch<{ votedEntryIds: string[] }>(`${api.value}/votes`, { method: 'POST', body: { entryId: entry.id } })
    votedIds.value = res.votedEntryIds
  } catch (err) {
    errorMessage.value = apiMessage(err, t('compete.voteFailed'))
  } finally {
    votingBusy.value = null
  }
}

const viewer = ref<EntryItem | null>(null)
function onKey(event: KeyboardEvent) {
  if (event.key === 'Escape') viewer.value = null
}
onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))

const phaseLabel = computed(() => t(`compete.phase.${status.value}`))
</script>

<template>
  <div class="cmp">
    <section v-if="notFound || !comp" class="stage stage--solo">
      <div class="stage__body">
        <p class="mark"><span class="mark__cu">CU</span>PHOTOCLUB</p>
        <h1 class="stage__title">{{ t('compete.notFoundTitle') }}</h1>
        <p class="stage__lead">{{ t('compete.notFoundLead') }}</p>
        <NuxtLink :to="localePath('/')" class="btn btn--ghost">{{ t('compete.home') }}</NuxtLink>
      </div>
    </section>

    <template v-else>
      <header class="stage">
        <div class="stage__body">
          <p class="mark"><span class="mark__cu">CU</span>PHOTOCLUB</p>
          <p class="eyebrow">{{ t('compete.eyebrow') }} · {{ phaseLabel }}</p>
          <h1 class="stage__title">{{ comp.title }}</h1>
          <p v-if="comp.description" class="stage__lead">{{ comp.description }}</p>
          <p class="stage__rules">
            <span v-if="questions.length > 1">{{ t('compete.questionCount', { n: questions.length }) }}</span>
            <span v-if="comp.scoring !== 'public'">{{ t('compete.ruleJudges') }}</span>
          </p>
        </div>
      </header>

      <div class="work">
        <p v-if="errorMessage" class="alert" role="alert">{{ errorMessage }}</p>

        <!-- Results are public: nobody needs to sign in to see them. -->
        <section v-if="!me && status === 'results'" class="card join">
          <h2 class="join__title">{{ t('compete.resultsOut') }}</h2>
          <NuxtLink class="btn" :to="localePath(`/compete/${comp.id}/results`)">{{ t('compete.seeResults') }}</NuxtLink>
        </section>

        <!-- ── Not signed in ─────────────────────────────────────────────── -->
        <section v-else-if="!me" class="card join">
          <template v-if="joinMode === 'phone'">
            <template v-if="!match">
              <h2 class="join__title">{{ t('compete.phoneTitle') }}</h2>
              <p class="join__lead">{{ t('compete.phoneLead') }}</p>
              <form class="join__form" @submit.prevent="lookupPhone">
                <label class="field">
                  <span class="field__label">{{ t('compete.phoneLabel') }}</span>
                  <input v-model="phone" class="field__input" type="tel" inputmode="tel" autocomplete="tel" required placeholder="08x-xxx-xxxx">
                </label>
                <label v-if="comp.needsAccessCode" class="field">
                  <span class="field__label">{{ t('compete.accessCodeLabel') }}</span>
                  <input v-model="accessCode" class="field__input" type="text" autocomplete="off" autocapitalize="characters" required>
                </label>
                <button class="btn" type="submit" :disabled="joining || !phone">{{ joining ? t('compete.checking') : t('compete.continue') }}</button>
              </form>
            </template>
            <template v-else>
              <h2 class="join__title">{{ t('compete.isThisYou') }}</h2>
              <p class="join__match">{{ match.name }}<span v-if="match.groupName" class="join__group"> · {{ match.groupName }}</span></p>
              <div class="join__actions">
                <button class="btn" type="button" :disabled="joining" @click="confirmPhone">{{ t('compete.yesThatsMe') }}</button>
                <button class="btn btn--ghost" type="button" :disabled="joining" @click="notMe">{{ t('compete.notMe') }}</button>
              </div>
            </template>
          </template>

          <template v-else-if="joinMode === 'open'">
            <h2 class="join__title">{{ t('compete.openTitle') }}</h2>
            <p v-if="comp.status !== 'submissions'" class="join__lead">{{ t('compete.openClosed') }}</p>
            <form v-else class="join__form" @submit.prevent="join({ mode: 'open', name: nameInput })">
              <label class="field">
                <span class="field__label">{{ t('compete.nameLabel') }}</span>
                <input v-model="nameInput" class="field__input" type="text" maxlength="80" required autocomplete="name">
              </label>
              <button class="btn" type="submit" :disabled="joining || !nameInput.trim()">{{ t('compete.join') }}</button>
            </form>
            <button class="link" type="button" @click="setJoinMode('claim')">{{ t('compete.haveCode') }}</button>
          </template>

          <template v-else>
            <h2 class="join__title">{{ joinMode === 'judge' ? t('compete.judgeTitle') : t('compete.claimTitle') }}</h2>
            <form class="join__form" @submit.prevent="join({ mode: joinMode, code: codeInput })">
              <label class="field">
                <span class="field__label">{{ t('compete.codeLabel') }}</span>
                <input v-model="codeInput" class="field__input field__input--code" type="text" autocomplete="off" autocapitalize="characters" placeholder="CUPC-XXXXX-XXXXX" required>
              </label>
              <button class="btn" type="submit" :disabled="joining || !codeInput">{{ t('compete.signIn') }}</button>
            </form>
            <button class="link" type="button" @click="setJoinMode(comp.accessMode === 'open' ? 'open' : 'phone')">{{ t('compete.back') }}</button>
          </template>

          <button v-if="joinMode !== 'judge' && comp.scoring !== 'public'" class="link link--quiet" type="button" @click="setJoinMode('judge')">
            {{ t('compete.imJudge') }}
          </button>
        </section>

        <!-- ── Signed in ─────────────────────────────────────────────────── -->
        <template v-else>
          <div class="who">
            <p class="who__line">
              <span class="who__label">{{ me.role === 'judge' ? t('compete.signedInJudge') : t('compete.signedInAs') }}</span>
              <strong>{{ me.name }}</strong>
              <span v-if="me.groupName" class="who__group">· {{ me.groupName }}</span>
            </p>
            <button class="minibtn" type="button" @click="leave">{{ t('compete.notYou') }}</button>
          </div>
          <p v-if="me.code" class="alert alert--quiet">{{ t('compete.saveCode') }} <strong class="code">{{ me.code }}</strong></p>

          <!-- Question tabs. Hidden for a single-question competition. -->
          <nav v-if="questions.length > 1 && status !== 'results'" class="qtabs" :aria-label="t('compete.questions')">
            <button
              v-for="question in questions"
              :key="question.id"
              type="button"
              class="qtab"
              :class="{ 'is-active': question.id === activeQuestion?.id }"
              :aria-pressed="question.id === activeQuestion?.id"
              @click="selectedQuestionId = question.id"
            >
              {{ question.title }}
            </button>
          </nav>
          <div v-if="activeQuestion && status !== 'results'" class="qhead">
            <h2 v-if="questions.length > 1" class="qhead__title">{{ activeQuestion.title }}</h2>
            <p v-if="activeQuestion.description" class="qhead__desc">{{ activeQuestion.description }}</p>
            <p class="stage__rules">
              <span v-if="status === 'submissions' && me.role === 'attendee'">{{ t('compete.ruleEntries', { n: activeQuestion.maxEntriesPerPerson }) }}</span>
              <span v-if="comp.scoring !== 'judges' && me.role === 'attendee'">{{ t('compete.ruleVotes', { n: activeQuestion.votesPerPerson }) }}</span>
              <span v-if="comp.scoring !== 'public' && me.role === 'judge'">{{ t('compete.ruleVotes', { n: activeQuestion.votesPerJudge }) }}</span>
            </p>
          </div>

          <!-- Submissions -->
          <template v-if="status === 'submissions'">
            <template v-if="me.role === 'attendee' && activeQuestion">
              <p class="count">{{ t('compete.entriesCount', { used: mineHere.length, max: activeQuestion.maxEntriesPerPerson }) }}</p>
              <!-- Keyed on the question: each question is its own upload
                   session and limit, so switching tabs starts a fresh uploader. -->
              <div v-if="remainingHere > 0" class="zone">
                <AdminR2ImageUploader
                  :key="activeQuestion.id"
                  v-model="uploadedKeys"
                  :endpoint-base="`${api}/questions/${encodeURIComponent(activeQuestion.id)}/sessions`"
                  :remember-signatures="false"
                  :handoff-to-dock="false"
                  :show-compress-control="false"
                  :max-bytes="comp.maxBytesPerPhoto"
                  :show-previews="false"
                  :max-files="remainingHere"
                  @uploaded="onUploaded"
                />
              </div>
              <p v-else class="alert alert--quiet">{{ t('compete.limitReached') }}</p>

              <ul v-if="mineHere.length" class="grid">
                <li v-for="entry in mineHere" :key="entry.id" class="tile">
                  <img class="tile__img" :src="entry.imageUrl" alt="" loading="lazy">
                  <div class="tile__foot">
                    <input
                      v-model="entry.title"
                      class="tile__title-input"
                      type="text"
                      maxlength="120"
                      :placeholder="t('compete.titlePlaceholder')"
                      :aria-label="t('compete.titlePlaceholder')"
                      @change="saveTitle(entry)"
                    >
                    <button class="minibtn" type="button" @click="removeEntry(entry)">{{ t('compete.remove') }}</button>
                  </div>
                </li>
              </ul>
            </template>
            <p v-else class="alert alert--quiet">{{ t('compete.judgeWait') }}</p>
          </template>

          <!-- Voting / closed -->
          <template v-else-if="showGallery">
            <p v-if="status === 'closed'" class="alert alert--quiet">{{ t('compete.closedNotice') }}</p>
            <p v-else-if="canVote" class="count">
              {{ t('compete.votesLeft', { left: votesLeft, max: votesAllowedHere }) }}
            </p>
            <p v-else class="alert alert--quiet">{{ t('compete.cannotVote') }}</p>

            <p v-if="!galleryHere.length" class="alert alert--quiet">{{ t('compete.noEntries') }}</p>
            <ul v-else class="grid">
              <li
                v-for="entry in galleryHere"
                :key="entry.id"
                class="tile"
                :class="{ 'is-voted': votedIds.includes(entry.id), 'is-mine': entry.mine }"
              >
                <button class="tile__view" type="button" :aria-label="t('compete.view')" @click="viewer = entry">
                  <img class="tile__img" :src="entry.imageUrl" alt="" loading="lazy">
                </button>
                <div class="tile__foot">
                  <span class="tile__title">{{ entry.title || '' }}</span>
                  <span v-if="entry.mine" class="tile__tag">{{ t('compete.yours') }}</span>
                  <button
                    v-else-if="canVote"
                    class="vote"
                    type="button"
                    :aria-pressed="votedIds.includes(entry.id)"
                    :disabled="votingBusy === entry.id"
                    @click="toggleVote(entry)"
                  >
                    {{ votedIds.includes(entry.id) ? t('compete.voted') : t('compete.vote') }}
                  </button>
                </div>
              </li>
            </ul>
          </template>

          <!-- Results -->
          <section v-else-if="status === 'results'" class="card join">
            <h2 class="join__title">{{ t('compete.resultsOut') }}</h2>
            <NuxtLink class="btn" :to="localePath(`/compete/${comp.id}/results`)">{{ t('compete.seeResults') }}</NuxtLink>
          </section>
        </template>
      </div>

      <div v-if="viewer" class="viewer" role="dialog" aria-modal="true" @click="viewer = null">
        <button class="viewer__close" type="button" :aria-label="t('compete.close')" @click="viewer = null">✕</button>
        <img class="viewer__img" :src="viewer.imageUrl" alt="" @click.stop>
        <div v-if="canVote && !viewer.mine" class="viewer__bar" @click.stop>
          <button
            class="vote vote--big"
            type="button"
            :aria-pressed="votedIds.includes(viewer.id)"
            :disabled="votingBusy === viewer.id"
            @click="toggleVote(viewer)"
          >
            {{ votedIds.includes(viewer.id) ? t('compete.voted') : t('compete.vote') }}
          </button>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.cmp {
  min-height: 100vh;
  background: var(--hero-bg);
  color: #F5F4F0;
  display: flex;
  flex-direction: column;
}

.stage { position: relative; overflow: hidden; }
.stage::before {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(135deg, var(--dark) 0%, #2A1A24 55%, var(--accent) 220%);
}
.stage--solo { min-height: 100vh; display: flex; align-items: center; }
.stage__body {
  position: relative;
  z-index: 1;
  width: 100%;
  max-width: 980px;
  margin: 0 auto;
  padding: 2.75rem 1.5rem 3rem;
  display: flex;
  flex-direction: column;
  gap: 0.7rem;
  align-items: flex-start;
}
.mark {
  font-family: var(--font-latin-sans);
  font-size: 0.6rem;
  font-weight: 500;
  letter-spacing: 0.22em;
  color: rgba(245, 244, 240, 0.72);
  margin-bottom: 1.5rem;
}
.mark__cu { color: var(--accent); }
.eyebrow {
  font-family: var(--font-sans);
  font-size: 0.55rem;
  letter-spacing: 0.24em;
  text-transform: uppercase;
  color: var(--accent);
}
.stage__title {
  font-family: var(--font-serif);
  font-size: clamp(2rem, 5.5vw, 3.4rem);
  font-weight: 300;
  line-height: 1.06;
}
.stage__lead {
  max-width: 40rem;
  font-family: var(--font-sans);
  font-size: 0.85rem;
  line-height: 1.7;
  color: rgba(245, 244, 240, 0.75);
  white-space: pre-line;
}
.stage__rules {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem 1.2rem;
  font-family: var(--font-sans);
  font-size: 0.7rem;
  color: rgba(245, 244, 240, 0.55);
}

.work {
  width: 100%;
  max-width: 1180px;
  margin: 0 auto;
  padding: 1.6rem 1rem 4rem;
  display: flex;
  flex-direction: column;
  gap: 1.1rem;
}

.card {
  border: 1px solid rgba(245, 244, 240, 0.16);
  background: rgba(245, 244, 240, 0.05);
}
.alert {
  border-left: 2px solid var(--accent);
  padding: 0.6rem 0.9rem;
  background: rgba(245, 244, 240, 0.05);
  font-family: var(--font-sans);
  font-size: 0.8rem;
  line-height: 1.6;
  color: rgba(245, 244, 240, 0.85);
}
.alert--quiet { border-left-color: rgba(245, 244, 240, 0.28); color: rgba(245, 244, 240, 0.6); }
.code { font-family: var(--font-latin-sans); letter-spacing: 0.08em; color: #F5F4F0; }

/* ── Join ───────────────────────────────────────────────────────────────── */
.join {
  max-width: 30rem;
  width: 100%;
  margin: 0 auto;
  padding: 1.6rem 1.4rem;
  display: flex;
  flex-direction: column;
  gap: 0.9rem;
  align-items: flex-start;
}
.join__title { font-family: var(--font-serif); font-size: 1.5rem; font-weight: 300; }
.join__lead { font-family: var(--font-sans); font-size: 0.8rem; line-height: 1.6; color: rgba(245, 244, 240, 0.65); }
.join__form { display: flex; flex-direction: column; gap: 0.8rem; width: 100%; }
.join__match { font-family: var(--font-serif); font-size: 1.9rem; font-weight: 300; line-height: 1.2; }
.join__group { color: rgba(245, 244, 240, 0.55); font-size: 1.1rem; }
.join__actions { display: flex; flex-wrap: wrap; gap: 0.6rem; }

.field { display: flex; flex-direction: column; gap: 0.35rem; width: 100%; }
.field__label {
  font-family: var(--font-sans);
  font-size: 0.55rem;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: rgba(245, 244, 240, 0.6);
}
.field__input {
  width: 100%;
  border: 1px solid rgba(245, 244, 240, 0.25);
  background: rgba(245, 244, 240, 0.06);
  color: #F5F4F0;
  padding: 0.7rem 0.8rem;
  font-family: var(--font-latin-sans);
  font-size: 1.05rem;
  outline: none;
}
.field__input:focus { border-color: var(--accent); }
.field__input--code { letter-spacing: 0.1em; text-transform: uppercase; }

.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--accent);
  background: var(--accent);
  color: #fff;
  padding: 0.75rem 1.3rem;
  font-family: var(--font-sans);
  font-size: 0.62rem;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  text-decoration: none;
  cursor: pointer;
}
.btn:disabled { opacity: 0.5; cursor: default; }
.btn--ghost { background: transparent; border-color: rgba(245, 244, 240, 0.35); color: #F5F4F0; }
.link {
  background: none;
  border: 0;
  padding: 0;
  font-family: var(--font-sans);
  font-size: 0.75rem;
  color: rgba(245, 244, 240, 0.75);
  text-decoration: underline;
  cursor: pointer;
}
.link--quiet { color: rgba(245, 244, 240, 0.45); font-size: 0.7rem; }

.minibtn {
  border: 1px solid rgba(245, 244, 240, 0.22);
  background: transparent;
  padding: 0.32rem 0.65rem;
  font-family: var(--font-sans);
  font-size: 0.55rem;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: rgba(245, 244, 240, 0.8);
  cursor: pointer;
  white-space: nowrap;
}
.minibtn:hover { border-color: var(--accent); color: var(--accent); }

/* ── Signed in ──────────────────────────────────────────────────────────── */
.who {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  flex-wrap: wrap;
  border-bottom: 1px solid rgba(245, 244, 240, 0.12);
  padding-bottom: 0.9rem;
}
.who__line { font-family: var(--font-sans); font-size: 0.9rem; display: flex; gap: 0.45rem; flex-wrap: wrap; align-items: baseline; }
.who__label { font-size: 0.55rem; letter-spacing: 0.18em; text-transform: uppercase; color: rgba(245, 244, 240, 0.5); }
.who__group { color: rgba(245, 244, 240, 0.55); }
.count { font-family: var(--font-sans); font-size: 0.8rem; color: rgba(245, 244, 240, 0.7); }

/* R2ImageUploader is styled for paper; re-point it at this dark ground, the
   same way the contribute page does. */
.zone :deep(.r2up__zone) {
  min-height: 13rem;
  border-color: rgba(245, 244, 240, 0.22);
  background: rgba(245, 244, 240, 0.04);
}
.zone :deep(.r2up__zone:hover),
.zone :deep(.r2up__zone.is-drag-over) { border-color: var(--accent); background: rgba(232, 24, 110, 0.1); }
.zone :deep(.r2up__icon) { color: rgba(245, 244, 240, 0.4); }
.zone :deep(.r2up__label) { color: rgba(245, 244, 240, 0.78); }
.zone :deep(.r2up__hint),
.zone :deep(.r2up__full),
.zone :deep(.r2up__note),
.zone :deep(.r2up__uploading-count) { color: rgba(245, 244, 240, 0.45); }
.zone :deep(.r2up__uploading-count strong) { color: #F5F4F0; }
.zone :deep(.r2up__uploading-meter) { background: rgba(245, 244, 240, 0.16); }
.zone :deep(.r2up__cancel) { border-color: rgba(245, 244, 240, 0.22); color: rgba(245, 244, 240, 0.7); }
.zone :deep(.r2up__error) { color: #FF8095; }
.zone :deep(.r2up__failures) { background: rgba(176, 36, 60, 0.12); }

/* ── Question tabs ──────────────────────────────────────────────────────── */
.qtabs {
  display: flex;
  gap: 0.4rem;
  overflow-x: auto;
  padding-bottom: 0.2rem;
  scrollbar-width: thin;
}
.qtab {
  flex: 0 0 auto;
  border: 1px solid rgba(245, 244, 240, 0.22);
  background: transparent;
  color: rgba(245, 244, 240, 0.75);
  padding: 0.55rem 0.9rem;
  font-family: var(--font-sans);
  font-size: 0.78rem;
  cursor: pointer;
  white-space: nowrap;
}
.qtab:hover { border-color: var(--accent); }
.qtab.is-active { background: var(--accent); border-color: var(--accent); color: #fff; }
.qhead { display: flex; flex-direction: column; gap: 0.35rem; }
.qhead__title { font-family: var(--font-serif); font-size: 1.5rem; font-weight: 300; }
.qhead__desc { font-family: var(--font-sans); font-size: 0.8rem; line-height: 1.6; color: rgba(245, 244, 240, 0.7); white-space: pre-line; }

/* ── Grid ───────────────────────────────────────────────────────────────── */
.grid {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(100%, 220px), 1fr));
  gap: 0.9rem;
}
.tile {
  display: flex;
  flex-direction: column;
  border: 1px solid rgba(245, 244, 240, 0.12);
  background: rgba(245, 244, 240, 0.03);
  transition: border-color 0.15s;
  min-width: 0;
}
.tile.is-voted { border-color: var(--accent); box-shadow: 0 0 0 1px var(--accent); }
.tile__view { border: 0; padding: 0; background: none; cursor: zoom-in; display: block; }
.tile__img {
  display: block;
  width: 100%;
  aspect-ratio: 4 / 3;
  object-fit: cover;
  background: rgba(245, 244, 240, 0.06);
}
.tile__foot {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.55rem 0.6rem;
  min-height: 2.8rem;
}
.tile__title {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: var(--font-sans);
  font-size: 0.75rem;
  color: rgba(245, 244, 240, 0.75);
}
.tile__title-input {
  flex: 1;
  min-width: 0;
  border: 1px solid transparent;
  border-bottom-color: rgba(245, 244, 240, 0.2);
  background: transparent;
  color: #F5F4F0;
  padding: 0.3rem 0.1rem;
  font-family: var(--font-sans);
  font-size: 0.78rem;
  outline: none;
}
.tile__title-input:focus { border-bottom-color: var(--accent); }
.tile__tag {
  font-family: var(--font-sans);
  font-size: 0.5rem;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: rgba(245, 244, 240, 0.5);
  border: 1px solid rgba(245, 244, 240, 0.25);
  padding: 0.2rem 0.4rem;
}

.vote {
  border: 1px solid var(--accent);
  background: transparent;
  color: var(--accent);
  padding: 0.45rem 0.8rem;
  font-family: var(--font-sans);
  font-size: 0.58rem;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  cursor: pointer;
  white-space: nowrap;
}
.vote[aria-pressed='true'] { background: var(--accent); color: #fff; }
.vote:disabled { opacity: 0.6; cursor: default; }
.vote--big { padding: 0.8rem 1.6rem; font-size: 0.7rem; }

/* ── Viewer ─────────────────────────────────────────────────────────────── */
.viewer {
  position: fixed;
  inset: 0;
  z-index: 50;
  background: rgba(8, 8, 7, 0.94);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1rem;
  padding: 3rem 1rem 1.5rem;
}
.viewer__img { max-width: 100%; max-height: calc(100vh - 9rem); object-fit: contain; }
.viewer__close {
  position: absolute;
  top: 0.8rem;
  right: 1rem;
  border: 0;
  background: none;
  color: #F5F4F0;
  font-size: 1.4rem;
  cursor: pointer;
}
</style>
