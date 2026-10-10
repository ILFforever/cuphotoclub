<script setup lang="ts">
definePageMeta({ layout: 'admin', middleware: 'admin' })

const { t, locale } = useI18n()
useHead(() => ({ title: t('adminActivities.title') }))

interface EventRow {
  id: number
  slug: string
  title: string
  summary: string | null
  coverR2Key: string | null
  eventDate: string | null
  endDate: string | null
  location: string | null
  registerUrl: string | null
  status: 'draft' | 'published'
  createdAt: string
}

interface EventFull extends EventRow {
  body: string
  galleryR2Keys: string[]
}

interface DayCell {
  key: string
  day: number
  inMonth: boolean
  isToday: boolean
  events: EventRow[]
}

const { data: events, refresh, pending } = await useFetch<EventRow[]>('/api/admin/events')

// ── Calendar state ───────────────────────────────────────────────────────────
// Event dates are stored as UTC midnight; UTC getters recover the intended day.
function utcKey(d: Date) {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
}
function localKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const now = new Date()
const viewYear = ref(now.getFullYear())
const viewMonth = ref(now.getMonth())

function shiftMonth(delta: number) {
  const d = new Date(viewYear.value, viewMonth.value + delta, 1)
  viewYear.value = d.getFullYear()
  viewMonth.value = d.getMonth()
}
function goToday() {
  viewYear.value = now.getFullYear()
  viewMonth.value = now.getMonth()
}

const monthTitle = computed(() =>
  formatMonthYear(new Date(viewYear.value, viewMonth.value, 1), locale.value)
)
const weekdayLabels = computed(() =>
  Array.from({ length: 7 }, (_, i) => formatWeekdayShort(new Date(Date.UTC(2023, 0, 1 + i)), locale.value))
)

const eventsByDay = computed(() => {
  const map = new Map<string, EventRow[]>()
  for (const ev of events.value ?? []) {
    if (!ev.eventDate) continue
    const start = new Date(ev.eventDate)
    const end = ev.endDate ? new Date(ev.endDate) : start
    const cursor = new Date(start)
    for (let i = 0; i < 62 && cursor <= end; i++) {
      const key = utcKey(cursor)
      const list = map.get(key)
      if (list) list.push(ev)
      else map.set(key, [ev])
      cursor.setUTCDate(cursor.getUTCDate() + 1)
    }
  }
  return map
})

const weeks = computed<DayCell[][]>(() => {
  const first = new Date(Date.UTC(viewYear.value, viewMonth.value, 1))
  const daysInMonth = new Date(Date.UTC(viewYear.value, viewMonth.value + 1, 0)).getUTCDate()
  const lead = first.getUTCDay()
  const totalCells = Math.ceil((lead + daysInMonth) / 7) * 7
  const todayKey = localKey(new Date())

  const cells: DayCell[] = []
  for (let i = 0; i < totalCells; i++) {
    const d = new Date(Date.UTC(viewYear.value, viewMonth.value, 1 + i - lead))
    const key = utcKey(d)
    cells.push({
      key,
      day: d.getUTCDate(),
      inMonth: d.getUTCMonth() === viewMonth.value,
      isToday: key === todayKey,
      events: eventsByDay.value.get(key) ?? []
    })
  }
  const rows: DayCell[][] = []
  for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7))
  return rows
})

// ── Metrics ──────────────────────────────────────────────────────────────────
const eventList = computed(() => events.value ?? [])
const publishedCount = computed(() => eventList.value.filter(e => e.status === 'published').length)
const draftCount = computed(() => eventList.value.filter(e => e.status === 'draft').length)
const upcomingCount = computed(() => {
  const today = new Date(`${localKey(new Date())}T00:00:00Z`)
  return eventList.value.filter((e) => {
    if (!e.eventDate) return false
    const end = new Date(e.endDate || e.eventDate)
    return end >= today
  }).length
})

const undatedEvents = computed(() => eventList.value.filter(e => !e.eventDate))

// ── Create / edit modal ──────────────────────────────────────────────────────
const showForm = ref(false)
const editing = ref<EventRow | null>(null)
const loadingEvent = ref(false)
const saving = ref(false)
const formError = ref('')

