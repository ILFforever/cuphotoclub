import tailwindcss from '@tailwindcss/vite'

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  // Disabled in dev: the DevTools inspector adds per-navigation RPC overhead.
  // Re-enable temporarily if you need to inspect the component tree / payload.
  devtools: { enabled: false },

  modules: [
    '@nuxt/image',
    '@nuxt/fonts',
    '@nuxt/icon',
    '@nuxt/content',
    '@nuxt/eslint',
    '@nuxthub/core',
    '@nuxtjs/i18n',
    'nuxt-auth-utils'
  ],

  css: ['~/assets/css/main.css'],

  vite: {
    plugins: [tailwindcss()],
    optimizeDeps: {
      include: []
    }
  },

  // NuxtHub: sqlite (libsql driver, local file in dev) + R2 blob + KV.
  // Schema lives in server/db/schema.ts; migrations in server/db/migrations/sqlite.
  hub: {
    db: { dialect: 'sqlite', applyMigrationsDuringDev: true },
    blob: true,
    kv: true,
    // swr route-rule cache is intentionally NOT KV-backed. Backing it with the
    // CACHE KV namespace meant every cache miss wrote the rendered page to KV;
    // on the free plan (1,000 KV writes/day) that quota was exhausted daily, and
    // once KV refused writes an unhandled `put()` in the render path 500'd every
    // swr-cached public page site-wide (the /api/* and Thai routes, which aren't
    // swr-cached, stayed up). With `cache: false` swr falls back to per-isolate
    // in-memory caching: no KV writes, so the quota can't be hit, while still
    // giving the burst protection that fixes Error 1102. Trade-off: the cache is
    // per-isolate (not shared) and admin edits can take up to the swr TTL to
    // appear on every isolate. Re-enable only on Workers Paid (1M writes/day).
    cache: false
  },

  nitro: {
    serverAssets: [
      { baseName: 'content-albums', dir: '../content/albums' }
    ],
    prerender: {
      crawlLinks: false,
      routes: []
    }
  },

  routeRules: {
    // Sensible security headers site-wide; long-cache the image route.
    '/**': {
      headers: {
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'SAMEORIGIN',
        'Referrer-Policy': 'strict-origin-when-cross-origin'
      }
    },
    '/images/**': { headers: { 'Cache-Control': 'public, max-age=31536000, immutable' } },
    '/api/settings': { cache: { maxAge: 60 } },
    // photogrid reads every album's full rows JSON per request — without this
    // cache it can take 1–30s on cold isolates and leaves the Featured Work
    // wall blank while the client waits. 60s staleness is fine: the client
    // shuffles its sample anyway.
    '/api/photogrid': { cache: { maxAge: 60 } },

    // These public pages have no auth-dependent SSR (no page/component reads a
    // session), so serve them from an edge cache and revalidate in the
    // background. Without this, every visit runs a fresh SSR Function and a
    // traffic burst trips Cloudflare's per-request resource limit (Error 1102).
    // Admin routes and dynamic APIs above are intentionally left uncached.
    //
    // /contribute/** is deliberately ABSENT and must stay that way: its payload
    // carries a contributor's name, claim code and photo list, so an swr rule
    // there would cross-serve one participant's identity to the next visitor.
    '/': { swr: 120 },
    '/about': { swr: 300 },
    '/contacts': { swr: 300 },
    '/developed-by': { swr: 300 },
    '/members': { swr: 300 },
    '/members/**': { swr: 300 },
    '/albums': { swr: 120 },
    '/albums/**': { swr: 120 },
    '/activities': { swr: 120 },
    '/activities/**': { swr: 120 },
    '/events': { swr: 120 },
    // One Day Trip 2026 (temporary). Every participant opens these from the
    // LINE group at once, so uncached SSR tripped Error 1102 on event day.
    // Short TTL: the cached HTML's AP is only a first paint — useOnedayAp
    // refetches on mount and every 30 s. No session or cookie is read here.
    // Staff pages stay uncached: few visitors, and they show sync status.
    // Contacts gets a longer TTL: numbers rarely change, the page refetches
    // them on mount, and fewer refreshes mean fewer CACHE KV writes.
    '/events/oneday-2026': { swr: 30 },
    '/events/oneday-2026/live': { swr: 30 },
    '/events/oneday-2026/contacts': { swr: 120 },
    '/th/events/oneday-2026': { swr: 30 },
    '/th/events/oneday-2026/live': { swr: 30 },
    '/th/events/oneday-2026/contacts': { swr: 120 }
  },

  // Private (server-only) config.
  // Session secret comes from NUXT_SESSION_PASSWORD (nuxt-auth-utils).
  runtimeConfig: {
    // Google Sheet behind the temporary /events/oneday-2026 live AP
    // (server/utils/onedaySheet.ts). Server-only, from NUXT_ONEDAY_SHEET_ID —
    // the workbook also holds participant data, so the ID must never be
    // committed or moved under `public`.
    onedaySheetId: '',
    oauth: {
      google: { clientId: '', clientSecret: '' }
    },
    r2DirectUpload: {
      accountId: process.env.NUXT_R2_ACCOUNT_ID || '',
      bucketName: process.env.NUXT_R2_BUCKET_NAME || 'cuphotoclub-blob',
      accessKeyId: process.env.NUXT_R2_ACCESS_KEY_ID || '',
      secretAccessKey: process.env.NUXT_R2_SECRET_ACCESS_KEY || ''
    },
    session: {
      // Placeholder for the type only — the real secret always comes from
      // NUXT_SESSION_PASSWORD at runtime (nuxt-auth-utils).
      password: '',
      cookie: {
        secure: process.env.NODE_ENV === 'production'
      }
    },
    public: {
      realDataOnly: process.env.NUXT_PUBLIC_REAL_DATA_ONLY === 'false' || process.env.NUXT_REAL_DATA_ONLY === 'false'
        ? false
        : process.env.NODE_ENV === 'production'
          || process.env.NUXT_PUBLIC_REAL_DATA_ONLY === 'true'
          || process.env.NUXT_REAL_DATA_ONLY === 'true',
      siteUrl: process.env.NUXT_PUBLIC_SITE_URL || (process.env.NODE_ENV === 'production' ? 'https://cuphotoclub.com' : 'http://localhost:3000'),
      // Google Maps Embed API key for the contacts-page map. Public by design
      // (it ships in the iframe URL) — restrict it by HTTP referrer in Google
      // Cloud. Empty → contacts.vue falls back to the keyless embed.
      googleMapsEmbedKey: process.env.NUXT_PUBLIC_GOOGLE_MAPS_EMBED_KEY || '',
      // /cdn-cgi/image/ only exists behind the Cloudflare zone, never in dev.
      // Set NUXT_PUBLIC_IMAGE_TRANSFORMS=false to opt out in production.
      imageTransforms: process.env.NUXT_PUBLIC_IMAGE_TRANSFORMS === 'false'
        ? false
        : process.env.NODE_ENV === 'production'
    }
  },

  app: {
    head: {
      // <html lang> is set reactively per-locale in app.vue (useHead).
      // Fonts are self-hosted by @nuxt/fonts (see `fonts` below) — no external
      // Google Fonts <link> here, which would be a render-blocking duplicate.
      meta: [
        { charset: 'utf-8' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1' }
      ]
    }
  },

  // Editorial type pairing — @nuxt/fonts provisions these from Google automatically.
  //
  // Only the site's own faces are pinned here. The album picker's catalogue
  // (app/assets/css/album-fonts.css) is left to auto-resolution against
  // `defaults` below, so adding a face there needs no config change.
  fonts: {
    defaults: {
      // Album text renders at weight 200–300, so a light cut has to be
      // available or every face lands on regular.
      weights: [300, 400],
      // Italic doubles the download for faces that are only ever set upright.
      styles: ['normal'],
      // `thai` is NOT in @nuxt/fonts' default subset list — without it the Thai
      // families resolve to their Latin glyphs only and Thai text silently
      // falls back to the OS font. Cyrillic/Greek/Vietnamese/latin-ext are
      // dropped because the site is English/Thai — `latin` already carries the
      // accented characters (é, ü, ñ) that show up in names.
      subsets: ['latin', 'thai'],
      // One metric-matched fallback per generic instead of the stock three to
      // five. Every family in the album catalogue gets a size-adjusted
      // @font-face per entry here, and at ~50 families the default lists were
      // most of the album stylesheet — this trades a little cross-platform
      // reach in the anti-CLS shim for a much smaller CSS payload.
      fallbacks: {
        'serif': ['Georgia'],
        'sans-serif': ['Arial'],
        'monospace': ['Courier New'],
        'cursive': ['Arial']
      }
    },
    families: [
      { name: 'Spectral', provider: 'google', weights: [200, 300, 400, 500, 600], styles: ['normal', 'italic'] },
      { name: 'Inter', provider: 'google', weights: [300, 400, 500] },
      { name: 'Noto Serif Thai', provider: 'google', weights: [300, 400, 500, 600] },
      { name: 'Noto Sans Thai', provider: 'google', weights: [300, 400, 500, 600] },
      { name: 'IBM Plex Sans Thai Looped', provider: 'google', weights: [300, 400, 500, 600] },
      { name: 'Sarabun', provider: 'google', weights: [300, 400, 500, 600] },
      { name: 'Anuphan', provider: 'google', weights: [300, 400, 500, 600] },

      // System faces from the album picker: named so no provider goes looking
      // for them (Arial and Roboto do exist on Google Fonts — self-hosting
      // them would defeat the point of a system stack).
      { name: 'Arial', provider: 'none' },
      { name: 'Helvetica', provider: 'none' },
      { name: 'Georgia', provider: 'none' },
      { name: 'Times New Roman', provider: 'none' },
      { name: 'Consolas', provider: 'none' },
      { name: 'Menlo', provider: 'none' },
      { name: 'Tahoma', provider: 'none' },
      { name: 'Leelawadee UI', provider: 'none' },
      { name: 'Sukhumvit Set', provider: 'none' },
      { name: 'Thonburi', provider: 'none' },
      { name: 'Angsana New', provider: 'none' },
      { name: 'AngsanaUPC', provider: 'none' }
    ]
  },

  // picsum: design placeholders. localhost / prod: R2 blob images are served
  // via a server route (/images/**), not from public/, so IPX must HTTP-fetch them.
  // The `cloudflare` provider (used by AppImg for /images/** in production)
  // rewrites through /cdn-cgi/image/ — Cloudflare Image Transformations must be
  // enabled on the zone (dashboard → Images → Transformations).
  image: {
    domains: ['picsum.photos', 'localhost', 'cuphotoclub.com', 'www.cuphotoclub.com', 'cuphotoclub.pages.dev'],
    cloudflare: { baseURL: '/' },
    quality: 80,
    // @nuxt/image's default screens top out at 1536, named "2xl" — not "xxl".
    // Several components' `sizes` props were written with "xxl:" (and "xs:",
    // which was never a real key either), so those entries silently dropped:
    // no error, just a missing srcset candidate. Aliasing "xxl" here revives
    // every existing "xxl:" usage without touching each file. "3xl" is new —
    // added so hero/cover images can reach a proper size on wider desktops
    // too, the same fix applied to the contribute-link cover image.
    screens: { xxl: 1536, '3xl': 1920 }
  },

  icon: {
    // heroicons (Tailwind Plus icons) + simple-icons (brand logos)
    serverBundle: { collections: ['heroicons', 'simple-icons'] }
  },

  i18n: {
    // Absolute base used by useLocaleHead() for canonical + hreflang URLs.
    // Must match the production domain (same source as public.siteUrl).
    baseUrl: process.env.NUXT_PUBLIC_SITE_URL || 'https://cuphotoclub.com',
    locales: [
      { code: 'en', language: 'en', name: 'English', file: 'en.json' },
      { code: 'th', language: 'th', name: 'ไทย', file: 'th.json' }
    ],
    defaultLocale: 'en',
    strategy: 'prefix_except_default',
    langDir: 'locales',
    detectBrowserLanguage: {
      useCookie: true,
      cookieKey: 'i18n_redirected',
      redirectOn: 'root'
    }
  }
})
