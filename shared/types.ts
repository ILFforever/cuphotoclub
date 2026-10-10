// Shared types used by both the Nuxt app (client) and the Nitro server.

import type { AlbumFontValue } from './albumFonts'

export type Role = 'owner' | 'admin' | 'editor'
export type ContentStatus = 'draft' | 'link-only' | 'public'

export const ROLES: Role[] = ['owner', 'admin', 'editor']

// owner/admin can manage users + settings; editor manages content only.
export function canManageUsers(role: Role): boolean {
  return role === 'owner' || role === 'admin'
}

export type CellSpan = 2 | 3 | 4 | 6
export type CellType = 'image' | 'text' | 'pad'
export type TextAlign = 'left' | 'center' | 'right'
/** One of the faces catalogued in shared/albumFonts.ts. */
export type TextFont = AlbumFontValue

export interface AlbumCell {
  type: CellType
  span: CellSpan
  src?: string       // image cells
  caption?: string   // image cells; shown publicly (figure caption / alt text)
  label?: string     // internal-only name for editors; never rendered publicly
  content?: string   // text cells
  align?: TextAlign  // text cells; undefined = inherit album default
  font?: TextFont    // text cells; undefined = inherit album default
}

export interface AlbumRow {
  cells: AlbumCell[]
}

export type AlbumStyle = 'essay' | 'sticky' | 'contact' | 'darkroom' | 'chapters'
export type Placement = 'gallery' | 'both'

export interface Album {
  id: string           // immutable key; also the R2 media folder (content-albums/<id>)
  slug: string         // human-readable URL slug; renamable without moving media
  title: string
  category: string
  date: string // ISO date (YYYY-MM-DD) shown on the album
  dateEnd?: string // optional ISO date (YYYY-MM-DD) for multi-day albums
  published: string // ISO date (sorting)
  visibility: ContentStatus // draft = admin only, link-only = direct URL, public = listed
  location?: string
  excerpt: string
  style: AlbumStyle
  dark?: boolean       // any style but darkroom (already black): renders on a black wall, same layout
  placement: Placement
  coverSrc: string       // URL of the cover/hero image
  rows: AlbumRow[]       // ordered content rows
  textDefaults?: { align?: TextAlign, font?: TextFont }
  updatedAt?: string
}

/** Fields the admin supplies when creating/updating. `id`/`slug` are server-managed. */
export type AlbumInput = Omit<Album, 'id' | 'slug' | 'updatedAt'>

/**
 * An album as it appears in a list (archive, admin table, home feed, sitemap).
 * Deliberately without `rows`: list views only ever need a cover and a photo
 * count, and reading every album's `rows` JSON to derive those pulled megabytes
 * out of D1 per request. `coverSrc` here is already resolved — the explicit
 * cover if set, otherwise the album's first image.
 */
export type AlbumListItem = Omit<Album, 'rows'> & { photoCount: number }

/** The subset an album picker/dropdown needs. */
export type AlbumPickerItem = Pick<Album, 'id' | 'slug' | 'title' | 'category' | 'visibility'>

// The #auth-utils session User augmentation lives in app/types/auth.d.ts and
// server/types/auth.d.ts — the standalone `shared` TS project cannot resolve
// that module, so the augmentation must not live here.