const form = reactive({
  title: '',
  slug: '',
  eventDate: '',
  endDate: '',
  location: '',
  summary: '',
  body: '',
  registerUrl: '',
  status: 'draft' as 'draft' | 'published',
  coverR2Key: null as string | null,
  galleryR2Keys: [] as string[]
})

function resetForm(dateKey = '') {
  Object.assign(form, {
    title: '', slug: '', eventDate: dateKey, endDate: '', location: '',
    summary: '', body: '', registerUrl: '', status: 'draft', coverR2Key: null,
    galleryR2Keys: []
  })
}

function openCreate(dateKey = '') {
  editing.value = null
  resetForm(dateKey)
  formError.value = ''
  showForm.value = true
}

async function openEdit(ev: EventRow) {
  editing.value = ev
  formError.value = ''
  loadingEvent.value = true
  showForm.value = true
  try {
    const full = await $fetch<EventFull>(`/api/admin/events/${ev.id}`)
    Object.assign(form, {
      title: full.title,
      slug: full.slug,
      eventDate: full.eventDate ? utcKey(new Date(full.eventDate)) : '',
      endDate: full.endDate ? utcKey(new Date(full.endDate)) : '',
      location: full.location ?? '',
      summary: full.summary ?? '',
      body: full.body ?? '',
      registerUrl: full.registerUrl ?? '',
      status: full.status,
      coverR2Key: full.coverR2Key,
      galleryR2Keys: [...(full.galleryR2Keys ?? [])]
    })
  } catch {
    formError.value = t('adminActivities.loadFailed')
  } finally {
    loadingEvent.value = false
  }
}

// ── Mini-gallery ─────────────────────────────────────────────────────────────
// A new event has no id yet, so its uploads land in the shared events/gallery
// folder (same trick the cover uploader uses with events/covers). Once saved,
// edits scope uploads to the event's own folder.
const GALLERY_MAX = 24
const libraryPickerOpen = ref(false)

const galleryPrefix = computed(() =>
  editing.value ? `events/${editing.value.id}/gallery` : 'events/gallery'
)
const activityLibraryPrefix = computed(() =>
  editing.value ? `events/${editing.value.id}` : 'events'
)

// Fetched on first picker open rather than with the page — the list is only
// needed once someone actually opens the image library.
const albumSources = ref<{ label: string, prefix: string }[]>([])
let albumsRequested = false

async function ensureAlbumSources() {
  if (albumsRequested) return
  albumsRequested = true
  try {
    const albums = await $fetch('/api/admin/albums/picker')
    albumSources.value = albums.map(album => ({
      label: t('adminActivities.sourceAlbum', { name: album.title }),
      prefix: `content-albums/${album.id}`
    }))
  } catch {
    albumsRequested = false // let the next open retry
  }
}

const librarySources = computed(() => [
  { label: t('adminActivities.sourceActivityUploads'), prefix: activityLibraryPrefix.value },
  ...albumSources.value
])

function openLibraryPicker() {
  ensureAlbumSources()
  libraryPickerOpen.value = true
}

function addGalleryImages(keys: string[]) {
  form.galleryR2Keys = [...new Set([...form.galleryR2Keys, ...keys.filter(Boolean)])].slice(0, GALLERY_MAX)
}

function moveGalleryImage(index: number, direction: -1 | 1) {
  const target = index + direction
  if (target < 0 || target >= form.galleryR2Keys.length) return
  const next = [...form.galleryR2Keys]
  ;[next[index], next[target]] = [next[target]!, next[index]!]
  form.galleryR2Keys = next
}

function removeGalleryImage(key: string) {
  form.galleryR2Keys = form.galleryR2Keys.filter(item => item !== key)
}

function errMsg(e: unknown, fallback: string) {
  return (e as { data?: { message?: string } })?.data?.message || fallback
}

