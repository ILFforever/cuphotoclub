<script setup lang="ts">
import { isPrivateR2Key } from '~~/shared/r2Prefixes'

definePageMeta({ layout: 'admin', middleware: 'admin' })
useHead({ title: 'R2 Images' })

interface ImageUsage {
  kind: 'gallery' | 'hero' | 'history' | 'clubroom' | 'post-cover' | 'event-cover' | 'event-gallery' | 'member-photo' | 'editorial-album' | 'contribution' | 'collection-cover' | 'competition-entry'
  label: string
  href?: string
  role?: string
}

// /images/ 404s the private prefix by design, so those rows have to come from
// the authenticated route instead. Public-prefix keys keep using /images/ —
// it is edge-cached, and every admin thumbnail is otherwise a full-size
// original streamed through the Worker.
function thumbUrl(key: string) {
  return isPrivateR2Key(key)
    ? `/api/admin/r2-images/preview?key=${encodeURIComponent(key)}`
    : `/images/${key}`
}

interface R2Image {
  key: string
  contentType?: string
  size?: number
  uploadedAt?: string
  albums: ImageUsage[]
  usages: ImageUsage[]
}

interface R2Inventory {
  prefix: string
  total: number
  indexReady: boolean
  linkedToAlbums: number
  referenced: number
  images: R2Image[]
}

interface DirectDeletePayload {
  url: string
  headers?: Record<string, string>
  expiresAt?: string
}

interface DeleteSessionItem {
  key: string
  status: 'ready' | 'blocked' | 'deleted' | 'failed'
  referenced: boolean
  error?: string
  delete?: DirectDeletePayload
}

interface DeleteSessionResponse {
  id: string
  force: boolean
  items: DeleteSessionItem[]
}

const prefixInput = ref('')
const activePrefix = ref('')
const statusFilter = ref<'all' | 'album' | 'referenced' | 'unlinked'>('all')
const search = ref('')

const { data, pending, error, refresh } = await useFetch<R2Inventory>('/api/admin/r2-images', {
  query: computed(() => ({ prefix: activePrefix.value || undefined }))
})

// Normal loads (and the auto-refresh / post-action reloads) read the
// r2_objects index and are quick. Only the Refresh button re-checks that index
// against the bucket, in resumable steps (useR2IndexSync, see
// server/utils/r2Objects.ts), to pick up anything that reached R2 without
// being indexed. It is slow, so it's never part of an ordinary reload.
const { t } = useI18n()
const indexSync = useR2IndexSync()
async function rescanInventory() {
  await indexSync.run()
  await refresh()
}

// Until the index has been fully checked once the list is partial, so the
// page counts first instead of offering it (it drives bulk delete).
watch(() => data.value?.indexReady, (ready) => {
  if (import.meta.client && ready === false && !indexSync.syncing.value && !indexSync.failed.value) rescanInventory()
}, { immediate: true })

// ── View toggle + trash inventory ──────────────────────────────────────────
const view = ref<'inventory' | 'trash'>('inventory')

interface TrashItem {
  key: string
  contentType: string | null
  size: number | null
  referenced: boolean
  references: Record<string, boolean> | null
  deletedBy: number | null
  deletedByEmail: string | null
  deletedByName: string | null
  deletedAt: string
}
interface TrashInventory {
  total: number
  totalSize: number
  items: TrashItem[]
}

const { data: trashData, pending: trashPending, refresh: refreshTrash } =
  await useFetch<TrashInventory>('/api/admin/r2-images/trash')
const trashItems = computed(() => trashData.value?.items ?? [])
const trashCount = computed(() => trashData.value?.total ?? 0)

const AUTO_REFRESH_MS = 45_000
let autoRefreshTimer: ReturnType<typeof setInterval> | null = null

async function autoRefreshInventory() {
  if (pending.value || indexSync.syncing.value) return
  if (deleteConfirm.active || passwordGate.active || deleteProgress.active || bulkDeleting.value) return
  if (import.meta.client && document.visibilityState !== 'visible') return
  await refresh()
}

const images = computed(() => data.value?.images ?? [])
const filteredImages = computed(() => {
  const term = search.value.trim().toLowerCase()
  return images.value.filter((image) => {
    const hasAlbum = image.albums.length > 0
    const hasReference = hasAlbum || image.usages.length > 0
    if (statusFilter.value === 'album' && !hasAlbum) return false
    if (statusFilter.value === 'referenced' && !hasReference) return false
    if (statusFilter.value === 'unlinked' && hasReference) return false
    if (!term) return true
    const haystack = [
      image.key,
      ...image.albums.map(item => item.label),
      ...image.usages.map(item => item.label)
    ].join(' ').toLowerCase()
    return haystack.includes(term)
  })
})

const prefixOptions = computed(() => {
  const firstSegments = new Set(images.value.map(image => image.key.split('/')[0] ?? '').filter(Boolean))
  return [...firstSegments].sort((a, b) => a.localeCompare(b))
})

function applyPrefix(prefix = prefixInput.value) {
  activePrefix.value = prefix.trim().replace(/^\/+/, '')
  prefixInput.value = activePrefix.value
}

function clearPrefix() {
  prefixInput.value = ''
  applyPrefix('')
}

function formatBytes(value?: number) {
  if (!value) return '—'
  const units = ['B', 'KB', 'MB', 'GB']
  let size = value
  let unit = 0
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024
    unit++
  }
  return `${size >= 10 || unit === 0 ? Math.round(size) : size.toFixed(1)} ${units[unit]}`
}

function usageLabel(item: ImageUsage) {
  return item.role ? `${item.label} · ${item.role}` : item.label
}

const deletingKey = ref<string | null>(null)
const deleteConfirm = reactive({
  active: false,
  title: '',
  message: '',
  detail: '',
  confirmLabel: 'Delete',
  warningTitle: '',
  warningItems: [] as string[],
  countdown: 0,
  resolve: null as null | ((confirmed: boolean) => void)
})
let deleteCountdownTimer: ReturnType<typeof setInterval> | null = null

function clearDeleteCountdown() {
  if (deleteCountdownTimer) {
    clearInterval(deleteCountdownTimer)
    deleteCountdownTimer = null
  }
  deleteConfirm.countdown = 0
}
const passwordGate = reactive({
  active: false,
  title: '',
  message: '',
  password: '',
  error: '',
  loading: false,
  resolve: null as null | ((confirmed: boolean) => void)
})
const deleteProgress = reactive({
  active: false,
  title: '',
  current: '',
  done: 0,
  total: 0,
  failed: 0,
  blocked: 0,
  pauseSeconds: 0
})
const deleteProgressPercent = computed(() =>
  deleteProgress.total
    ? Math.min(100, Math.round((deleteProgress.done / deleteProgress.total) * 100))
    : 0
)

function askDeleteConfirmation(options: {
  title: string
  message: string
  detail?: string
  confirmLabel?: string
  warningTitle?: string
  warningItems?: string[]
  countdownSeconds?: number
}) {
  clearDeleteCountdown()
  deleteConfirm.active = true
  deleteConfirm.title = options.title
  deleteConfirm.message = options.message
  deleteConfirm.detail = options.detail || ''
  deleteConfirm.confirmLabel = options.confirmLabel || 'Delete'
  deleteConfirm.warningTitle = options.warningTitle || ''
  deleteConfirm.warningItems = options.warningItems || []
  deleteConfirm.countdown = options.countdownSeconds || 0
  if (deleteConfirm.countdown > 0) {
    deleteCountdownTimer = setInterval(() => {
      deleteConfirm.countdown -= 1
      if (deleteConfirm.countdown <= 0) clearDeleteCountdown()
    }, 1000)
  }
  return new Promise<boolean>((resolve) => {
    deleteConfirm.resolve = resolve
  })
}

function resolveDeleteConfirmation(confirmed: boolean) {
  if (confirmed && deleteConfirm.countdown > 0) return
  clearDeleteCountdown()
  deleteConfirm.active = false
  deleteConfirm.resolve?.(confirmed)
  deleteConfirm.resolve = null
}

