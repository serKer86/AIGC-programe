import { supportsWebP } from './compress'
import type { SchoolLink } from './schoolLinks'

const ICON_STORAGE_KEY = 'toolbox.linkIcons.v1'
const ICON_EDGE = 128
const MAX_ICON_BYTES = 5 * 1024 * 1024

export type IconMap = Record<string, string>

export type IconSaveResult = { ok: true; icons: IconMap } | { ok: false; reason: string }

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.decoding = 'async'
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('decode failed'))
    image.src = url
  })
}

export function readLinkIcons(): IconMap {
  try {
    const raw = localStorage.getItem(ICON_STORAGE_KEY)
    if (!raw) return {}
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {}
    const icons: IconMap = {}
    for (const [id, value] of Object.entries(parsed)) {
      if (typeof value === 'string' && value.startsWith('data:image/')) icons[id] = value
    }
    return icons
  } catch {
    return {}
  }
}

function writeLinkIcons(icons: IconMap): boolean {
  try {
    localStorage.setItem(ICON_STORAGE_KEY, JSON.stringify(icons))
    return true
  } catch {
    return false
  }
}

export function saveLinkIcon(
  id: string,
  dataUrl: string,
  current: IconMap,
): IconSaveResult {
  const next = { ...current, [id]: dataUrl }
  if (!writeLinkIcons(next)) {
    return { ok: false, reason: '本机存储写不进去（可能处于无痕模式），这次换图不会保留。' }
  }
  return { ok: true, icons: next }
}

export function clearLinkIcon(id: string, current: IconMap): IconMap {
  const next = { ...current }
  delete next[id]
  writeLinkIcons(next)
  return next
}

export function iconSrcFor(link: SchoolLink, icons: IconMap): string | null {
  const override = icons[link.id]
  if (override) return override
  if (!link.icon) return null
  return `${import.meta.env.BASE_URL}${link.icon.replace(/^\/+/, '')}`
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return ''
  }
}

export function tileLetter(url: string): string {
  const host = hostOf(url)
  return host ? host[0].toUpperCase() : '·'
}

// 同一域名永远同一个色相，同学自己加的链接也不会每次刷新换色
export function tileHue(url: string): number {
  const host = hostOf(url)
  if (!host) return 213
  let hash = 2166136261
  for (let index = 0; index < host.length; index += 1) {
    hash ^= host.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return Math.abs(hash) % 360
}

export async function createIconDataUrl(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) {
    throw new Error('请选择一张图片作为图标。')
  }
  if (file.size > MAX_ICON_BYTES) {
    throw new Error('图标图片请在 5 MB 以内，先裁小一点再上传。')
  }

  const url = URL.createObjectURL(file)
  try {
    const image = await loadImage(url)
    const { naturalWidth: width, naturalHeight: height } = image
    const edge = Math.min(width, height)
    if (!edge) throw new Error('这张图片读不出来，换一张试试。')

    const type = supportsWebP() ? 'image/webp' : 'image/jpeg'
    const canvas = document.createElement('canvas')
    canvas.width = ICON_EDGE
    canvas.height = ICON_EDGE
    const context = canvas.getContext('2d')
    if (!context) throw new Error('这张图片处理失败，换一张试试。')

    if (type === 'image/jpeg') {
      context.fillStyle = '#ffffff'
      context.fillRect(0, 0, ICON_EDGE, ICON_EDGE)
    }

    const offset = (Math.max(width, height) - edge) / 2
    context.imageSmoothingEnabled = true
    context.imageSmoothingQuality = 'high'
    context.drawImage(
      image,
      width > height ? offset : 0,
      height > width ? offset : 0,
      edge,
      edge,
      0,
      0,
      ICON_EDGE,
      ICON_EDGE,
    )

    return canvas.toDataURL(type, 0.85)
  } finally {
    URL.revokeObjectURL(url)
  }
}