async function save() {
  saving.value = true
  formError.value = ''
  const payload = {
    title: form.title,
    eventDate: form.eventDate || null,
    endDate: form.eventDate ? form.endDate || null : null,
    location: form.location.trim() || null,
    summary: form.summary.trim() || null,
    body: form.body,
    registerUrl: form.registerUrl.trim() || null,
    status: form.status,
    coverR2Key: form.coverR2Key,
    galleryR2Keys: form.galleryR2Keys
  }
  try {
    if (editing.value) {
      await $fetch(`/api/admin/events/${editing.value.id}`, {
        method: 'PATCH',
        body: { ...payload, slug: form.slug || undefined }
      })
    } else {
      await $fetch('/api/admin/events', { method: 'POST', body: payload })
    }
    showForm.value = false
    await refresh()
  } catch (e) {
    formError.value = errMsg(e, t('adminActivities.saveFailed'))
  } finally {
    saving.value = false
  }
}

// ── Delete ───────────────────────────────────────────────────────────────────
const confirmDelete = ref(false)
const deleting = ref(false)

async function doDelete() {
  if (!editing.value) return
  deleting.value = true
  try {
    await $fetch(`/api/admin/events/${editing.value.id}`, { method: 'DELETE' })
    confirmDelete.value = false
    showForm.value = false
    await refresh()
  } catch (e) {
    formError.value = errMsg(e, t('adminActivities.deleteFailed'))
    confirmDelete.value = false
  } finally {
    deleting.value = false
  }
}

function chipTitle(ev: EventRow) {
  return ev.status === 'draft' ? `${ev.title} — ${t('adminActivities.draft')}` : ev.title
}
</script>

