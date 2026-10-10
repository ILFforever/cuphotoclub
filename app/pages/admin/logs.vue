<script setup lang="ts">
definePageMeta({ layout: 'admin', middleware: ['admin', 'admin-manage'] })
useHead({ title: 'Admin Logs' })

interface AuditLog {
  id: number
  actorId: number | null
  actorEmail: string
  actorName: string | null
  action: string
  entityType: string
  entityId: string
  entityTitle: string | null
  metadata: Record<string, unknown>
  createdAt: string
}

interface AuditLogsResponse {
  logs: AuditLog[]
  page: number
  pageSize: number
  total: number
}

interface LogGroup {
  id: string
  logs: AuditLog[]
  first: AuditLog
  count: number
  title: string
  meta: string
}

const page = ref(1)
const pageSize = ref(50)
const pageSizeOptions = [25, 50, 100] as const

const { data, pending } = await useFetch<AuditLogsResponse>('/api/admin/logs', {
  query: { page, pageSize },
  watch: [page, pageSize]
})

const logs = computed(() => data.value?.logs ?? [])
const total = computed(() => data.value?.total ?? 0)
const totalPages = computed(() => Math.max(1, Math.ceil(total.value / pageSize.value)))
const pageStart = computed(() => total.value ? (page.value - 1) * pageSize.value + 1 : 0)
const pageEnd = computed(() => Math.min(total.value, page.value * pageSize.value))

const actionLabels: Record<string, string> = {
  bootstrap: 'Bootstrapped',
  create: 'Created',
  update: 'Updated',
  delete: 'Deleted',
  login: 'Logged in'
}

watch(pageSize, () => { page.value = 1 })
watch(totalPages, (next) => {
  if (page.value > next) page.value = next
})

function actorLabel(log: AuditLog) {
  return log.actorName || log.actorEmail
}

function targetLabel(log: AuditLog) {
  return log.entityTitle || log.entityId
}

function metadataText(log: AuditLog) {
  if (!log.metadata || !Object.keys(log.metadata).length) return ''
  return JSON.stringify(log.metadata, null, 2)
}

function logTime(log: AuditLog) {
  return new Date(log.createdAt).getTime()
}

function logMinute(log: AuditLog) {
  const time = logTime(log)
  return Number.isFinite(time) ? Math.floor(time / 60000) : 0
}

function metadataPrefix(log: AuditLog) {
  const prefix = log.metadata?.prefix
  if (typeof prefix === 'string' && prefix.trim()) return prefix
  const separatorIndex = log.entityId.lastIndexOf('/')
  return separatorIndex > -1 ? log.entityId.slice(0, separatorIndex) : ''
}

function groupKey(log: AuditLog) {
  return [
    logMinute(log),
    log.actorEmail,
    log.action,
    log.entityType,
    metadataPrefix(log) || log.entityId
  ].join('|')
}

function groupTitle(group: LogGroup) {
  const label = actionLabels[group.first.action] || group.first.action
  return group.count > 1 ? `${label} ${group.count} ${group.first.entityType} items` : label
}

function groupMeta(group: LogGroup) {
  if (group.count === 1) return `${group.first.entityType} · ${group.first.entityId}`
  const prefix = metadataPrefix(group.first)
  return prefix ? `${group.first.entityType} · ${prefix}` : group.first.entityType
}

const groupedLogs = computed<LogGroup[]>(() => {
  const groups: LogGroup[] = []
  const map = new Map<string, LogGroup>()

  for (const log of logs.value) {
    const key = groupKey(log)
    const existing = map.get(key)
    if (existing) {
      existing.logs.push(log)
      existing.count += 1
      existing.title = groupTitle(existing)
      existing.meta = groupMeta(existing)
      continue
    }

    const group: LogGroup = {
      id: key,
      logs: [log],
      first: log,
      count: 1,
      title: '',
      meta: ''
    }
    group.title = groupTitle(group)
    group.meta = groupMeta(group)
    map.set(key, group)
    groups.push(group)
  }

  return groups
})

function groupDetailsText(group: LogGroup) {
  return group.logs
    .map((log) => {
      const metadata = metadataText(log)
      const lines = [
        `${formatDateTime(log.createdAt)} · ${targetLabel(log)}`,
        `${log.entityType} · ${log.entityId}`
      ]
      if (metadata) lines.push(metadata)
      return lines.join('\n')
    })
    .join('\n\n')
}

function goToPage(nextPage: number) {
  page.value = Math.min(Math.max(1, nextPage), totalPages.value)
}
</script>

