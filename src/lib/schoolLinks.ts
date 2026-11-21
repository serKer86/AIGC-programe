export interface SchoolLink {
  id: string
  name: string
  url: string
  group: string
  /** 预置入口的图标文件，相对 public/ 的路径，例如 'icons/jwgl.png' */
  icon?: string
  local?: boolean
}

export type LinkInput = { ok: true; link: SchoolLink } | { ok: false; reason: string }

const LINKS_STORAGE_KEY = 'toolbox.links.v1'
export const DEFAULT_GROUP = '其他'

// 预置链接在这里补充：{ id, name, url, group, icon }
export const PRESET_LINKS: SchoolLink[] = []

function createId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `local-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

export function normalizeUrl(raw: string): string | null {
  const trimmed = raw.trim()
  if (!trimmed) return null
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
  try {
    const url = new URL(withScheme)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
    if (!url.hostname.includes('.') && url.hostname !== 'localhost') return null
    return url.href
  } catch {
    return null
  }
}

export function readLocalLinks(): SchoolLink[] {
  try {
    const raw = localStorage.getItem(LINKS_STORAGE_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    const links: SchoolLink[] = []
    for (const value of parsed) {
      if (typeof value !== 'object' || value === null) continue
      const item = value as Partial<SchoolLink>
      if (typeof item.name !== 'string' || !item.name.trim()) continue
      const url = typeof item.url === 'string' ? normalizeUrl(item.url) : null
      if (!url) continue
      links.push({
        id: typeof item.id === 'string' ? item.id : createId(),
        name: item.name.trim().slice(0, 24),
        url,
        group: typeof item.group === 'string' && item.group.trim() ? item.group.trim() : DEFAULT_GROUP,
        local: true,
      })
    }
    return links
  } catch {
    return []
  }
}

function writeLocalLinks(links: SchoolLink[]): boolean {
  try {
    localStorage.setItem(
      LINKS_STORAGE_KEY,
      JSON.stringify(links.map(({ id, name, url, group }) => ({ id, name, url, group }))),
    )
    return true
  } catch {
    return false
  }
}

export function addLocalLink(name: string, url: string, existing: SchoolLink[]): LinkInput {
  const trimmedName = name.trim()
  if (!trimmedName) return { ok: false, reason: '请填写名称。' }
  if (trimmedName.length > 24) return { ok: false, reason: '名称请控制在 24 个字以内。' }

  const normalized = normalizeUrl(url)
  if (!normalized) {
    return { ok: false, reason: '网址格式不正确，请填写完整地址，例如 jwgl.hdu.edu.cn。' }
  }

  const duplicated = existing.find((link) => link.url === normalized)
  if (duplicated) {
    return { ok: false, reason: `「${duplicated.name}」已经添加过这个网址。` }
  }

  return {
    ok: true,
    link: { id: createId(), name: trimmedName, url: normalized, group: DEFAULT_GROUP, local: true },
  }
}

export function saveLocalLink(link: SchoolLink, current: SchoolLink[]): boolean {
  return writeLocalLinks([...current, link])
}

export function removeLocalLink(id: string, current: SchoolLink[]): boolean {
  return writeLocalLinks(current.filter((link) => link.id !== id))
}

export function groupLinks(links: SchoolLink[]): { group: string; links: SchoolLink[] }[] {  const groups: { group: string; links: SchoolLink[] }[] = []
  for (const link of links) {
    const name = link.group.trim() || DEFAULT_GROUP
    const found = groups.find((entry) => entry.group === name)
    if (found) found.links.push(link)
    else groups.push({ group: name, links: [link] })
  }
  return groups
}

export function describeHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}
/* ---------- 图标排序 ---------- */

const ORDER_STORAGE_KEY = 'toolbox.linkOrder.v1'

export function readLinkOrder(): string[] {
  try {
    const raw = localStorage.getItem(ORDER_STORAGE_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    const ids: string[] = []
    for (const value of parsed) {
      if (typeof value === 'string' && value && !ids.includes(value)) ids.push(value)
    }
    return ids
  } catch {
    return []
  }
}

export function saveLinkOrder(ids: string[]): boolean {
  try {
    localStorage.setItem(ORDER_STORAGE_KEY, JSON.stringify(ids))
    return true
  } catch {
    return false
  }
}

/** 按保存的顺序排列；新加的链接自动落到末尾 */
export function applyLinkOrder(links: SchoolLink[], order: string[]): SchoolLink[] {
  if (!order.length) return links
  const byId = new Map(links.map((link) => [link.id, link] as const))
  const placed = new Set<string>()
  const sorted: SchoolLink[] = []
  for (const id of order) {
    const link = byId.get(id)
    if (!link || placed.has(id)) continue
    sorted.push(link)
    placed.add(id)
  }
  for (const link of links) {
    if (!placed.has(link.id)) sorted.push(link)
  }
  return sorted
}