<template>
  <div class="activities-admin">
    <header class="page-head">
      <div>
        <NuxtLink to="/admin" class="back">Dashboard</NuxtLink>
        <h1>{{ t('adminActivities.title') }}</h1>
        <p>{{ t('adminActivities.lead') }}</p>
      </div>
      <UiButton @click="openCreate()">
        <Icon name="heroicons:plus" class="btn-icon" />
        {{ t('adminActivities.newEvent') }}
      </UiButton>
    </header>

    <section class="overview" :aria-label="t('adminActivities.overviewLabel')">
      <div class="metric">
        <span>{{ eventList.length }}</span>
        <p>{{ t('adminActivities.total') }}</p>
      </div>
      <div class="metric">
        <span>{{ publishedCount }}</span>
        <p>{{ t('adminActivities.published') }}</p>
      </div>
      <div class="metric">
        <span>{{ draftCount }}</span>
        <p>{{ t('adminActivities.drafts') }}</p>
      </div>
      <div class="metric">
        <span>{{ upcomingCount }}</span>
        <p>{{ t('adminActivities.upcoming') }}</p>
      </div>
    </section>

    <section class="cal-section" :aria-label="t('adminActivities.calendarLabel')">
      <div class="section-head">
        <div>
          <p class="kicker">{{ t('adminActivities.kicker') }}</p>
          <h2>{{ monthTitle }}</h2>
        </div>
        <div class="cal-controls">
          <button type="button" class="cal-nav" :aria-label="t('adminActivities.prevMonth')" @click="shiftMonth(-1)">
            <Icon name="heroicons:chevron-left" class="cal-nav__icon" />
          </button>
          <button type="button" class="cal-nav cal-nav--today" @click="goToday">{{ t('adminActivities.today') }}</button>
          <button type="button" class="cal-nav" :aria-label="t('adminActivities.nextMonth')" @click="shiftMonth(1)">
            <Icon name="heroicons:chevron-right" class="cal-nav__icon" />
          </button>
        </div>
      </div>

      <div class="cal">
        <div class="cal__weekdays">
          <span v-for="label in weekdayLabels" :key="label">{{ label }}</span>
        </div>
        <div v-for="(week, wi) in weeks" :key="wi" class="cal__week">
          <div
            v-for="cell in week"
            :key="cell.key"
            class="cal__day"
            :class="{ 'cal__day--out': !cell.inMonth, 'cal__day--today': cell.isToday }"
            role="button"
            tabindex="0"
            :title="t('adminActivities.addOnDay')"
            @click="openCreate(cell.key)"
            @keydown.enter="openCreate(cell.key)"
          >
            <span class="cal__num">{{ cell.day }}</span>
            <button
              v-for="ev in cell.events"
              :key="ev.id"
              type="button"
              class="cal__chip"
              :class="{ 'cal__chip--draft': ev.status === 'draft' }"
              :title="chipTitle(ev)"
              @click.stop="openEdit(ev)"
            >
              {{ ev.title }}
            </button>
          </div>
        </div>
      </div>

      <p class="cal-hint">{{ t('adminActivities.calHint') }}</p>
    </section>

    <section v-if="undatedEvents.length" class="undated" :aria-label="t('adminActivities.undatedTitle')">
      <div class="section-head">
        <div>
          <p class="kicker">{{ t('adminActivities.undatedKicker') }}</p>
          <h2>{{ t('adminActivities.undatedTitle') }}</h2>
        </div>
      </div>
      <ul class="undated__list">
        <li v-for="ev in undatedEvents" :key="ev.id">
          <button type="button" class="undated__row" @click="openEdit(ev)">
            <span class="undated__name">{{ ev.title }}</span>
            <span class="pill" :class="ev.status === 'published' ? 'pill--published' : 'pill--draft'">
              {{ ev.status === 'published' ? t('adminActivities.published') : t('adminActivities.draft') }}
            </span>
          </button>
        </li>
      </ul>
    </section>

    <p v-if="pending" class="empty">{{ t('adminActivities.loading') }}</p>

    <UiModal
      v-model="showForm"
      :title="editing ? t('adminActivities.editEvent') : t('adminActivities.newEvent')"
      size="lg"
    >
      <p v-if="loadingEvent" class="empty">{{ t('adminActivities.loading') }}</p>
      <form v-else class="event-form" @submit.prevent="save">
        <p v-if="formError" class="form-error">{{ formError }}</p>

        <div class="form-layout">
          <div class="cover-field">
            <span>{{ t('adminActivities.cover') }}</span>
            <AdminCoverUploader v-model="form.coverR2Key" prefix="events/covers" />
          </div>

          <div class="fields">
            <label class="form-field form-field--full" for="ev-title">
              <span>{{ t('adminActivities.eventTitle') }}</span>
              <input id="ev-title" v-model="form.title" type="text" required :placeholder="t('adminActivities.titlePlaceholder')">
            </label>

            <label v-if="editing" class="form-field form-field--full" for="ev-slug">
              <span>Slug — /activities/{{ form.slug }}</span>
              <input id="ev-slug" v-model="form.slug" type="text">
            </label>

            <div class="form-field">
              <span>{{ t('adminActivities.startDate') }}</span>
              <UiDateInput id="ev-start" v-model="form.eventDate" />
            </div>

            <div class="form-field">
              <span>{{ t('adminActivities.endDate') }}</span>
              <UiDateInput id="ev-end" v-model="form.endDate" :disabled="!form.eventDate" />
            </div>

            <label class="form-field" for="ev-location">
              <span>{{ t('adminActivities.location') }}</span>
              <input id="ev-location" v-model="form.location" type="text" :placeholder="t('adminActivities.locationPlaceholder')">
            </label>

            <label class="form-field" for="ev-status">
              <span>{{ t('adminActivities.status') }}</span>
              <select id="ev-status" v-model="form.status">
                <option value="draft">{{ t('adminActivities.draft') }}</option>
                <option value="published">{{ t('adminActivities.published') }}</option>
              </select>
            </label>

            <label class="form-field form-field--full" for="ev-summary">
              <span>{{ t('adminActivities.summary') }}</span>
              <textarea id="ev-summary" v-model="form.summary" rows="2" :placeholder="t('adminActivities.summaryHint')" />
            </label>

            <label class="form-field form-field--full" for="ev-body">
              <span>{{ t('adminActivities.body') }}</span>
              <textarea id="ev-body" v-model="form.body" rows="8" class="mono" />
            </label>

            <label class="form-field form-field--full" for="ev-register">
              <span>{{ t('adminActivities.registerUrl') }}</span>
              <input id="ev-register" v-model="form.registerUrl" type="url" placeholder="https://…">
            </label>
          </div>
        </div>

        <section class="activity-media" :aria-label="t('adminActivities.galleryTitle')">
          <div class="activity-media__head">
            <div>
              <p class="activity-media__kicker">{{ t('adminActivities.galleryKicker') }}</p>
              <h3>{{ t('adminActivities.galleryTitle') }}</h3>
              <p>{{ t('adminActivities.galleryHint') }}</p>
            </div>
            <span v-if="form.galleryR2Keys.length" class="activity-media__count">
              {{ t('adminActivities.galleryImageCount', { count: form.galleryR2Keys.length }) }}
            </span>
          </div>

          <AdminR2ImageUploader
            v-model="form.galleryR2Keys"
            :prefix="galleryPrefix"
            :max-files="GALLERY_MAX"
            :show-previews="false"
          />

          <div class="activity-media__library">
            <div class="activity-media__library-actions">
              <UiButton variant="secondary" size="sm" type="button" @click="openLibraryPicker">
                <Icon name="heroicons:photo" class="btn-icon" />
                {{ t('adminPicker.chooseFromLibrary') }}
              </UiButton>
            </div>
            <span>{{ t('adminActivities.galleryOrderHint') }}</span>
          </div>

          <div v-if="form.galleryR2Keys.length" class="activity-media__tray">
            <article v-for="(key, index) in form.galleryR2Keys" :key="key" class="activity-media__item">
              <div class="activity-media__thumb">
                <img :src="`/images/${key}`" alt="">
                <span>{{ String(index + 1).padStart(2, '0') }}</span>
              </div>
              <div class="activity-media__item-body">
                <code>{{ key.split('/').at(-1) }}</code>
                <div class="activity-media__controls">
                  <button
                    type="button"
                    :disabled="index === 0"
                    :aria-label="t('adminActivities.moveEarlier')"
                    @click="moveGalleryImage(index, -1)"
                  ><Icon name="heroicons:arrow-left" /></button>
                  <button
                    type="button"
                    :disabled="index === form.galleryR2Keys.length - 1"
                    :aria-label="t('adminActivities.moveLater')"
                    @click="moveGalleryImage(index, 1)"
                  ><Icon name="heroicons:arrow-right" /></button>
                  <button
                    type="button"
                    class="activity-media__remove"
                    :aria-label="t('adminActivities.removeFromGallery')"
                    @click="removeGalleryImage(key)"
                  ><Icon name="heroicons:x-mark" /></button>
                </div>
              </div>
            </article>
          </div>
          <p v-else class="activity-media__empty">{{ t('adminActivities.galleryEmpty') }}</p>
        </section>

        <div class="form-actions">
          <UiButton
            v-if="editing"
            type="button"
            variant="danger"
            @click="confirmDelete = true"
          >
            {{ t('adminActivities.delete') }}
          </UiButton>
          <span class="form-actions__spacer" />
          <UiButton type="button" variant="secondary" @click="showForm = false">{{ t('admin.cancel') }}</UiButton>
          <UiButton type="submit" :loading="saving">{{ t('admin.save') }}</UiButton>
        </div>
      </form>

      <!--
        These live inside the event modal on purpose. HeadlessUI tracks child
        dialogs through provide/inject, so a modal rendered as a *sibling* is
        invisible to this one: its clicks read as an outside click and close
        the form, throwing away unsaved edits. Nesting them registers their
        portal with the parent, which also suspends the parent's outside-click
        and Escape handling while a child is open.
      -->
      <AdminImagePickerModal
        v-model="libraryPickerOpen"
        :sources="librarySources"
        multiple
        :title="t('adminPicker.chooseFromLibrary')"
        @select="addGalleryImages"
      />

      <UiModal v-model="confirmDelete" :title="t('adminActivities.deleteTitle')">
        <p class="confirm-text">
          {{ t('adminActivities.deleteConfirm') }} <strong>{{ editing?.title }}</strong>
        </p>
        <div class="form-actions form-actions--confirm">
          <UiButton variant="secondary" @click="confirmDelete = false">{{ t('admin.cancel') }}</UiButton>
          <UiButton variant="danger" :loading="deleting" @click="doDelete">{{ t('adminActivities.delete') }}</UiButton>
        </div>
      </UiModal>
    </UiModal>
  </div>
