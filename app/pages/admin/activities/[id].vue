<script setup lang="ts">
definePageMeta({ layout: 'admin', middleware: 'admin' })
const { t } = useI18n()

interface EventItem {
  id: number
  slug: string
  title: string
  summary: string | null
  body: string
  galleryR2Keys: string[]
  eventDate: string | null
  location: string | null
  coverR2Key: string | null
  registerUrl: string | null
  status: 'draft' | 'published'
  publishedAt: string | null
}

const route = useRoute()
const id = Number(route.params.id)

const { data: ev, refresh, error } = await useFetch<EventItem>(`/api/admin/events/${id}`)
if (error.value || !ev.value) throw createError({ statusCode: 404, statusMessage: 'ไม่พบกิจกรรม', fatal: true })

useHead(() => ({ title: ev.value?.title || t('adminActivities.eventFallback') }))

function errMsg(e: unknown, fb: string) {
  return (e as { data?: { message?: string } })?.data?.message || fb
}

const form = reactive({
  title: '', slug: '', summary: '', body: '', eventDate: '', location: '',
  coverR2Key: null as string | null, galleryR2Keys: [] as string[],
  registerUrl: '', status: 'draft' as 'draft' | 'published'
})
watchEffect(() => {
  const e = ev.value
  if (e) Object.assign(form, {
    title: e.title, slug: e.slug, summary: e.summary ?? '', body: e.body ?? '',
    eventDate: e.eventDate ? new Date(e.eventDate).toISOString().slice(0, 10) : '',
    location: e.location ?? '', coverR2Key: e.coverR2Key,
    galleryR2Keys: [...(e.galleryR2Keys ?? [])],
    registerUrl: e.registerUrl ?? '', status: e.status
  })
})