function askPasswordGate(options: { title: string; message: string }) {
  passwordGate.active = true
  passwordGate.title = options.title
  passwordGate.message = options.message
  passwordGate.password = ''
  passwordGate.error = ''
  passwordGate.loading = false
  return new Promise<boolean>((resolve) => {
    passwordGate.resolve = resolve
  })
}

function resolvePasswordGate(confirmed: boolean) {
  passwordGate.active = false
  passwordGate.resolve?.(confirmed)
  passwordGate.resolve = null
}

async function submitPasswordGate() {
  if (passwordGate.loading || !passwordGate.password) return
  passwordGate.loading = true
  passwordGate.error = ''
  try {
    await $fetch('/api/admin/verify-password', {
      method: 'POST',
      body: { password: passwordGate.password }
    })
    resolvePasswordGate(true)
  } catch (err) {
    passwordGate.error = errText(err) || 'Password check failed.'
  } finally {
    passwordGate.loading = false
  }
}

const DELETE_RESOURCE_LIMIT_PAUSE_MS = 30_000
let deleteResourcePausePromise: Promise<void> | null = null
let deleteResourcePauseTimer: ReturnType<typeof setInterval> | null = null

// $fetch rejections carry the server payload on `data`; everything that reads
// an error message goes through here so the digging is written once.
type FetchErr = {
  statusCode?: number
  message?: string
  data?: string | { message?: string, statusMessage?: string }
}

function errText(err: unknown): string {
  const e = err as FetchErr | undefined
  const data = e?.data
  return typeof data === 'string'
    ? data
    : data?.message || data?.statusMessage || e?.message || ''
}

function isDeleteResourceLimitError(err: unknown) {
  return /Worker exceeded resource limits|Error 1102/i.test(errText(err))
}

function beginDeleteResourceLimitPause() {
  if (deleteResourcePausePromise) return deleteResourcePausePromise

  const pauseUntil = Date.now() + DELETE_RESOURCE_LIMIT_PAUSE_MS
  deleteProgress.pauseSeconds = Math.ceil(DELETE_RESOURCE_LIMIT_PAUSE_MS / 1000)
  deleteResourcePauseTimer = setInterval(() => {
    deleteProgress.pauseSeconds = Math.max(0, Math.ceil((pauseUntil - Date.now()) / 1000))
  }, 250)

  deleteResourcePausePromise = new Promise((resolve) => {
    setTimeout(() => {
      if (deleteResourcePauseTimer) clearInterval(deleteResourcePauseTimer)
      deleteResourcePauseTimer = null
      deleteProgress.pauseSeconds = 0
      deleteResourcePausePromise = null
      resolve()
    }, DELETE_RESOURCE_LIMIT_PAUSE_MS)
  })

  return deleteResourcePausePromise
}

async function waitForDeleteResourceLimitPause() {
  if (deleteResourcePausePromise) await deleteResourcePausePromise
}

function beginDeleteProgress(title: string, total: number) {
  deleteProgress.active = true
  deleteProgress.title = title
  deleteProgress.current = ''
  deleteProgress.done = 0
  deleteProgress.total = Math.max(1, total)
  deleteProgress.failed = 0
  deleteProgress.blocked = 0
  deleteProgress.pauseSeconds = 0
}

function extendDeleteProgress(count: number) {
  deleteProgress.total += count
}

function stepDeleteProgress(key: string, status: 'deleted' | 'failed' | 'blocked' = 'deleted') {
  deleteProgress.current = key
  deleteProgress.done = Math.min(deleteProgress.done + 1, deleteProgress.total)
  if (status === 'failed') deleteProgress.failed++
  if (status === 'blocked') deleteProgress.blocked++
}

async function finishDeleteProgress() {
  if (!deleteProgress.active) return
  await new Promise(resolve => setTimeout(resolve, 320))
  deleteProgress.active = false
}

async function requestDelete(key: string, force = false) {
  await $fetch('/api/admin/r2-images/delete', {
    method: 'POST',
    body: { key, force }
  })
}

async function deleteImage(image: R2Image) {
  deletingKey.value = image.key
  beginDeleteProgress('Moving image to trash', 1)
  await nextTick()
  try {
    await requestDelete(image.key)
    stepDeleteProgress(image.key)
    await refresh()
    await refreshTrash()
  } catch (err) {
    if ((err as FetchErr)?.statusCode === 409) {
      stepDeleteProgress(image.key, 'blocked')
      if (await askDeleteConfirmation({
        title: 'Trash referenced image?',
        message: errText(err) || 'This image is still referenced elsewhere.',
        detail: image.key,
        confirmLabel: 'Move to trash anyway'
      })) {
        extendDeleteProgress(1)
        try {
          await requestDelete(image.key, true)
          stepDeleteProgress(image.key)
          await refresh()
          await refreshTrash()
        } catch (forceErr) {
          if (isDeleteResourceLimitError(forceErr)) await beginDeleteResourceLimitPause()
          stepDeleteProgress(image.key, 'failed')
          alert(errText(forceErr) || 'Could not move image to trash.')
        }
      }
    } else {
      if (isDeleteResourceLimitError(err)) await beginDeleteResourceLimitPause()
      stepDeleteProgress(image.key, 'failed')
      alert(errText(err) || 'Could not move image to trash.')
    }
  } finally {
    deletingKey.value = null
    await finishDeleteProgress()
  }
}

async function confirmDelete(image: R2Image) {
  const hasReferences = image.albums.length > 0 || image.usages.length > 0
  const confirmed = await askDeleteConfirmation({
    title: hasReferences ? 'Trash referenced image?' : 'Move image to trash?',
    message: hasReferences
      ? 'This image is currently used by the site. The server will block trashing unless you force it in the next step.'
      : 'This moves the image to Trash. The file is kept and you can restore it from the Trash tab.',
    detail: image.key,
    confirmLabel: 'Move to trash',
    warningTitle: hasReferences ? 'REFERENCED IMAGE' : '',
    warningItems: hasReferences
      ? [
          `${image.albums.length + image.usages.length} known reference${image.albums.length + image.usages.length === 1 ? '' : 's'}`,
          'Trashing it clears the covers, managed landing images, gallery tiles, or album layouts that use it. Restoring brings back the file, not those references.'
        ]
      : []
  })
  if (confirmed) deleteImage(image)
}

// ── Bulk selection ───────────────────────────────────────────────────────
const selected = ref<Set<string>>(new Set())
const bulkDeleting = ref(false)
const lastSelectedIndex = ref<number | null>(null)

function isSelected(key: string) {
  return selected.value.has(key)
}
function selectionOrder(key: string) {
  const index = [...selected.value].indexOf(key)
  return index >= 0 ? index + 1 : null
}
function toggleSelected(key: string) {
  const next = new Set(selected.value)
  if (next.has(key)) next.delete(key)
  else next.add(key)
  selected.value = next
}
function selectRange(fromIndex: number, toIndex: number) {
  const [start, end] = fromIndex <= toIndex ? [fromIndex, toIndex] : [toIndex, fromIndex]
  const next = new Set(selected.value)
  for (let i = start; i <= end; i++) {
    const image = pagedImages.value[i]
    if (image) next.add(image.key)
  }
  selected.value = next
}
function onCheckboxClick(event: MouseEvent, key: string, index: number) {
  event.preventDefault()
  if (event.shiftKey && lastSelectedIndex.value !== null) {
    selectRange(lastSelectedIndex.value, index)
  } else {
    toggleSelected(key)
  }
  lastSelectedIndex.value = index
}
function clearSelection() {
  selected.value = new Set()
  lastSelectedIndex.value = null
}
const allFilteredSelected = computed(() =>
  filteredImages.value.length > 0 && filteredImages.value.every(image => selected.value.has(image.key))
)
function toggleSelectAllFiltered() {
  if (allFilteredSelected.value) {
    clearSelection()
  } else {
    selected.value = new Set(filteredImages.value.map(image => image.key))
  }
}