</template>

<style scoped>
.activities-admin {
  max-width: 1180px;
  margin: 0 auto;
  padding: 3rem 2rem 5rem;
}

.page-head {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 1.5rem;
  margin-bottom: 2.25rem;
}

.back {
  display: inline-block;
  margin-bottom: 0.65rem;
  color: var(--muted);
  font-size: 0.56rem;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  text-decoration: none;
}
.back:hover { color: var(--accent); }

.page-head h1 {
  color: var(--dark);
  font-family: var(--font-serif);
  font-size: clamp(3rem, 6.6vw, 6rem);
  font-weight: 200;
  line-height: 0.95;
}

.page-head p {
  max-width: 620px;
  margin-top: 0.75rem;
  color: var(--muted);
  font-size: 0.78rem;
  line-height: 1.7;
}

.btn-icon {
  width: 0.85rem;
  height: 0.85rem;
}

.overview {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  border-top: 2px solid var(--accent);
  border-bottom: 1px solid var(--subtle);
  margin-bottom: 2rem;
}

.metric {
  padding: 1rem 1.1rem;
  border-left: 1px solid var(--subtle);
}
.metric:first-child { border-left: 0; }
.metric span {
  color: var(--dark);
  font-family: var(--font-serif);
  font-size: 2.2rem;
  font-weight: 200;
  line-height: 1;
}
.metric p {
  margin-top: 0.35rem;
  color: var(--muted);
  font-size: 0.52rem;
  letter-spacing: 0.18em;
  text-transform: uppercase;
}

