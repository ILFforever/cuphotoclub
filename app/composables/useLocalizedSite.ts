type SiteConfig = typeof import('~/utils/defaultSite')['defaultSite']

export function useLocalizedSite(site: Ref<SiteConfig | null | undefined>) {
  const { t } = useI18n()

  return computed(() => {
    const base = site.value
    if (!base) return null

    return {
      ...base,
      hero: {
        ...base.hero,
        kicker: t('site.hero.kicker'),
        kickerAccent: t('site.hero.kickerAccent'),
        title: [
          { text: t('site.hero.title.0.text') },
          { text: t('site.hero.title.1.text'), em: true },
          { text: t('site.hero.title.2.text') }
        ],
        lead: t('site.hero.lead'),
        meta: [
          t('site.hero.meta.0'),
          t('site.hero.meta.1')
        ]
      },
      history: {
        ...base.history,
        eyebrow: t('site.history.eyebrow'),
        imageAlt: t('site.history.imageAlt'),
        quote: t('site.history.quote'),
        quoteLead: t('site.history.quoteLead'),
        quoteAccent: t('site.history.quoteAccent'),
        body: [
          t('site.history.body.0'),
          t('site.history.body.1')
        ],
        sinceText: [
          t('site.history.sinceText.0'),
          t('site.history.sinceText.1')
        ],
        timeline: [base.history.sinceNum, '1980', '2000', t('site.history.today')]
      },
      about: {
        ...base.about,
        eyebrow: t('site.about.eyebrow'),
        heading: [
          { text: t('site.about.heading.0.text') },
          { text: t('site.about.heading.1.text') },
          { text: t('site.about.heading.2.text'), em: true }
        ],
        body: t('site.about.body'),
        imageAlt: t('site.about.imageAlt'),
        photoCaption: t('site.about.photoCaption'),
        route: [
          {
            label: t('site.about.route.0.label'),
            lines: [t('site.about.route.0.lines.0'), t('site.about.route.0.lines.1')]
          },
          {
            label: t('site.about.route.1.label'),
            lines: [t('site.about.route.1.lines.0'), t('site.about.route.1.lines.1')]
          },
          {
            label: t('site.about.route.2.label'),
            lines: [t('site.about.route.2.lines.0'), t('site.about.route.2.lines.1')]
          }
        ],
        cta: {
          ...base.about.cta,
          label: t('site.about.ctaLabel')
        }
      },
      footer: {
        ...base.footer,
        tagline: t('site.footer.tagline'),
        columns: [
          {
            // Footer nav is intentionally light — top-level destinations
            // (Albums, Events, Contact, Join…) already live in the header, so the
            // footer only carries the pages that aren't in the header: the
            // homepage narrative anchors and the credits page.
            title: t('site.footer.columns.0.title'),
            links: [
              { label: t('site.footer.columns.0.links.0.label'), to: '/#history' },
              { label: t('site.footer.columns.0.links.1.label'), to: '/#about' },
              { label: t('site.footer.columns.0.links.2.label'), to: '/developed-by' }
            ]
          },
          {
            title: t('site.footer.columns.1.title'),
            links: [
              { label: t('site.footer.columns.1.links.0.label'), to: 'https://www.instagram.com/cuphotoclub/' },
              { label: t('site.footer.columns.1.links.1.label'), to: 'https://www.facebook.com/cuphoto' },
              { label: t('site.footer.columns.1.links.2.label'), to: 'https://x.com/CUPhotoClubs' },
              { label: t('site.footer.columns.1.links.3.label'), to: 'https://linktr.ee/CUPhotoClub' }
            ]
          }
        ],
        copyright: t('site.footer.copyright'),
        location: t('site.footer.location')
      }
    }
  })
}
