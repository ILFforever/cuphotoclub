// Event websites listed on the public /events gallery.
//
// One entry per event site. Every text field is an i18n key (resolved with t()
// in app/pages/events/index.vue), so copy lives in i18n/locales/*.json.
// Add a new event by adding an entry here plus its keys in both locales.
//
// status drives the badge on the card: 'upcoming' | 'ongoing' | 'past'.
// Update it when the event starts or ends. The site itself is not changed.

export type EventSiteStatus = 'upcoming' | 'ongoing' | 'past'

export interface EventSite {
  slug: string
  path: string // site path, without the locale prefix
  title: string // i18n key
  description: string // i18n key
  dateLabel: string // i18n key
  location: string // i18n key
  coverSrc: string // path under public/
  status: EventSiteStatus
}

export const EVENT_SITES: EventSite[] = [
  {
    slug: 'oneday-2026',
    path: '/events/oneday-2026',
    title: 'oneday.info.pageTitle',
    description: 'oneday.info.lead',
    dateLabel: 'events.oneday.dates',
    location: 'events.oneday.location',
    coverSrc: '/events/oneday-2026/bushbuck.jpg',
    status: 'ongoing'
  }
]