const saving = ref(false)
const savedMsg = ref('')
const activityImagePickerOpen = ref(false)
function addGalleryImages(keys: string[]) {
  form.galleryR2Keys = [...new Set([...form.galleryR2Keys, ...keys.filter(Boolean)])].slice(0, 24)
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

async function save() {
  saving.value = true
  savedMsg.value = ''
  try {
    await $fetch(`/api/admin/events/${id}`, {
      method: 'PATCH',
      body: {
        title: form.title, slug: form.slug, summary: form.summary || null, body: form.body,
        galleryR2Keys: form.galleryR2Keys,
        eventDate: form.eventDate || null, location: form.location || null,
        coverR2Key: form.coverR2Key, registerUrl: form.registerUrl || null, status: form.status
      }
    })
    savedMsg.value = t('adminSettings.saved')
    await refresh()
  } catch (e) {
    savedMsg.value = errMsg(e, t('adminActivities.saveFailed'))
  } finally {
    saving.value = false
  }
}

const confirmDelete = ref(false)
const deleting = ref(false)
async function remove() {
  deleting.value = true
  try {
    await $fetch(`/api/admin/events/${id}`, { method: 'DELETE' })
    await navigateTo('/admin/activities')
  } catch (e) {
    alert(errMsg(e, t('adminActivities.deleteFailed')))
    deleting.value = false
  }
}
</script>

<template>
  <div v-if="ev">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div class="flex items-center gap-2 text-sm text-ink-soft">
        <NuxtLink to="/admin/activities" class="hover:text-ink"><Icon name="heroicons:arrow-left" class="size-4" /></NuxtLink>
        <span>{{ t('adminActivities.title') }}</span>
        <Icon name="heroicons:chevron-right" class="size-3" />
        <span class="max-w-[16rem] truncate text-ink">{{ ev.title }}</span>
      </div>
      <div class="flex items-center gap-2">
        <UiButton v-if="ev.status === 'published'" variant="secondary" size="sm" :to="`/activities/${ev.slug}`" target="_blank">
          <Icon name="heroicons:arrow-top-right-on-square" class="size-4" /> {{ t('adminGalleries.viewOnSite') }}
        </UiButton>
        <UiButton variant="danger" size="sm" @click="confirmDelete = true">
          <Icon name="heroicons:trash" class="size-4" /> {{ t('admin.delete') }}
        </UiButton>
        <UiButton size="sm" :loading="saving" @click="save">{{ t('admin.save') }}</UiButton>
      </div>
    </div>

    <div class="mt-6 grid gap-6 lg:grid-cols-[1fr_18rem]">
      <section class="space-y-4 rounded-lg border border-line bg-white p-5">
        <UiField :label="t('adminActivities.eventTitle')" input-id="e-title">
          <UiInput id="e-title" v-model="form.title" />
        </UiField>
        <UiField label="Slug (URL)" input-id="e-slug" :hint="`/activities/${form.slug}`">
          <UiInput id="e-slug" v-model="form.slug" />
        </UiField>
        <div class="grid gap-4 sm:grid-cols-2">
          <UiField :label="t('adminActivities.startDate')" input-id="e-date">
            <UiDateInput id="e-date" v-model="form.eventDate" />
          </UiField>
          <UiField :label="t('adminActivities.location')" input-id="e-loc">
            <UiInput id="e-loc" v-model="form.location" :placeholder="t('adminActivities.locationPlaceholder')" />
          </UiField>
        </div>
        <UiField :label="t('adminActivities.summary')" input-id="e-summary" :hint="t('adminActivities.summaryHint')">
          <UiTextarea id="e-summary" v-model="form.summary" :rows="2" />
        </UiField>
        <UiField :label="t('adminActivities.body')" input-id="e-body">
          <UiTextarea id="e-body" v-model="form.body" :rows="14" class="font-mono" />
        </UiField>
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
            :prefix="`events/${id}/gallery`"
            :max-files="24"
            :show-previews="false"
          />
          <div class="activity-media__library">
            <div class="activity-media__library-actions">
              <UiButton variant="secondary" size="sm" @click="activityImagePickerOpen = true">
                <Icon name="heroicons:photo" class="size-4" />
                {{ t('adminActivities.chooseActivityImages') }}
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
      </section>

      <aside class="space-y-5">
        <div class="rounded-lg border border-line bg-white p-5">
          <h3 class="text-sm font-semibold text-ink">{{ t('adminActivities.published') }}</h3>
          <div class="mt-3 space-y-3">
            <UiField :label="t('adminActivities.status')" input-id="e-status">
              <UiSelect id="e-status" v-model="form.status">
                <option value="draft">{{ t('adminActivities.draft') }}</option>
                <option value="published">{{ t('adminActivities.published') }}</option>
              </UiSelect>
            </UiField>
            <UiButton block :loading="saving" @click="save">{{ t('admin.save') }}</UiButton>
            <p v-if="savedMsg" class="text-center text-sm text-ink-soft">{{ savedMsg }}</p>
          </div>
        </div>

        <div class="rounded-lg border border-line bg-white p-5">
          <h3 class="text-sm font-semibold text-ink">{{ t('adminActivities.cover') }}</h3>
          <div class="mt-3">
            <AdminCoverUploader v-model="form.coverR2Key" prefix="events/covers" />
          </div>
        </div>

        <div class="rounded-lg border border-line bg-white p-5">
          <h3 class="text-sm font-semibold text-ink">{{ t('adminActivities.registerUrl') }}</h3>
          <p class="mt-1 text-xs text-ink-soft">{{ t('adminActivities.registerHint') }}</p>
          <div class="mt-3">
            <UiInput v-model="form.registerUrl" type="url" placeholder="https://…" />
          </div>
        </div>
      </aside>
    </div>

    <UiModal v-model="confirmDelete" :title="t('adminActivities.deleteTitle')">
      <p class="text-sm text-ink-soft">{{ t('adminActivities.deleteConfirmPrefix') }} <span class="font-medium text-ink">{{ ev.title }}</span> {{ t('adminActivities.deleteConfirmSuffix') }}</p>
      <div class="mt-5 flex justify-end gap-2">
        <UiButton variant="secondary" @click="confirmDelete = false">{{ t('admin.cancel') }}</UiButton>
        <UiButton variant="danger" :loading="deleting" @click="remove">{{ t('admin.delete') }}</UiButton>
      </div>
    </UiModal>

    <AdminImagePickerModal
      v-model="activityImagePickerOpen"
      :prefix="`events/${id}`"
      multiple
      :title="t('adminActivities.chooseActivityImages')"
      @select="addGalleryImages"
    />
  </div>
</template>

<style scoped>
.activity-media {
  margin-top: 1.5rem;
  padding-top: 1.5rem;
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
.activity-media__controls button {
  border: 0;
  background: none;
  cursor: pointer;
  color: var(--muted);
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
  background: var(--body-bg);
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

@media (max-width: 680px) {
  .activity-media__head { align-items: flex-start; flex-direction: column; }
  .activity-media__library { align-items: flex-start; flex-direction: column; }
  .activity-media__tray { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
</style>