.cal-section,
.undated {
  margin-top: 2rem;
  border-top: 1px solid var(--subtle);
}

.section-head {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 1rem;
  padding: 1.1rem 0;
}

.kicker {
  color: var(--accent);
  font-size: 0.52rem;
  letter-spacing: 0.2em;
  text-transform: uppercase;
}

.section-head h2 {
  margin-top: 0.28rem;
  color: var(--dark);
  font-family: var(--font-serif);
  font-size: 1.7rem;
  font-weight: 200;
  text-transform: capitalize;
}

/* ── Calendar ── */
.cal-controls {
  display: flex;
  border: 1px solid var(--subtle);
}

.cal-nav {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 2.2rem;
  border: 0;
  border-left: 1px solid var(--subtle);
  background: transparent;
  color: var(--muted);
  padding: 0.5rem 0.6rem;
  font-family: var(--font-sans);
  font-size: 0.52rem;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}
.cal-nav:first-child { border-left: 0; }
.cal-nav:hover {
  background: var(--dark);
  color: #F5F4F0;
}
.cal-nav__icon {
  width: 0.85rem;
  height: 0.85rem;
}

.cal {
  border: 1px solid var(--subtle);
  border-bottom: 0;
}

.cal__weekdays {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  border-bottom: 1px solid var(--subtle);
  background: color-mix(in srgb, var(--paper) 45%, transparent);
}
.cal__weekdays span {
  padding: 0.55rem 0.6rem;
  color: var(--muted);
  font-size: 0.5rem;
  font-weight: 500;
  letter-spacing: 0.2em;
  text-align: center;
  text-transform: uppercase;
}

.cal__week {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
}

.cal__day {
  min-height: 6.2rem;
  padding: 0.4rem;
  border-right: 1px solid var(--subtle);
  border-bottom: 1px solid var(--subtle);
  background: #fff;
  cursor: pointer;
  transition: background 0.15s;
}
.cal__day:last-child { border-right: 0; }
.cal__day:hover {
  background: color-mix(in srgb, var(--paper) 55%, transparent);
}
.cal__day--out {
  background: color-mix(in srgb, var(--paper) 40%, transparent);
}
.cal__day--out .cal__num { opacity: 0.38; }

