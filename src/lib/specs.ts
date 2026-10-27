export interface SpecSize {
  id: string
  label: string
  width: number
  height: number
}

export interface SpecBackground {
  id: string
  label: string
  color: string
}

export interface SpecPreset {
  id: string
  name: string
  subtitle: string
  sizes: SpecSize[]
  backgrounds: SpecBackground[]
  minKB: number
  maxKB: number
  format: string
  dpi?: number
  notes: string[]
  compatibility?: string
}

export interface SpecSelection {
  presetId: string
  sizeId: string
  backgroundId: string
  customColor?: string
}

const WHITE: SpecBackground = {
  id: 'white',
  label: '纯白',
  color: '#FFFFFF',
}

const LIGHT_BLUE: SpecBackground = {
  id: 'light-blue',
  label: '浅蓝',
  color: '#B4DCE6',
}

const BLUE: SpecBackground = {
  id: 'blue',
  label: '蓝色',
  color: '#438EDB',
}

const RED: SpecBackground = {
  id: 'red',
  label: '红色',
  color: '#FF0000',
}

const ONE_INCH: SpecSize = {
  id: '295x413',
  label: '一寸 295 × 413',
  width: 295,
  height: 413,
}

const TWO_INCH: SpecSize = {
  id: '413x626',
  label: '二寸 413 × 626',
  width: 413,
  height: 626,
}

const TWO_INCH_SMALL: SpecSize = {
  id: '413x579',
  label: '二寸（小）413 × 579',
  width: 413,
  height: 579,
}

export const SPEC_PRESETS: SpecPreset[] = [
  {
    id: 'cet',
    name: '四六级 CET',
    subtitle: '报名照 · 标准一寸',
    sizes: [ONE_INCH],
    backgrounds: [WHITE, LIGHT_BLUE, BLUE],
    minKB: 20,
    maxKB: 100,
    format: 'JPG',
    notes: [
      '标准背景为纯白 RGB(255,255,255) 或浅蓝 RGB(180,220,230)，蓝色与自定义底色仅供特殊要求使用',
      '头部构图：顶部留空约 1/10，头部+颈部约 7/10，肩部约 1/5，左右各留约 1/10',
      '部分学校允许 200 KB 以内，请以报名系统的最新要求为准',
    ],
    compatibility: '兼容尺寸范围：192 × 144 – 480 × 640 px',
  },
  {
    id: 'student-card',
    name: '学生证 / 校园卡',
    subtitle: '校园证件 · 一寸',
    sizes: [ONE_INCH],
    backgrounds: [WHITE, BLUE],
    minKB: 10,
    maxKB: 200,
    format: 'JPG / JPEG',
    dpi: 300,
    notes: [
      '常见体积要求为 20–100 KB，部分学校允许到 200 KB',
      '白色或蓝色背景，请按学校模板选择',
      '按 300 dpi 对应的 295 × 413 px 输出',
    ],
  },
  {
    id: 'resume',
    name: '简历 / 实习',
    subtitle: '求职投递 · 一寸或二寸',
    sizes: [ONE_INCH, TWO_INCH],
    backgrounds: [WHITE, BLUE],
    minKB: 0,
    maxKB: 200,
    format: 'JPG / JPEG',
    dpi: 300,
    notes: [
      '上传体积常见要求为 20–100 KB，上限通常为 200 KB',
      '一寸或二寸均可，按投递系统要求切换尺寸',
      '按 300 dpi 对应像素输出',
    ],
  },
  {
    id: 'two-inch',
    name: '二寸通用',
    subtitle: '通用二寸 · 按系统要求',
    sizes: [TWO_INCH, TWO_INCH_SMALL],
    backgrounds: [WHITE, BLUE, RED],
    minKB: 100,
    maxKB: 200,
    format: 'JPG',
    notes: [
      '常见体积要求为 100–200 KB',
      '白色、蓝色或红色背景，以学校或上传系统的要求为准',
    ],
  },
]

export function getSpecPreset(id: string): SpecPreset {
  return SPEC_PRESETS.find((preset) => preset.id === id) ?? SPEC_PRESETS[0]
}

export function selectionForPreset(preset: SpecPreset): SpecSelection {
  return {
    presetId: preset.id,
    sizeId: preset.sizes[0].id,
    backgroundId: preset.backgrounds[0].id,
  }
}

export const CUSTOM_BACKGROUND_ID = 'custom'

function normalizeCustomColor(value: string | undefined): string {
  return /^#[0-9a-fA-F]{6}$/.test(value ?? '') ? value!.toUpperCase() : '#FFFFFF'
}

export function resolveSelection(
  selection: SpecSelection | null | undefined,
): SpecSelection {
  if (!selection) return selectionForPreset(SPEC_PRESETS[0])
  const preset = SPEC_PRESETS.find((item) => item.id === selection.presetId)
  if (!preset) return selectionForPreset(SPEC_PRESETS[0])

  const size =
    preset.sizes.find((item) => item.id === selection.sizeId) ??
    preset.sizes[0]

  if (selection.backgroundId === CUSTOM_BACKGROUND_ID) {
    return {
      presetId: preset.id,
      sizeId: size.id,
      backgroundId: CUSTOM_BACKGROUND_ID,
      customColor: normalizeCustomColor(selection.customColor),
    }
  }

  const background =
    preset.backgrounds.find((item) => item.id === selection.backgroundId) ??
    preset.backgrounds[0]

  return {
    presetId: preset.id,
    sizeId: size.id,
    backgroundId: background.id,
  }
}

export function customBackground(color: string): SpecBackground {
  return { id: CUSTOM_BACKGROUND_ID, label: '自定义', color }
}

export function buildDownloadFilename(
  preset: SpecPreset,
  timestamp: number,
): string {
  const name = preset.name.replace(/[\\/:*?"<>|\s]+/g, '')
  const date = new Date(timestamp)
  const pad = (value: number) => String(value).padStart(2, '0')
  const stamp = `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(
    date.getDate(),
  )}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(
    date.getSeconds(),
  )}`
  return `证件照_${name}_${stamp}.jpg`
}

export function formatSizeRange(preset: SpecPreset): string {
  return preset.minKB > 0
    ? `${preset.minKB}–${preset.maxKB} KB`
    : `≤ ${preset.maxKB} KB`
}

export function formatRgb(hex: string): string {
  const normalized = hex.replace('#', '')
  const value = Number.parseInt(normalized, 16)
  const r = (value >> 16) & 255
  const g = (value >> 8) & 255
  const b = value & 255
  return `RGB(${r},${g},${b})`
}
