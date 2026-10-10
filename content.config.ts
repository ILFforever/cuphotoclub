import { defineContentConfig, defineCollection, z } from '@nuxt/content'

// A title/heading rendered as stacked lines, where any line can be italic-emphasised.
const lines = z.array(
  z.object({
    text: z.string(),
    em: z.boolean().optional()
  })
)

export default defineContentConfig({
  collections: {
    // ── Albums: the core unit. An album is a set of images, one of which is the
    //    cover (referenced by index). Albums feed BOTH the Featured Work wall
    //    (via their cover) and the Stories feed (as a dated item). Markdown so
    //    each album can carry a description body and resolve to /albums/<slug>.
    albums: defineCollection({
      type: 'page',
      source: 'albums/*.md',
      schema: z.object({
        title: z.string(),
        category: z.string(),
        date: z.string(), // human display, e.g. "March 2025"
        published: z.string(), // ISO date — drives Stories ordering
        visibility: z.enum(['draft', 'link-only', 'public']).default('public'),
        excerpt: z.string(),
        location: z.string().optional(),
        // Display style chosen by the admin (set-and-forget). See album style components.
        style: z.enum(['essay', 'sticky', 'contact', 'darkroom']).default('essay'),
        // Which index section(s) list this album. Default Gallery; admin-editable.
        placement: z.enum(['gallery', 'both']).default('gallery'),
        coverIndex: z.number().default(0), // which image in `images` is the cover
        featured: z.boolean().default(false), // pin into the featured pool
        images: z
          .array(
            z.object({
              src: z.string(),
              caption: z.string().optional()
            })
          )
          .min(1)
      })
    }),

    // ── Page-level copy (hero, history, about, footer, nav). Single singleton
    //    file queried with `.first()`. Keeps editorial text out of the templates.
    site: defineCollection({
      type: 'data',
      source: 'site.yml',
      schema: z.object({
        nav: z.object({
          links: z.array(z.object({ label: z.string(), to: z.string(), join: z.boolean().optional() }))
        }),
        hero: z.object({
          kicker: z.string(),
          kickerAccent: z.string(),
          title: lines,
          image: z.string(),
          lead: z.string(),
          meta: z.array(z.string())
        }),
        history: z.object({
          eyebrow: z.string(),
          image: z.string(),
          quote: z.string(),
          body: z.array(z.string()),
          sinceNum: z.string(),
          sinceText: z.array(z.string())
        }),
        about: z.object({
          eyebrow: z.string(),
          heading: lines,
          body: z.string(),
          cta: z.object({ label: z.string(), to: z.string() }),
          image: z.string()
        }),
        footer: z.object({
          tagline: z.string(),
          columns: z.array(
            z.object({
              title: z.string(),
              links: z.array(z.object({ label: z.string(), to: z.string() }))
            })
          ),
          copyright: z.string(),
          location: z.string()
        })
      })
    })
  }
})
