// Live AP for the Basic Control & One Day Trip pages. Re-syncs from the sheet
// at most once a minute (see server/utils/onedaySheet.ts).
//
// `?ssr=1` is the page's server render (useOnedayAp). It only reads the stored
// copy: fetching and parsing the sheet on top of a full SSR is what pushes a
// request past the free plan's CPU limit (Error 1102). The browsers' 30 s
// polls keep the copy fresh instead.
export default defineEventHandler(async (event) => {
  setHeader(event, 'Cache-Control', 'no-store')
  return getOnedayAp({ sync: getQuery(event).ssr !== '1' })
})