.cal__num {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.5rem;
  height: 1.5rem;
  color: var(--dark);
  font-size: 0.68rem;
}
.cal__day--today .cal__num {
  background: var(--accent);
  border-radius: 50%;
  color: #fff;
  font-weight: 500;
}

.cal__chip {
  display: block;
  width: 100%;
  margin-top: 0.22rem;
  border: 0;
  border-left: 2px solid var(--accent);
  background: color-mix(in srgb, var(--accent) 10%, #fff);
  color: var(--dark);
  padding: 0.24rem 0.4rem;
  font-family: var(--font-sans);
  font-size: 0.62rem;
  line-height: 1.3;
  text-align: left;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  cursor: pointer;
  transition: background 0.15s;
}
.cal__chip:hover {
  background: var(--accent);
  color: #fff;
}
.cal__chip--draft {
  border-left-style: dashed;
  border-left-color: var(--muted);
  background: color-mix(in srgb, var(--paper) 70%, transparent);
  color: var(--muted);
}
.cal__chip--draft:hover {
  background: var(--dark);
  color: #F5F4F0;
}

.cal-hint {
  margin-top: 0.6rem;
  color: var(--muted);
  font-size: 0.62rem;
}

/* ── Undated events ── */
.undated__list {
  list-style: none;
  margin: 0;
  padding: 0;
  border: 1px solid var(--subtle);
  border-bottom: 0;
}

.undated__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  width: 100%;
  border: 0;
  border-bottom: 1px solid var(--subtle);
  background: #fff;
  padding: 0.85rem 1rem;
  font-family: var(--font-sans);
  cursor: pointer;
  transition: background 0.15s;
}
.undated__row:hover {
  background: color-mix(in srgb, var(--paper) 45%, transparent);
}

.undated__name {
  color: var(--dark);
  font-size: 0.78rem;
}

.pill {
  padding: 0.22rem 0.55rem;
  font-size: 0.5rem;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}