// ── Pagination ───────────────────────────────────────────────────────────
const pageSizeOptions = [50, 100, 200, 500] as const
const pageSize = ref(100)
const page = ref(1)
const totalPages = computed(() => Math.max(1, Math.ceil(filteredImages.value.length / pageSize.value)))
watch([filteredImages, pageSize], () => {
  if (page.value > totalPages.value) page.value = totalPages.value
})
watch([search, statusFilter, activePrefix], () => { page.value = 1 })
const pagedImages = computed(() => {
  const start = (page.value - 1) * pageSize.value
  return filteredImages.value.slice(start, start + pageSize.value)
})
function goToPage(n: number) {
  page.value = Math.min(Math.max(1, n), totalPages.value)
  if (import.meta.client) window.scrollTo({ top: 0, behavior: 'smooth' })
}

const DELETE_DIRECT_CONCURRENCY = 8
const DELETE_SESSION_SIZE = 250

async function runDeletePool<T>(items: T[], worker: (item: T) => Promise<void>) {
  for (let index = 0; index < items.length; index += DELETE_DIRECT_CONCURRENCY) {
    await waitForDeleteResourceLimitPause()
    const batch = items.slice(index, index + DELETE_DIRECT_CONCURRENCY)
    await Promise.all(batch.map(item => worker(item)))
  }
}

function chunkKeys(keys: string[]) {
  const chunks: string[][] = []
  for (let index = 0; index < keys.length; index += DELETE_SESSION_SIZE) {
    chunks.push(keys.slice(index, index + DELETE_SESSION_SIZE))
  }
  return chunks
}

async function createDeleteSession(keys: string[], force = false) {
  return await $fetch<DeleteSessionResponse>('/api/admin/r2-images/delete-session', {
    method: 'POST',
    body: { keys, force }
  })
}

async function completeDeleteSession(id: string, results: { key: string; status: 'deleted' | 'failed'; error?: string }[]) {
  if (!results.length) return
  await $fetch(`/api/admin/r2-images/delete-session/${encodeURIComponent(id)}/complete`, {
    method: 'POST',
    body: { results }
  })
}

async function requestDirectDelete(item: DeleteSessionItem) {
  if (!item.delete?.url) throw new Error(item.error || 'Direct R2 delete URL was not issued.')
  const response = await fetch(item.delete.url, {
    method: 'DELETE',
    headers: item.delete.headers || {}
  })
  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new Error(`Direct R2 delete failed (${response.status}). ${body}`.trim())
  }
}

async function runDeleteSessions(keys: string[], force: boolean, blocked: string[], failed: string[]) {
  for (const chunk of chunkKeys(keys)) {
    const session = await createDeleteSession(chunk, force)
    const ready = session.items.filter(item => item.status === 'ready')
    const results: { key: string; status: 'deleted' | 'failed'; error?: string }[] = []

    for (const item of session.items) {
      if (item.status !== 'blocked') continue
      blocked.push(item.key)
      stepDeleteProgress(item.key, 'blocked')
    }

    await runDeletePool(ready, async (item) => {
      try {
        await requestDirectDelete(item)
        results.push({ key: item.key, status: 'deleted' })
        stepDeleteProgress(item.key)
      } catch (err) {
        failed.push(item.key)
        results.push({ key: item.key, status: 'failed', error: errText(err) || 'Direct R2 delete failed.' })
        stepDeleteProgress(item.key, 'failed')
      }
    })

    try {
      await completeDeleteSession(session.id, results)
    } catch (err) {
      const message = errText(err) || 'Could not complete delete session.'
      for (const result of results) {
        if (result.status === 'deleted') failed.push(result.key)
      }
      alert(message)
    }
  }
}

async function runTrashSessions(keys: string[], force: boolean, blocked: string[], trashedOut: string[]) {
  for (const chunk of chunkKeys(keys)) {
    await waitForDeleteResourceLimitPause()
    try {
      const res = await $fetch<{ items: { key: string; status: 'trashed' | 'blocked'; referenced: boolean }[] }>(
        '/api/admin/r2-images/trash-session',
        { method: 'POST', body: { keys: chunk, force } }
      )
      for (const item of res.items) {
        if (item.status === 'blocked') {
          blocked.push(item.key)
          stepDeleteProgress(item.key, 'blocked')
        } else {
          trashedOut.push(item.key)
          stepDeleteProgress(item.key)
        }
      }
    } catch (err) {
      if (isDeleteResourceLimitError(err)) await beginDeleteResourceLimitPause()
      for (const key of chunk) stepDeleteProgress(key, 'failed')
      alert(errText(err) || 'Could not move images to trash.')
    }
  }
}

async function bulkDelete() {
  const keys = [...selected.value]
  if (!keys.length) return
  const selectedImages = images.value.filter(image => selected.value.has(image.key))
  const referencedCount = selectedImages.filter(image => image.albums.length || image.usages.length).length
  const deletingAllLoaded = images.value.length > 0 && keys.length === images.value.length
  const warningItems: string[] = []

  if (deletingAllLoaded) {
    warningItems.push(activePrefix.value
      ? `This selects every image under prefix "${activePrefix.value}".`
      : 'This selects every R2 image currently loaded in this inventory.')
  }
  if (referencedCount) {
    warningItems.push(`${referencedCount} selected image${referencedCount === 1 ? ' is' : 's are'} referenced by albums, landing sections, posts, events, members, or layouts.`)
    warningItems.push('Trashing referenced images clears those references. Restoring brings back the file, not the references.')
  }

  const confirmed = await askDeleteConfirmation({
    title: deletingAllLoaded
      ? 'Move every selected image to trash?'
      : referencedCount
        ? 'Trash referenced R2 images?'
        : `Move ${keys.length} image${keys.length === 1 ? '' : 's'} to trash?`,
    message: 'The files are kept and can be restored from the Trash tab.',
    detail: `${keys.length} selected`,
    confirmLabel: 'Move to trash',
    warningTitle: warningItems.length
      ? deletingAllLoaded
        ? 'MASS TRASH'
        : referencedCount
          ? 'REFERENCED IMAGES'
          : ''
      : '',
    warningItems
  })
  if (!confirmed) return

  if (referencedCount > 50) {
    const verified = await askPasswordGate({
      title: 'Admin password required',
      message: `You are trashing ${referencedCount} referenced images. Enter your admin password to continue.`
    })
    if (!verified) return
  }

  bulkDeleting.value = true
  beginDeleteProgress(`Moving ${keys.length} image${keys.length === 1 ? '' : 's'} to trash`, keys.length)
  await nextTick()
  const blocked: string[] = []
  const trashed: string[] = []
  try {
    await runTrashSessions(keys, false, blocked, trashed)

    if (blocked.length && await askDeleteConfirmation({
      title: `Trash ${blocked.length} referenced image${blocked.length === 1 ? '' : 's'}?`,
      message: `${blocked.length} of the selected images are still referenced elsewhere.`,
      detail: 'Move them to trash anyway?',
      confirmLabel: 'Move to trash anyway'
    })) {
      extendDeleteProgress(blocked.length)
      const stillBlocked: string[] = []
      await runTrashSessions(blocked, true, stillBlocked, trashed)
    }

    clearSelection()
    await refresh()
    await refreshTrash()
  } finally {
    bulkDeleting.value = false
    await finishDeleteProgress()
  }
}

// ── Trash view ─────────────────────────────────────────────────────────────
const trashSelected = ref<Set<string>>(new Set())
const trashBusy = ref(false)

function isTrashSelected(key: string) {
  return trashSelected.value.has(key)
}
function toggleTrashSelected(key: string) {
  const next = new Set(trashSelected.value)
  if (next.has(key)) next.delete(key)
  else next.add(key)
  trashSelected.value = next
}
const allTrashSelected = computed(() =>
  trashItems.value.length > 0 && trashItems.value.every(item => trashSelected.value.has(item.key))
)
function toggleSelectAllTrash() {
  trashSelected.value = allTrashSelected.value ? new Set() : new Set(trashItems.value.map(item => item.key))
}
function clearTrashSelection() {
  trashSelected.value = new Set()
}

function trashReferenceLabels(item: TrashItem): string[] {
  if (!item.references) return []
  const labels: Record<string, string> = {
    galleryPhoto: 'Gallery',
    post: 'Post cover',
    activity: 'Activity cover',
    member: 'Member photo',
    hero: 'Hero',
    history: 'Our History',
    clubroom: 'Clubroom',
    editorialAlbum: 'Album',
    submission: 'Event submission',
    collectionCover: 'Collection cover',
    competitionEntry: 'Competition entry'
  }
  return Object.entries(item.references)
    .filter(([, value]) => value)
    .map(([key]) => labels[key] || key)
}

