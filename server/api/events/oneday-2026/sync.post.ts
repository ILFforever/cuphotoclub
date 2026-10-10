// "Sync now" — open to anyone with the link; it only re-reads the sheet, and
// syncOnedayNow() refuses to fetch more than once every 10 seconds.
export default defineEventHandler(async (event) => {
  setHeader(event, 'Cache-Control', 'no-store')
  return syncOnedayNow()
})