.pill--published {
  background: color-mix(in srgb, var(--accent) 12%, #fff);
  color: var(--accent);
}
.pill--draft {
  background: color-mix(in srgb, var(--paper) 80%, transparent);
  color: var(--muted);
}

.empty {
  padding: 1.5rem 0;
  color: var(--muted);
  font-size: 0.72rem;
}

/* ── Form ── */
.event-form {
  display: grid;
  gap: 1rem;
}

.form-layout {
  display: grid;
  grid-template-columns: 15rem minmax(0, 1fr);
  gap: 1.1rem;
  align-items: start;
}

.cover-field {
  display: grid;
  gap: 0.45rem;
}

.cover-field > span,
.form-field span {
  color: var(--muted);
  font-size: 0.52rem;
  letter-spacing: 0.16em;
  text-transform: uppercase;
}

.fields {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.85rem;
}

.form-field {
  display: grid;
  gap: 0.45rem;
  align-content: start;
}
.form-field--full { grid-column: 1 / -1; }

.form-field input,
.form-field select,
.form-field textarea {
  width: 100%;
  border: 1px solid var(--subtle);
  background: #fff;
  color: var(--dark);
  font-family: var(--font-sans);
  font-size: 0.78rem;
  padding: 0.68rem 0.75rem;
  outline: none;
  transition: border-color 0.15s;
}
.form-field input:focus,
.form-field select:focus,
.form-field textarea:focus {
  border-color: var(--accent);
}
.form-field textarea {
  resize: vertical;
  line-height: 1.6;
}
.form-field textarea.mono {
  font-family: ui-monospace, 'Cascadia Mono', Consolas, monospace;
  font-size: 0.72rem;
}

/* ── Mini-gallery ── */
.activity-media {
  padding-top: 1.4rem;
  border-top: 1px solid var(--subtle);
}

.activity-media__head {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 1.5rem;
  margin-bottom: 1.1rem;
}
.activity-media__head > div { max-width: 38rem; }
.activity-media__kicker {
  margin-bottom: 0.45rem;
  color: var(--accent);
  font-size: 0.5rem;
  font-weight: 500;
  letter-spacing: 0.18em;
  text-transform: uppercase;
}
.activity-media__head h3 {
  color: var(--dark);
  font-family: var(--font-serif);
  font-size: 1.45rem;
  font-weight: 300;
  line-height: 1.15;
}
.activity-media__head p:last-child {
  margin-top: 0.45rem;
  color: var(--muted);
  font-size: 0.72rem;
  line-height: 1.65;
}
.activity-media__count {
  flex: 0 0 auto;
  padding-bottom: 0.25rem;
  color: var(--muted);
  font-size: 0.55rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.activity-media__library {
  display: flex;
  align-items: center;
  gap: 1rem;
  margin-top: 0.8rem;
}
.activity-media__library-actions { display: flex; flex-wrap: wrap; gap: 0.55rem; }
.activity-media__library > span {
  color: var(--muted);
  font-size: 0.66rem;
  line-height: 1.5;
}

.activity-media__tray {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 0.7rem;
  margin-top: 1.25rem;
}
.activity-media__item {
  min-width: 0;
  border: 1px solid var(--subtle);
  background: var(--body-bg);
}
.activity-media__thumb {
  position: relative;
  aspect-ratio: 4 / 3;
  overflow: hidden;
  background: var(--paper);
}
.activity-media__thumb img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.activity-media__thumb span {
  position: absolute;
  right: 0;
  bottom: 0;
  padding: 0.32rem 0.48rem;
  background: var(--dark);
  color: #F5F4F0;
  font-size: 0.43rem;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}
.activity-media__item-body { padding: 0.7rem; }
.activity-media__item code {
  display: block;
  overflow: hidden;
  color: var(--muted);
  font-family: var(--font-sans);
  font-size: 0.55rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.activity-media__controls {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 1px;
  margin-top: 0.65rem;
  background: var(--subtle);
}
.activity-media__controls button {
  display: grid;
  min-height: 2rem;
  place-items: center;
  border: 0;
  background: var(--body-bg);
  color: var(--muted);
  cursor: pointer;
}
.activity-media__controls button:hover:not(:disabled),
.activity-media__controls button:focus-visible { color: var(--accent); }
.activity-media__controls button:disabled { cursor: default; opacity: 0.28; }
.activity-media__controls button:focus-visible { outline: 1px solid var(--accent); outline-offset: -2px; }
.activity-media__controls :deep(svg) { width: 0.9rem; height: 0.9rem; }
.activity-media__controls .activity-media__remove:hover,
.activity-media__controls .activity-media__remove:focus-visible { color: #b42318; }

.activity-media__empty {
  margin-top: 1.25rem;
  padding: 1.25rem;
  border: 1px dashed var(--subtle);
  color: var(--muted);
  font-size: 0.7rem;
  line-height: 1.6;
  text-align: center;
}

.form-error {
  border: 1px solid color-mix(in srgb, #b0243c 36%, var(--subtle));
  color: #b0243c;
  padding: 0.7rem 0.8rem;
  font-size: 0.72rem;
  line-height: 1.5;
}

.form-actions {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding-top: 0.35rem;
}
.form-actions__spacer { flex: 1; }
.form-actions--confirm {
  justify-content: flex-end;
  margin-top: 1.25rem;
}

.confirm-text {
  color: var(--muted);
  font-size: 0.78rem;
  line-height: 1.7;
}
.confirm-text strong {
  color: var(--dark);
  font-weight: 500;
}

@media (max-width: 860px) {
  .activities-admin {
    padding: 2rem 1rem 4rem;
  }

  .page-head,
  .section-head {
    align-items: flex-start;
    flex-direction: column;
  }

  .page-head h1 {
    font-size: clamp(2.6rem, 16vw, 4rem);
  }

  .overview {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .metric:nth-child(3) { border-left: 0; }

  .cal__day {
    min-height: 3.6rem;
    padding: 0.25rem;
  }
  .cal__chip {
    height: 0.45rem;
    padding: 0;
    font-size: 0;
  }

  .form-layout,
  .fields {
    grid-template-columns: 1fr;
  }

  .activity-media__head,
  .activity-media__library {
    align-items: flex-start;
    flex-direction: column;
  }
  .activity-media__tray { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
</style>