async function restoreKeys(keys: string[]) {
  if (!keys.length) return
  trashBusy.value = true
  try {
    for (const chunk of chunkKeys(keys)) {
      await $fetch('/api/admin/r2-images/trash/restore', { method: 'POST', body: { keys: chunk } })
    }
    clearTrashSelection()
    await refreshTrash()
    await refresh()
  } catch (err) {
    alert(errText(err) || 'Could not restore images.')
  } finally {
    trashBusy.value = false
  }
}
function restoreImage(item: TrashItem) {
  return restoreKeys([item.key])
}
function restoreSelected() {
  return restoreKeys([...trashSelected.value])
}

async function purgeKeys(keys: string[]) {
  if (!keys.length) return
  trashBusy.value = true
  bulkDeleting.value = true
  beginDeleteProgress(`Permanently deleting ${keys.length} image${keys.length === 1 ? '' : 's'}`, keys.length)
  await nextTick()
  const blocked: string[] = []
  const failed: string[] = []
  try {
    // force=true: trashed items are already unreferenced, but forcing guarantees
    // the purge even if a key was re-referenced after being trashed.
    await runDeleteSessions(keys, true, blocked, failed)
    clearTrashSelection()
    await refreshTrash()
    await refresh()
    if (failed.length) alert(`Could not delete ${failed.length} image${failed.length === 1 ? '' : 's'}.`)
  } finally {
    bulkDeleting.value = false
    trashBusy.value = false
    await finishDeleteProgress()
  }
}

async function permanentlyDelete(item: TrashItem) {
  if (await askDeleteConfirmation({
    title: 'Delete permanently?',
    message: 'This removes the object from R2 for good. This cannot be undone.',
    detail: item.key,
    confirmLabel: 'Delete permanently',
    warningTitle: 'PERMANENT DELETE',
    warningItems: ['The file will be gone for good — restore will no longer be possible.']
  })) await purgeKeys([item.key])
}
async function purgeSelected() {
  const keys = [...trashSelected.value]
  if (!keys.length) return
  if (await askDeleteConfirmation({
    title: `Delete ${keys.length} image${keys.length === 1 ? '' : 's'} permanently?`,
    message: 'This removes the selected objects from R2 for good. This cannot be undone.',
    detail: `${keys.length} selected`,
    confirmLabel: 'Delete permanently',
    warningTitle: 'MASS R2 DELETE',
    warningItems: ['These files will be gone for good — restore will no longer be possible.'],
    countdownSeconds: 10
  })) await purgeKeys(keys)
}
async function emptyTrash() {
  const keys = trashItems.value.map(item => item.key)
  if (!keys.length) return
  if (await askDeleteConfirmation({
    title: `Empty trash (${keys.length})?`,
    message: 'Permanently deletes every image in the trash. This cannot be undone.',
    detail: `${keys.length} image${keys.length === 1 ? '' : 's'}`,
    confirmLabel: 'Empty trash',
    warningTitle: 'MASS R2 DELETE',
    warningItems: ['Every trashed file will be gone for good.'],
    countdownSeconds: 10
  })) await purgeKeys(keys)
}

onMounted(() => {
  autoRefreshTimer = setInterval(() => {
    autoRefreshInventory().catch(() => {})
  }, AUTO_REFRESH_MS)
})

onBeforeUnmount(() => {
  if (autoRefreshTimer) clearInterval(autoRefreshTimer)
  if (deleteResourcePauseTimer) clearInterval(deleteResourcePauseTimer)
  clearDeleteCountdown()
})
</script>