<template>
  <div class="admin-wrap">
    <div class="page-head">
      <div>
        <NuxtLink to="/admin" class="back">Dashboard</NuxtLink>
        <h1>Admin Logs</h1>
        <p class="sub">Audit trail for admin accounts and content changes.</p>
      </div>
    </div>

    <div class="log-table">
      <div class="log-toolbar">
        <p>{{ total }} log{{ total === 1 ? '' : 's' }}<span v-if="total"> · Showing {{ pageStart }}-{{ pageEnd }}</span></p>
        <label>
          <span>Per page</span>
          <select v-model.number="pageSize">
            <option v-for="size in pageSizeOptions" :key="size" :value="size">{{ size }}</option>
          </select>
        </label>
      </div>

      <table v-if="groupedLogs.length" class="tbl">
        <thead>
          <tr>
            <th>Time</th>
            <th>Admin</th>
            <th>Action</th>
            <th>Target</th>
            <th>Details</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="group in groupedLogs" :key="group.id">
            <td class="muted">
              {{ formatDateTime(group.first.createdAt) }}
              <span v-if="group.count > 1" class="group-count">{{ group.count }} logs</span>
            </td>
            <td>
              <strong>{{ actorLabel(group.first) }}</strong>
              <span>{{ group.first.actorEmail }}</span>
            </td>
            <td><span class="pill" :class="`pill--${group.first.action}`">{{ group.title }}</span></td>
            <td>
              <strong>{{ group.count > 1 ? `${group.count} items` : targetLabel(group.first) }}</strong>
              <span>{{ group.meta }}</span>
            </td>
            <td>
              <details v-if="group.count > 1 || metadataText(group.first)" class="details">
                <summary>{{ group.count > 1 ? `View ${group.count}` : 'View' }}</summary>
                <pre>{{ groupDetailsText(group) }}</pre>
              </details>
              <span v-else class="muted">None</span>
            </td>
          </tr>
        </tbody>
      </table>

      <p v-else-if="pending" class="empty">Loading logs...</p>
      <p v-else class="empty">No admin actions have been logged yet.</p>

      <div v-if="totalPages > 1" class="pager">
        <button type="button" :disabled="page === 1 || pending" @click="goToPage(page - 1)">Previous</button>
        <span>Page {{ page }} of {{ totalPages }}</span>
        <button type="button" :disabled="page === totalPages || pending" @click="goToPage(page + 1)">Next</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.admin-wrap { max-width: 1120px; margin: 0 auto; padding: 3rem 2rem 5rem; }
.page-head { display: flex; align-items: flex-end; justify-content: space-between; margin-bottom: 2.5rem; gap: 1.5rem; }
.page-head h1 { font-family: var(--font-serif); font-size: 2.5rem; font-weight: 200; margin-top: 0.5rem; }
.back { display: inline-block; font-size: 0.58rem; letter-spacing: 0.18em; text-transform: uppercase; color: var(--muted); text-decoration: none; }
.back:hover { color: var(--accent); }
.sub { font-size: 0.78rem; line-height: 1.7; color: var(--muted); margin-top: 0.35rem; }
.log-table { border-top: 1px solid var(--subtle); overflow-x: auto; }
.log-toolbar { display: flex; align-items: center; justify-content: space-between; gap: 1rem; padding: 0.85rem 0.75rem; border-bottom: 1px solid var(--subtle); }
.log-toolbar p { margin: 0; color: var(--muted); font-size: 0.68rem; }
.log-toolbar label { display: inline-flex; align-items: center; gap: 0.6rem; color: var(--muted); font-size: 0.54rem; letter-spacing: 0.16em; text-transform: uppercase; }
.log-toolbar select { border: 1px solid var(--subtle); background: transparent; color: var(--dark); padding: 0.38rem 0.55rem; font: inherit; letter-spacing: 0; text-transform: none; }
.tbl { width: 100%; border-collapse: collapse; font-size: 0.82rem; }
.tbl th { text-align: left; font-size: 0.5rem; letter-spacing: 0.2em; text-transform: uppercase; color: var(--muted); font-weight: 500; padding: 0.85rem 0.75rem; border-bottom: 1px solid var(--subtle); }
.tbl td { padding: 0.95rem 0.75rem; border-bottom: 1px solid var(--subtle); vertical-align: top; min-width: 140px; }
.tbl td strong { display: block; font-weight: 500; color: var(--dark); margin-bottom: 0.2rem; }
.tbl td span { display: block; color: var(--muted); font-size: 0.68rem; }
.muted { color: var(--muted); }
.group-count { margin-top: 0.22rem; font-size: 0.56rem; letter-spacing: 0.12em; text-transform: uppercase; }
.pill { display: inline-block; border: 1px solid var(--dark); background: var(--dark); padding: 0.24rem 0.5rem; color: #F5F4F0; font-size: 0.56rem; letter-spacing: 0.12em; text-transform: uppercase; }
.pill--bootstrap { border-color: #5c5144; background: #5c5144; color: #F5F4F0; }
.pill--create { border-color: var(--accent); background: var(--accent); color: #F5F4F0; }
.pill--update { border-color: #2f55b7; background: #2f55b7; color: #F5F4F0; }
.pill--delete { border-color: #a51631; background: #a51631; color: #F5F4F0; }
.pill--login { border-color: #17684f; background: #17684f; color: #F5F4F0; }
.details summary { cursor: pointer; color: var(--dark); font-size: 0.62rem; letter-spacing: 0.14em; text-transform: uppercase; }
.details summary:hover { color: var(--accent); }
.details pre { margin-top: 0.75rem; max-width: 360px; max-height: 180px; overflow: auto; background: var(--paper); border: 1px solid var(--subtle); padding: 0.75rem; color: var(--dark); font-size: 0.72rem; line-height: 1.5; white-space: pre-wrap; }
.empty { color: var(--muted); font-size: 0.9rem; padding: 2rem 0; }
.pager { display: flex; align-items: center; justify-content: flex-end; gap: 1rem; padding: 1rem 0.75rem 0; }
.pager span { color: var(--muted); font-size: 0.62rem; letter-spacing: 0.12em; text-transform: uppercase; }
.pager button { border: 0; background: none; color: var(--dark); cursor: pointer; font-size: 0.58rem; letter-spacing: 0.16em; text-transform: uppercase; padding: 0.35rem 0; }
.pager button:hover:not(:disabled) { color: var(--accent); }
.pager button:disabled { cursor: default; opacity: 0.38; }
@media (max-width: 720px) {
  .admin-wrap { padding: 2rem 1rem 4rem; }
  .log-toolbar,
  .pager { align-items: flex-start; flex-direction: column; }
}
</style>
