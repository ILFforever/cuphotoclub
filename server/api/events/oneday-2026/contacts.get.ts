// Staff phone numbers for the contacts page, from the sheet's จัดกลุ่ม tab
// (server/utils/onedaySheet.ts). `?ssr=1` is the page's server render: read
// the stored copy only, same reason as the ap route.
export default defineEventHandler(async (event) => {
  setHeader(event, 'Cache-Control', 'no-store')
  return getOnedayContacts({ sync: getQuery(event).ssr !== '1' })
})