<template>
  <div class="r2">
    <Teleport to="body">
      <Transition name="delete-modal">
        <div
          v-if="deleteConfirm.active || passwordGate.active || deleteProgress.active"
          class="delete-modal"
          role="dialog"
          aria-modal="true"
          :aria-labelledby="passwordGate.active ? 'password-gate-title' : deleteConfirm.active ? 'delete-confirm-title' : 'delete-progress-title'"
        >
          <div class="delete-modal__backdrop" />
          <form v-if="passwordGate.active" class="delete-modal__panel" @submit.prevent="submitPasswordGate">
            <p class="delete-modal__kicker">Admin password gate</p>
            <h2 id="password-gate-title">{{ passwordGate.title }}</h2>
            <p class="delete-modal__copy">{{ passwordGate.message }}</p>
            <label class="delete-modal__field">
              <span>Password</span>
              <input v-model="passwordGate.password" type="password" autocomplete="current-password" autofocus>
            </label>
            <p v-if="passwordGate.error" class="delete-modal__field-error">{{ passwordGate.error }}</p>
            <div class="delete-modal__actions">
              <button type="button" class="delete-modal__cancel" :disabled="passwordGate.loading" @click="resolvePasswordGate(false)">Cancel</button>
              <button type="submit" class="delete-modal__danger" :disabled="passwordGate.loading || !passwordGate.password">
                {{ passwordGate.loading ? 'Checking...' : 'Confirm password' }}
              </button>
            </div>
          </form>
          <div v-else-if="deleteConfirm.active" class="delete-modal__panel">
            <p class="delete-modal__kicker">R2 operation</p>
            <h2 id="delete-confirm-title">{{ deleteConfirm.title }}</h2>
            <p class="delete-modal__copy">{{ deleteConfirm.message }}</p>
            <div v-if="deleteConfirm.warningTitle" class="delete-modal__warning">
              <p>{{ deleteConfirm.warningTitle }}</p>
              <ul>
                <li v-for="item in deleteConfirm.warningItems" :key="item">{{ item }}</li>
              </ul>
            </div>
            <p v-if="deleteConfirm.detail" class="delete-modal__current">{{ deleteConfirm.detail }}</p>
            <div class="delete-modal__actions">
              <button type="button" class="delete-modal__cancel" @click="resolveDeleteConfirmation(false)">Cancel</button>
              <button type="button" class="delete-modal__danger" :disabled="deleteConfirm.countdown > 0" @click="resolveDeleteConfirmation(true)">
                {{ deleteConfirm.countdown > 0 ? `${deleteConfirm.confirmLabel} (${deleteConfirm.countdown})` : deleteConfirm.confirmLabel }}
              </button>
            </div>
          </div>
          <div v-else class="delete-modal__panel">
            <div class="delete-modal__mark" aria-hidden="true">
              <span />
              <span />
              <span />
            </div>
            <p class="delete-modal__kicker">R2 operation</p>
            <h2 id="delete-progress-title">{{ deleteProgress.title }}</h2>
            <p class="delete-modal__copy">
              Removing objects from storage. Keep this page open until the progress completes.
            </p>
            <div class="delete-modal__meter" role="progressbar" :aria-valuenow="deleteProgressPercent" aria-valuemin="0" aria-valuemax="100">
              <span :style="{ transform: `scaleX(${deleteProgressPercent / 100})` }" />
            </div>
            <div class="delete-modal__meta">
              <span>{{ deleteProgress.done }} / {{ deleteProgress.total }}</span>
              <strong>{{ deleteProgressPercent }}%</strong>
            </div>
            <p class="delete-modal__current">
              {{ deleteProgress.current || 'Preparing delete queue' }}
            </p>
            <p v-if="deleteProgress.pauseSeconds" class="delete-modal__pause">
              Worker limit hit · waiting {{ deleteProgress.pauseSeconds }}s before continuing
            </p>
            <div v-if="deleteProgress.failed || deleteProgress.blocked" class="delete-modal__notes">
              <span v-if="deleteProgress.blocked">{{ deleteProgress.blocked }} referenced</span>
              <span v-if="deleteProgress.failed">{{ deleteProgress.failed }} failed</span>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

    <header class="r2__head">
      <div>
        <p class="r2__kicker">Admin inventory</p>
        <h1 class="r2__title">R2 Images</h1>
        <p class="r2__lead">Browse uploaded image objects and see which surfaces point to them, or manage images you've moved to the trash.</p>
      </div>
      <button
        type="button"
        class="r2__refresh"
        :disabled="view === 'trash' ? trashPending : (pending || indexSync.syncing.value)"
        @click="view === 'trash' ? refreshTrash() : rescanInventory()"
      >
        <Icon name="heroicons:arrow-path" />
        Refresh
      </button>
    </header>

    <p v-if="indexSync.syncing.value" class="r2__sync">{{ t('adminR2.checking', { count: indexSync.checked.value.toLocaleString('en-US') }) }}</p>
    <p v-else-if="indexSync.failed.value" class="r2__sync r2__sync--warn">{{ t('adminR2.checkFailed') }}</p>

    <nav class="r2__tabs" aria-label="R2 views">
      <button type="button" :class="{ 'is-active': view === 'inventory' }" @click="view = 'inventory'">
        Inventory
      </button>
      <button type="button" :class="{ 'is-active': view === 'trash' }" @click="view = 'trash'">
        Trash
        <span v-if="trashCount" class="r2__tab-count">{{ trashCount }}</span>
      </button>
    </nav>

    <template v-if="view === 'inventory'">
    <section class="r2__stats" aria-label="R2 image summary">
      <div>
        <strong>{{ data?.total ?? 0 }}</strong>
        <span>Images</span>
      </div>
      <div>
        <strong>{{ data?.linkedToAlbums ?? 0 }}</strong>
        <span>Video (placeholder)</span>
      </div>
      <div>
        <strong>{{ data?.referenced ?? 0 }}</strong>
        <span>Referenced anywhere</span>
      </div>
      <div>
        <strong>{{ filteredImages.length }}</strong>
        <span>Shown</span>
      </div>
    </section>

    <section class="r2__tools" aria-label="R2 image filters">
      <form class="r2__prefix" @submit.prevent="applyPrefix()">
        <label for="prefix">Prefix</label>
        <input id="prefix" v-model="prefixInput" type="text" placeholder="photos/, hero, posts/covers">
        <button type="submit">Apply</button>
        <button v-if="activePrefix" type="button" @click="clearPrefix">Clear</button>
      </form>

      <div v-if="prefixOptions.length && !activePrefix" class="r2__chips">
        <button v-for="prefix in prefixOptions" :key="prefix" type="button" @click="applyPrefix(prefix)">
          {{ prefix }}
        </button>
      </div>

      <div class="r2__filters">
        <input v-model="search" type="search" placeholder="Search key or album">
        <select v-model="statusFilter">
          <option value="all">All images</option>
          <option value="album">Linked to video (placeholder)</option>
          <option value="referenced">Referenced anywhere</option>
          <option value="unlinked">No known reference</option>
        </select>
      </div>
    </section>

    <p v-if="error" class="r2__error">Could not load R2 images.</p>
    <div v-else-if="data && !data.indexReady" class="r2__empty">
      <UiSpinner v-if="indexSync.syncing.value" />
      <span>{{ t('adminR2.firstCount') }}</span>
    </div>
    <div v-else-if="pending" class="r2__empty">
      <UiSpinner />
      <span>Loading R2 images</span>
    </div>
    <div v-else-if="!filteredImages.length" class="r2__empty">No images match this view.</div>

    <template v-else>
      <div class="r2__bulk">
        <label class="r2__select-all">
          <input type="checkbox" :checked="allFilteredSelected" :disabled="bulkDeleting" @change="toggleSelectAllFiltered">
          <span class="r2__select-box" aria-hidden="true" />
          <span>Select all shown</span>
        </label>
        <div v-if="selected.size" class="r2__bulk-actions">
          <span>{{ selected.size }} selected</span>
          <button type="button" class="r2__bulk-clear" :disabled="bulkDeleting" @click="clearSelection">Clear</button>
          <button type="button" class="r2__bulk-delete" :disabled="bulkDeleting" @click="bulkDelete">
            <Icon name="heroicons:trash" />
            {{ bulkDeleting ? 'Deleting…' : `Delete ${selected.size}` }}
          </button>
        </div>
      </div>

      <section class="r2__list" aria-label="R2 image list">
        <article v-for="(image, index) in pagedImages" :key="image.key" class="image-row" :class="{ 'is-selected': isSelected(image.key) }">
          <div class="image-row__thumb">
            <label class="image-row__check">
              <input type="checkbox" :checked="isSelected(image.key)" :disabled="bulkDeleting" @click="onCheckboxClick($event, image.key, index)">
              <span class="image-row__check-box" aria-hidden="true">
                {{ selectionOrder(image.key) || '' }}
              </span>
            </label>
            <a :href="thumbUrl(image.key)" target="_blank" rel="noopener">
              <img :src="thumbUrl(image.key)" alt="" loading="lazy">
            </a>
          </div>

          <div class="image-row__body">
            <div class="image-row__main">
              <div class="image-row__title">
                <h2>{{ image.key }}</h2>
                <button
                  type="button"
                  class="image-row__delete"
                  :disabled="!!deletingKey || bulkDeleting"
                  @click="confirmDelete(image)"
                >
                  <Icon name="heroicons:trash" />
                  {{ deletingKey === image.key ? 'Deleting…' : 'Delete' }}
                </button>
              </div>
              <dl>
                <div>
                  <dt>Type</dt>
                  <dd>{{ image.contentType || 'image' }}</dd>
                </div>
                <div>
                  <dt>Size</dt>
                  <dd>{{ formatBytes(image.size) }}</dd>
                </div>
                <div>
                  <dt>Uploaded</dt>
                  <dd>{{ formatDateTime(image.uploadedAt) }}</dd>
                </div>
              </dl>
            </div>

            <div class="image-row__refs">
              <div>
                <p>Video (placeholder)</p>
                <div v-if="image.albums.length" class="image-row__links">
                  <NuxtLink v-for="album in image.albums" :key="`${image.key}-${album.href}-${album.role}`" :to="album.href || '#'">
                    {{ usageLabel(album) }}
                  </NuxtLink>
                </div>
                <span v-else class="image-row__none">None</span>
              </div>

              <div>
                <p>Other references</p>
                <div v-if="image.usages.length" class="image-row__links">
                  <NuxtLink v-for="usage in image.usages" :key="`${image.key}-${usage.kind}-${usage.href}-${usage.role}`" :to="usage.href || '#'">
                    {{ usageLabel(usage) }}
                  </NuxtLink>
                </div>
                <span v-else class="image-row__none">None</span>
              </div>
            </div>
          </div>
        </article>
      </section>

      <nav v-if="filteredImages.length" class="r2__pagination" aria-label="Pagination">
        <label class="r2__page-size">
          <span>Per page</span>
          <select v-model.number="pageSize">
            <option v-for="size in pageSizeOptions" :key="size" :value="size">{{ size }}</option>
          </select>
        </label>

        <div v-if="totalPages > 1" class="r2__page-nav">
          <button type="button" :disabled="page === 1" @click="goToPage(page - 1)">← Previous</button>
          <span>Page {{ page }} of {{ totalPages }}</span>
          <button type="button" :disabled="page === totalPages" @click="goToPage(page + 1)">Next →</button>
        </div>
      </nav>
    </template>
    </template>

    <template v-else>
      <section class="r2__stats" aria-label="Trash summary">
        <div>
          <strong>{{ trashData?.total ?? 0 }}</strong>
          <span>In trash</span>
        </div>
        <div>
          <strong>{{ formatBytes(trashData?.totalSize) }}</strong>
          <span>Reclaimable</span>
        </div>
        <div>
          <strong>{{ trashSelected.size }}</strong>
          <span>Selected</span>
        </div>
      </section>

      <p class="r2__lead r2__trash-note">
        Trashed images are removed from the site but kept in R2. Restore brings the file back (not its former references); deleting here is permanent.
      </p>

      <div v-if="trashPending" class="r2__empty">
        <UiSpinner />
        <span>Loading trash</span>
      </div>
      <div v-else-if="!trashItems.length" class="r2__empty">Trash is empty.</div>

      <template v-else>
        <div class="r2__bulk">
          <label class="r2__select-all">
            <input type="checkbox" :checked="allTrashSelected" :disabled="trashBusy" @change="toggleSelectAllTrash">
            <span class="r2__select-box" aria-hidden="true" />
            <span>Select all</span>
          </label>
          <div class="r2__bulk-actions">
            <template v-if="trashSelected.size">
              <span>{{ trashSelected.size }} selected</span>
              <button type="button" class="r2__bulk-clear" :disabled="trashBusy" @click="clearTrashSelection">Clear</button>
              <button type="button" class="r2__bulk-restore" :disabled="trashBusy" @click="restoreSelected">
                <Icon name="heroicons:arrow-uturn-left" />
                Restore {{ trashSelected.size }}
              </button>
              <button type="button" class="r2__bulk-delete" :disabled="trashBusy" @click="purgeSelected">
                <Icon name="heroicons:trash" />
                Delete {{ trashSelected.size }}
              </button>
            </template>
            <button type="button" class="r2__bulk-delete" :disabled="trashBusy" @click="emptyTrash">
              <Icon name="heroicons:trash" />
              Empty trash
            </button>
          </div>
        </div>

        <section class="r2__list" aria-label="Trashed image list">
          <article
            v-for="item in trashItems"
            :key="item.key"
            class="image-row"
            :class="{ 'is-selected': isTrashSelected(item.key) }"
          >
            <div class="image-row__thumb">
              <label class="image-row__check">
                <input type="checkbox" :checked="isTrashSelected(item.key)" :disabled="trashBusy" @change="toggleTrashSelected(item.key)">
                <span class="image-row__check-box" aria-hidden="true" />
              </label>
              <a :href="thumbUrl(item.key)" target="_blank" rel="noopener">
                <img :src="thumbUrl(item.key)" alt="" loading="lazy">
              </a>
            </div>

            <div class="image-row__body">
              <div class="image-row__main">
                <div class="image-row__title">
                  <h2>{{ item.key }}</h2>
                  <div class="image-row__trash-actions">
                    <button type="button" class="image-row__restore" :disabled="trashBusy" @click="restoreImage(item)">
                      <Icon name="heroicons:arrow-uturn-left" />
                      Restore
                    </button>
                    <button type="button" class="image-row__delete" :disabled="trashBusy" @click="permanentlyDelete(item)">
                      <Icon name="heroicons:trash" />
                      Delete
                    </button>
                  </div>
                </div>
                <dl>
                  <div>
                    <dt>Type</dt>
                    <dd>{{ item.contentType || 'image' }}</dd>
                  </div>
                  <div>
                    <dt>Size</dt>
                    <dd>{{ formatBytes(item.size ?? undefined) }}</dd>
                  </div>
                  <div>
                    <dt>Trashed</dt>
                    <dd>{{ formatDateTime(item.deletedAt) }}</dd>
                  </div>
                  <div v-if="item.deletedByName || item.deletedByEmail">
                    <dt>By</dt>
                    <dd>{{ item.deletedByName || item.deletedByEmail }}</dd>
                  </div>
                </dl>
              </div>

              <div class="image-row__refs">
                <div>
                  <p>Was referenced</p>
                  <div v-if="trashReferenceLabels(item).length" class="image-row__links">
                    <span v-for="label in trashReferenceLabels(item)" :key="label" class="image-row__none">{{ label }}</span>
                  </div>
                  <span v-else class="image-row__none">No references</span>
                </div>
              </div>
            </div>
          </article>
        </section>
      </template>
    </template>
  </div>
