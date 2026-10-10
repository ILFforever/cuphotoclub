// Sync status for the unlisted sync page.
export default defineEventHandler(async (event) => {
  setHeader(event, 'Cache-Control', 'no-store')
  return getOnedaySyncStatus()
})
