import { eq } from 'drizzle-orm'

// Locales configured in nuxt.config i18n. `en` is the default locale and is
// served without a path prefix; `th` lives under /th (strategy:
// prefix_except_default). Keep this in sync with nuxt.config.
const LOCALES = ['en', 'th'] as const
const DEFAULT_LOCALE = 'en'

function xmlEscape(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

// Absolute, locale-aware URL for a path. Slugs may contain Thai characters
// (album/event slugs), so each path segment is percent-encoded to stay valid.
function buildUrl(base: string, locale: string, path: string): string {
  const prefix = locale === DEFAULT_LOCALE ? '' : `/${locale}`
  const segments = path.split('/').filter(Boolean).map(encodeURIComponent)
  const rel = segments.length ? `/${segments.join('/')}` : ''
  if (!rel) return prefix ? `${base}${prefix}` : `${base}/`
  return `${base}${prefix}${rel}`
}

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()
  const base = (config.public.siteUrl || getRequestURL(event).origin).replace(/\/+$/, '')

  const [albums, eventRows] = await Promise.all([
    // Slugs only — no reason to pull every album's `rows` JSON to build a URL list.
    albumStore.listMeta({ visibility: ['public'] }),
    db.select({ slug: schema.events.slug })
      .from(schema.events)
      .where(eq(schema.events.status, 'published'))
  ])

  const albumSlugs = albums.items.map(a => decodeRouteSegment(a.slug))
  const eventSlugs = eventRows.map(e => e.slug)

  const paths = [
    '/',
    '/albums',
    '/events',
    '/activities',
    '/about',
    '/contacts',
    '/developed-by',
    '/members',
    ...albumSlugs.map(slug => `/albums/${slug}`),
    ...eventSlugs.map(slug => `/activities/${slug}`)
  ]

  const urls = paths.map((path) => {
    // hreflang alternates shared by every locale variant of this path.
    const alternates = [
      ...LOCALES.map(locale => `    <xhtml:link rel="alternate" hreflang="${locale}" href="${xmlEscape(buildUrl(base, locale, path))}"/>`),
      `    <xhtml:link rel="alternate" hreflang="x-default" href="${xmlEscape(buildUrl(base, DEFAULT_LOCALE, path))}"/>`
    ].join('\n')

    // One <url> entry per locale, each carrying the full alternate set.
    return LOCALES.map(locale => `  <url>
    <loc>${xmlEscape(buildUrl(base, locale, path))}</loc>
${alternates}
  </url>`).join('\n')
  }).join('\n')

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${urls}
</urlset>`

  setHeader(event, 'content-type', 'application/xml; charset=utf-8')
  return xml
})