</template>

<style scoped>
.delete-modal {
  position: fixed;
  inset: 0;
  z-index: 260;
  display: grid;
  place-items: center;
  padding: 1.25rem;
}

.delete-modal__backdrop {
  position: absolute;
  inset: 0;
  background:
    linear-gradient(rgba(12, 12, 10, 0.78), rgba(12, 12, 10, 0.78)),
    repeating-linear-gradient(
      90deg,
      rgba(245, 244, 240, 0.08) 0,
      rgba(245, 244, 240, 0.08) 1px,
      transparent 1px,
      transparent 4.4rem
    );
}

.delete-modal__panel {
  position: relative;
  width: min(100%, 30rem);
  border: 1px solid var(--subtle);
  border-top: 2px solid var(--accent);
  background: var(--body-bg);
  padding: 1.15rem;
  box-shadow: 0 2rem 5rem rgba(0, 0, 0, 0.28);
}

.delete-modal__mark {
  display: flex;
  align-items: flex-end;
  gap: 0.22rem;
  height: 1.6rem;
  margin-bottom: 1.2rem;
}

.delete-modal__mark span {
  display: block;
  width: 0.32rem;
  height: 0.65rem;
  background: var(--accent);
  transform-origin: bottom;
  animation: deletePulse 0.85s ease-in-out infinite;
}

.delete-modal__mark span:nth-child(2) {
  animation-delay: 0.12s;
}

.delete-modal__mark span:nth-child(3) {
  animation-delay: 0.24s;
}

.delete-modal__kicker {
  margin-bottom: 0.45rem;
  color: var(--accent);
  font-size: 0.5rem;
  letter-spacing: 0.18em;
  text-transform: uppercase;
}

.delete-modal h2 {
  font-family: var(--font-serif);
  font-size: clamp(2rem, 5vw, 3.5rem);
  font-weight: 200;
  line-height: 0.95;
  color: var(--dark);
}

.delete-modal__copy {
  max-width: 24rem;
  margin-top: 0.85rem;
  color: var(--muted);
  font-size: 0.76rem;
  line-height: 1.65;
}

.delete-modal__warning {
  margin-top: 1.05rem;
  border: 2px solid #b0243c;
  border-top-width: 0.45rem;
  background:
    linear-gradient(90deg, rgba(176, 36, 60, 0.1), rgba(176, 36, 60, 0.02)),
    var(--body-bg);
  padding: 0.9rem;
  color: #8f1c30;
}

.delete-modal__warning p {
  margin: 0;
  font-family: var(--font-sans);
  font-size: clamp(1.15rem, 5vw, 2.35rem);
  font-weight: 800;
  letter-spacing: 0.08em;
  line-height: 0.95;
  text-transform: uppercase;
}

.delete-modal__warning ul {
  display: grid;
  gap: 0.42rem;
  margin: 0.85rem 0 0;
  padding: 0;
  list-style: none;
}

.delete-modal__warning li {
  position: relative;
  padding-left: 1rem;
  color: var(--dark);
  font-size: 0.72rem;
  line-height: 1.45;
}

.delete-modal__warning li::before {
  content: "";
  position: absolute;
  left: 0;
  top: 0.58em;
  width: 0.42rem;
  height: 2px;
  background: #b0243c;
}

.delete-modal__field {
  display: grid;
  gap: 0.45rem;
  margin-top: 1rem;
}

.delete-modal__field span {
  color: var(--muted);
  font-family: var(--font-sans);
  font-size: 0.52rem;
  letter-spacing: 0.16em;
  text-transform: uppercase;
}

.delete-modal__field input {
  width: 100%;
  border: 1px solid var(--subtle);
  background: #fff;
  padding: 0.7rem 0.8rem;
  color: var(--dark);
  font-family: var(--font-sans);
  font-size: 0.9rem;
  outline: none;
}

.delete-modal__field input:focus {
  border-color: var(--accent);
}

.delete-modal__field-error {
  margin-top: 0.6rem;
  color: #b0243c;
  font-size: 0.68rem;
  line-height: 1.45;
}

.delete-modal__meter {
  height: 0.42rem;
  margin-top: 1.35rem;
  background: var(--paper);
  overflow: hidden;
}

.delete-modal__meter span {
  display: block;
  width: 100%;
  height: 100%;
  background: var(--accent);
  transform: scaleX(0);
  transform-origin: left;
  transition: transform 0.2s ease-out;
}

.delete-modal__meta {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  margin-top: 0.55rem;
  color: var(--muted);
  font-size: 0.58rem;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}

.delete-modal__meta strong {
  color: var(--dark);
  font-weight: 500;
}

.delete-modal__current {
  margin-top: 1rem;
  border-top: 1px solid var(--subtle);
  padding-top: 0.75rem;
  color: var(--dark);
  font-size: 0.66rem;
  line-height: 1.5;
  overflow-wrap: anywhere;
}

