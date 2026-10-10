// Live AP for the Basic Control & One Day Trip pages. Re-syncs from the sheet
// at most once a minute (see server/utils/onedaySheet.ts).
export default defineEventHandler(async (event) => {
  setHeader(event, 'Cache-Control', 'no-store')
  return getOnedayAp()
})