.delete-modal__notes {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  margin-top: 0.7rem;
}

.delete-modal__notes span {
  border: 1px solid var(--subtle);
  padding: 0.28rem 0.45rem;
  color: #b0243c;
  font-size: 0.5rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.delete-modal__pause {
  margin-top: 0.7rem;
  border: 1px solid color-mix(in srgb, #b0243c 28%, var(--subtle));
  padding: 0.38rem 0.52rem;
  font-family: var(--font-sans);
  font-size: 0.5rem;
  letter-spacing: 0.1em;
  line-height: 1.35;
  text-transform: uppercase;
  color: #8f1c30;
  background: color-mix(in srgb, #b0243c 5%, var(--body-bg));
}

.delete-modal__actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.65rem;
  margin-top: 1.25rem;
  border-top: 1px solid var(--subtle);
  padding-top: 0.85rem;
}

.delete-modal__actions button {
  border: 1px solid var(--subtle);
  padding: 0.55rem 0.9rem;
  font-family: var(--font-sans);
  font-size: 0.52rem;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  cursor: pointer;
}

.delete-modal__cancel {
  background: transparent;
  color: var(--dark);
}

.delete-modal__cancel:hover {
  border-color: var(--accent);
  color: var(--accent);
}

.delete-modal__danger {
  border-color: #b0243c !important;
  background: #b0243c;
  color: #F5F4F0;
}

.delete-modal__danger:hover {
  border-color: #8f1c30 !important;
  background: #8f1c30;
}

.delete-modal__danger:disabled {
  opacity: 0.55;
  cursor: not-allowed;
  background: #b0243c;
  border-color: #b0243c !important;
}

.delete-modal-enter-active,
.delete-modal-leave-active {
  transition: opacity 0.2s ease;
}

.delete-modal-enter-active .delete-modal__panel,
.delete-modal-leave-active .delete-modal__panel {
  transition: transform 0.2s ease, opacity 0.2s ease;
}

.delete-modal-enter-from,
.delete-modal-leave-to {
  opacity: 0;
}

.delete-modal-enter-from .delete-modal__panel,
.delete-modal-leave-to .delete-modal__panel {
  opacity: 0;
  transform: translateY(0.5rem);
}

@keyframes deletePulse {
  0%, 100% { transform: scaleY(0.45); opacity: 0.55; }
  50% { transform: scaleY(1); opacity: 1; }
}

.r2 {
  max-width: 1180px;
  margin: 0 auto;
  padding: 3rem 2rem 5rem;
  display: grid;
  gap: 1.4rem;
}

.r2__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1.5rem;
}

.r2__kicker {
  margin-bottom: 0.7rem;
  color: var(--accent);
  font-size: 0.54rem;
  letter-spacing: 0.2em;
  text-transform: uppercase;
}

.r2__title {
  font-family: var(--font-serif);
  font-size: clamp(3rem, 7vw, 6rem);
  line-height: 0.95;
  font-weight: 200;
  color: var(--dark);
}

.r2__lead {
  max-width: 560px;
  margin-top: 0.9rem;
  color: var(--muted);
  font-size: 0.78rem;
  line-height: 1.7;
}

.r2__refresh {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  border: 1px solid var(--dark);
  background: var(--dark);
  color: #F5F4F0;
  padding: 0.65rem 1rem;
  font-family: var(--font-sans);
  font-size: 0.52rem;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  cursor: pointer;
}
.r2__refresh:hover { border-color: var(--accent); background: var(--accent); }
.r2__refresh:disabled { opacity: 0.55; cursor: wait; }
.r2__refresh svg { width: 1rem; height: 1rem; }

.r2__tabs {
  display: flex;
  border-bottom: 1px solid var(--subtle);
}
.r2__tabs button {
  position: relative;
  border: none;
  background: none;
  color: var(--muted);
  padding: 0.6rem 0.2rem;
  margin-right: 1.6rem;
  font-family: var(--font-sans);
  font-size: 0.58rem;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
}
.r2__tabs button:hover { color: var(--dark); }
.r2__tabs button.is-active { color: var(--accent); }
.r2__tabs button.is-active::after {
  content: '';
  position: absolute;
  left: 0; right: 0; bottom: -1px;
  height: 2px;
  background: var(--accent);
}
.r2__tab-count {
  min-width: 1.2rem;
  padding: 0 0.32rem;
  border: 1px solid currentColor;
  border-radius: 999px;
  font-size: 0.5rem;
  line-height: 1.35;
  text-align: center;
}
.r2__trash-note { max-width: 720px; margin-top: 0; }

.r2__bulk-restore {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  border: 1px solid var(--dark);
  background: none;
  color: var(--dark);
  padding: 0.5rem 0.9rem;
  font-family: var(--font-sans);
  font-size: 0.56rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  cursor: pointer;
}
.r2__bulk-restore:hover { border-color: var(--accent); color: var(--accent); }
.r2__bulk-restore:disabled { opacity: 0.55; cursor: wait; }
.r2__bulk-restore svg { width: 0.85rem; height: 0.85rem; }

.image-row__trash-actions {
  display: inline-flex;
  gap: 0.4rem;
  flex-shrink: 0;
}
.image-row__restore {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  border: 1px solid var(--subtle);
  background: none;
  color: var(--dark);
  padding: 0.35rem 0.6rem;
  font-family: var(--font-sans);
  font-size: 0.5rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  cursor: pointer;
  transition: border-color 0.2s, color 0.2s;
}
.image-row__restore:hover { border-color: var(--accent); color: var(--accent); }
.image-row__restore:disabled { opacity: 0.55; cursor: wait; }
.image-row__restore svg { width: 0.8rem; height: 0.8rem; }

.r2__stats {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  border-top: 1px solid var(--subtle);
  border-bottom: 1px solid var(--subtle);
}

.r2__stats div {
  padding: 1.1rem 1.2rem 1.2rem;
  border-left: 1px solid var(--subtle);
}
.r2__stats div:first-child { border-left: 0; padding-left: 0; }
.r2__stats strong {
  display: block;
  font-family: var(--font-serif);
  font-size: 2.8rem;
  line-height: 0.9;
  font-weight: 200;
  color: var(--dark);
}
.r2__stats span {
  display: block;
  margin-top: 0.45rem;
  color: var(--muted);
  font-size: 0.55rem;
  letter-spacing: 0.16em;
  text-transform: uppercase;
}

.r2__tools {
  display: grid;
  gap: 0.8rem;
  padding: 1rem 0;
  border-bottom: 1px solid var(--subtle);
}

.r2__prefix,
.r2__filters {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  flex-wrap: wrap;
}

.r2__prefix label {
  font-size: 0.52rem;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--muted);
}

.r2__prefix input,
.r2__filters input,
.r2__filters select {
  min-height: 2.35rem;
  border: 1px solid var(--subtle);
  background: color-mix(in srgb, var(--body-bg) 60%, white);
  color: var(--dark);
  padding: 0 0.75rem;
  font-family: var(--font-sans);
  font-size: 0.72rem;
}
.r2__prefix input,
.r2__filters input { min-width: min(28rem, 100%); flex: 1; }
.r2__filters select { min-width: 15rem; }

.r2__prefix button,
.r2__chips button {
  min-height: 2.35rem;
  border: 1px solid var(--subtle);
  background: none;
  color: var(--dark);
  padding: 0 0.85rem;
  font-family: var(--font-sans);
  font-size: 0.5rem;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  cursor: pointer;
}
.r2__prefix button:hover,
.r2__chips button:hover { border-color: var(--accent); color: var(--accent); }

.r2__chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.45rem;
}

.r2__error,
.r2__empty {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.7rem;
  min-height: 12rem;
  border: 1px solid var(--subtle);
  background: var(--paper);
  color: var(--muted);
  font-size: 0.78rem;
}
.r2__error { color: #b0243c; }

.r2__sync {
  margin: -0.5rem 0 1rem;
  color: var(--muted);
  font-size: 0.72rem;
  letter-spacing: 0.04em;
}
.r2__sync--warn { color: #b0243c; }

.r2__bulk {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 0.75rem;
  padding: 0.2rem 0;
}

.r2__select-all {
  display: inline-flex;
  align-items: center;
  gap: 0.55rem;
  color: var(--muted);
  font-size: 0.6rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  cursor: pointer;
}
.r2__select-all input,
.image-row__check input {
  position: absolute;
  inline-size: 1px;
  block-size: 1px;
  opacity: 0;
  pointer-events: none;
}
.r2__select-box {
  position: relative;
  width: 1.05rem;
  height: 1.05rem;
  flex: 0 0 auto;
  border: 1px solid var(--subtle);
  background: color-mix(in srgb, var(--body-bg) 70%, white);
}
.r2__select-box::after {
  content: '';
  position: absolute;
  inset: 0.25rem;
  background: transparent;
}
.r2__select-all:hover .r2__select-box {
  border-color: var(--accent);
}
.r2__select-all:has(input:disabled) {
  cursor: wait;
  opacity: 0.55;
}
.r2__select-all input:focus-visible + .r2__select-box {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
.r2__select-all input:checked + .r2__select-box {
  border-color: var(--accent);
  background: var(--accent);
}
.r2__select-all input:checked + .r2__select-box::after {
  background: #F5F4F0;
}

.r2__bulk-actions {
  display: inline-flex;
  align-items: center;
  gap: 0.75rem;
  font-size: 0.68rem;
  color: var(--dark);
}

.r2__bulk-clear {
  border: none;
  background: none;
  color: var(--muted);
  text-decoration: underline;
  font-size: 0.62rem;
  cursor: pointer;
}
.r2__bulk-clear:hover { color: var(--dark); }
.r2__bulk-clear:disabled { opacity: 0.55; cursor: wait; }

.r2__bulk-delete {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  border: 1px solid #b0243c;
  background: #b0243c;
  color: #F5F4F0;
  padding: 0.5rem 0.9rem;
  font-family: var(--font-sans);
  font-size: 0.56rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  cursor: pointer;
}
.r2__bulk-delete:hover { background: #8f1c30; border-color: #8f1c30; }
.r2__bulk-delete:disabled { opacity: 0.55; cursor: wait; }
.r2__bulk-delete svg { width: 0.85rem; height: 0.85rem; }

.r2__list {
  display: grid;
  gap: 1px;
  background: var(--subtle);
  border: 1px solid var(--subtle);
  user-select: none;
}

.r2__pagination {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 1rem;
  padding: 1rem 0 0.2rem;
}

.r2__page-size {
  display: inline-flex;
  align-items: center;
  gap: 0.55rem;
  color: var(--muted);
  font-size: 0.6rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.r2__page-size select {
  min-height: 2.1rem;
  border: 1px solid var(--subtle);
  background: color-mix(in srgb, var(--body-bg) 60%, white);
  color: var(--dark);
  padding: 0 0.6rem;
  font-family: var(--font-sans);
  font-size: 0.72rem;
}

.r2__page-nav {
  display: inline-flex;
  align-items: center;
  gap: 1.25rem;
  color: var(--muted);
  font-size: 0.62rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.r2__page-nav button {
  border: none;
  background: none;
  color: var(--dark);
  font-family: var(--font-sans);
  font-size: 0.62rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  cursor: pointer;
  transition: color 0.15s;
}
.r2__page-nav button:hover:not(:disabled) { color: var(--accent); }
.r2__page-nav button:disabled { opacity: 0.4; cursor: default; }

.image-row {
  display: grid;
  grid-template-columns: 13rem minmax(0, 1fr);
  background: var(--body-bg);
  position: relative;
  transition: background 0.15s;
}

.image-row__thumb {
  position: relative;
  display: block;
  aspect-ratio: 4 / 3;
  overflow: hidden;
  background: var(--paper);
}
.image-row__thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
  transition: opacity 0.15s, transform 0.15s;
}
.image-row__check {
  position: absolute;
  top: 0.55rem;
  left: 0.55rem;
  z-index: 2;
  display: grid;
  place-items: center;
  width: 1.65rem;
  height: 1.65rem;
  cursor: pointer;
}
.image-row__check-box {
  display: grid;
  place-items: center;
  width: 100%;
  height: 100%;
  border: 1px solid rgba(245, 244, 240, 0.78);
  background: rgba(12, 12, 10, 0.56);
  color: #F5F4F0;
  font-family: var(--font-sans);
  font-size: 0.58rem;
  font-weight: 600;
  line-height: 1;
  backdrop-filter: blur(4px);
  transition: background 0.15s, border-color 0.15s, color 0.15s;
}
.image-row__check:hover .image-row__check-box {
  border-color: #F5F4F0;
  background: rgba(12, 12, 10, 0.72);
}
.image-row__check input:focus-visible + .image-row__check-box {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
.image-row.is-selected {
  background: color-mix(in srgb, var(--accent) 5%, var(--body-bg));
  outline: 2.5px solid var(--accent);
  outline-offset: -2px;
}
.image-row.is-selected .image-row__thumb::after {
  content: '';
  position: absolute;
  inset: 0;
  border: 2.5px solid var(--accent);
  pointer-events: none;
}
.image-row.is-selected .image-row__thumb img {
  opacity: 0.62;
}
.image-row.is-selected .image-row__check-box {
  border-color: var(--accent);
  background: var(--accent);
  color: #fff;
}

.image-row__body {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(18rem, 0.8fr);
  gap: 1.2rem;
  padding: 1rem;
  min-width: 0;
}

.image-row__main,
.image-row__refs {
  min-width: 0;
}

.image-row__title {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.75rem;
  margin-bottom: 0.9rem;
}

.image-row__main h2 {
  color: var(--dark);
  font-family: var(--font-sans);
  font-size: 0.82rem;
  font-weight: 500;
  line-height: 1.45;
  overflow-wrap: anywhere;
}

.image-row__delete {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  flex-shrink: 0;
  border: 1px solid var(--subtle);
  background: none;
  color: #b0243c;
  padding: 0.35rem 0.6rem;
  font-family: var(--font-sans);
  font-size: 0.5rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  cursor: pointer;
  transition: border-color 0.2s, background 0.2s;
}
.image-row__delete:hover { border-color: #b0243c; background: color-mix(in srgb, #b0243c 8%, transparent); }
.image-row__delete:disabled { opacity: 0.55; cursor: wait; }
.image-row__delete svg { width: 0.8rem; height: 0.8rem; }

.image-row__main dl {
  display: flex;
  flex-wrap: wrap;
  gap: 0.8rem 1.3rem;
  margin: 0;
}
.image-row__main div { min-width: 5.5rem; }
.image-row__main dt,
.image-row__refs p {
  margin-bottom: 0.25rem;
  color: var(--muted);
  font-size: 0.48rem;
  letter-spacing: 0.16em;
  text-transform: uppercase;
}
.image-row__main dd {
  margin: 0;
  color: var(--dark);
  font-size: 0.68rem;
}

.image-row__refs {
  display: grid;
  gap: 0.8rem;
  align-content: start;
}

.image-row__links {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
}
.image-row__links a,
.image-row__none {
  display: inline-flex;
  max-width: 100%;
  border: 1px solid var(--subtle);
  padding: 0.35rem 0.5rem;
  color: var(--dark);
  text-decoration: none;
  font-size: 0.62rem;
  line-height: 1.35;
  overflow-wrap: anywhere;
}
.image-row__links a:hover { border-color: var(--accent); color: var(--accent); }
.image-row__none { color: var(--muted); }

@media (max-width: 900px) {
  .r2 { padding: 2rem 1.25rem 4rem; }
  .r2__head { flex-direction: column; }
  .r2__stats { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .r2__stats div:nth-child(odd) { border-left: 0; padding-left: 0; }
  .image-row,
  .image-row__body { grid-template-columns: 1fr; }
  .image-row__thumb { aspect-ratio: 16 / 9; }
}

@media (max-width: 560px) {
  .r2__stats { grid-template-columns: 1fr; }
  .r2__stats div {
    border-left: 0;
    border-top: 1px solid var(--subtle);
    padding-left: 0;
  }
  .r2__stats div:first-child { border-top: 0; }
  .r2__prefix input,
  .r2__filters input,
  .r2__filters select { min-width: 100%; }
}
</style>
