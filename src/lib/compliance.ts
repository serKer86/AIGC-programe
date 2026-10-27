import type { SpecOutput } from './output'
import type { SpecBackground, SpecPreset, SpecSize } from './specs'

export type ComplianceId = 'size' | 'background' | 'filesize' | 'format'

export interface ComplianceCheck {
  id: ComplianceId
  label: string
  passed: boolean
  value: string
  reason?: string
}

export interface ComplianceReport {
  checks: ComplianceCheck[]
  passed: boolean
  passedCount: number
}

export interface ComplianceInput {
  output: SpecOutput
  preset: SpecPreset
  size: SpecSize
  background: SpecBackground
  filename: string
}

const BACKGROUND_TOLERANCE = 8
const KB = 1024

function hexToRgb(hex: string): [number, number, number] {
  const value = Number.parseInt(hex.replace('#', ''), 16)
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255]
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.decoding = 'async'
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('image load failed'))
    image.src = url
  })
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

function formatRange(preset: SpecPreset) {
  return preset.minKB > 0
    ? `${preset.minKB}–${preset.maxKB} KB`
    : `≤ ${preset.maxKB} KB`
}

interface BackgroundSample {
  color: [number, number, number]
  maxDeviation: number
}

// 肩部会占据照片下方，底色只在上边缘与上半部侧边采样；中位数判定可容忍少量发丝入镜。
const SAMPLE_POINTS: Array<[number, number]> = [
  [0.04, 0.03],
  [0.2, 0.03],
  [0.5, 0.03],
  [0.8, 0.03],
  [0.96, 0.03],
  [0.03, 0.12],
  [0.03, 0.25],
  [0.03, 0.38],
  [0.97, 0.12],
  [0.97, 0.25],
  [0.97, 0.38],
]

async function sampleBackground(
  url: string,
  expected: [number, number, number],
): Promise<BackgroundSample> {
  const image = await loadImage(url)
  const canvas = document.createElement('canvas')
  canvas.width = image.naturalWidth
  canvas.height = image.naturalHeight
  const context = canvas.getContext('2d')
  if (!context) throw new Error('canvas unavailable')
  context.drawImage(image, 0, 0)

  const { width, height } = canvas

  const samples: Array<{ color: [number, number, number]; deviation: number }> =
    []
  for (const [ratioX, ratioY] of SAMPLE_POINTS) {
    const centerX = clamp(Math.round(ratioX * (width - 1)), 2, width - 3)
    const centerY = clamp(Math.round(ratioY * (height - 1)), 2, height - 3)
    const patch = context.getImageData(centerX - 2, centerY - 2, 5, 5).data
    let r = 0
    let g = 0
    let b = 0
    for (let index = 0; index < patch.length; index += 4) {
      r += patch[index]
      g += patch[index + 1]
      b += patch[index + 2]
    }
    const pixels = patch.length / 4
    const color: [number, number, number] = [
      Math.round(r / pixels),
      Math.round(g / pixels),
      Math.round(b / pixels),
    ]
    let deviation = 0
    for (let channel = 0; channel < 3; channel += 1) {
      deviation = Math.max(
        deviation,
        Math.abs(color[channel] - expected[channel]),
      )
    }
    samples.push({ color, deviation })
  }

  samples.sort((a, b) => a.deviation - b.deviation)
  const median = samples[Math.floor(samples.length / 2)]
  return { color: median.color, maxDeviation: median.deviation }
}

export async function evaluateCompliance({
  output,
  preset,
  size,
  background,
  filename,
}: ComplianceInput): Promise<ComplianceReport> {
  const checks: ComplianceCheck[] = []

  const sizePassed =
    output.width === size.width && output.height === size.height
  checks.push({
    id: 'size',
    label: '像素',
    passed: sizePassed,
    value: `${output.width} × ${output.height} px`,
    reason: sizePassed
      ? undefined
      : `要求严格等于 ${size.width} × ${size.height} px，实际为 ${output.width} × ${output.height} px`,
  })

  const expected = hexToRgb(background.color)
  try {
    const sample = await sampleBackground(output.url, expected)
    const passed = sample.maxDeviation <= BACKGROUND_TOLERANCE
    const measured = sample.color.join(',')
    checks.push({
      id: 'background',
      label: '底色',
      passed,
      value: `RGB(${measured}) · 偏差 ${sample.maxDeviation}（容差 ±${BACKGROUND_TOLERANCE}）`,
      reason: passed
        ? undefined
        : `实测 RGB(${measured}) 与要求 RGB(${expected.join(
            ',',
          )}) 最大偏差 ${sample.maxDeviation}，超出 ±${BACKGROUND_TOLERANCE}`,
    })
  } catch {
    checks.push({
      id: 'background',
      label: '底色',
      passed: false,
      value: '无法采样',
      reason: '输出图片无法读取，未能完成底色校验',
    })
  }

  const bytes = output.blob.size
  const minBytes = preset.minKB * KB
  const maxBytes = preset.maxKB * KB
  const volumePassed = bytes >= minBytes && bytes <= maxBytes
  checks.push({
    id: 'filesize',
    label: '文件大小',
    passed: volumePassed,
    value: `${(bytes / KB).toFixed(1)} KB · 要求 ${formatRange(preset)}`,
    reason: volumePassed
      ? undefined
      : bytes < minBytes
        ? `低于该规格最低 ${preset.minKB} KB（要求 ${formatRange(preset)}）`
        : `超过该规格上限 ${preset.maxKB} KB（要求 ${formatRange(preset)}）`,
  })

  const mimePassed = output.blob.type === 'image/jpeg'
  const extensionPassed = filename.toLowerCase().endsWith('.jpg')
  const formatPassed = mimePassed && extensionPassed
  checks.push({
    id: 'format',
    label: '格式',
    passed: formatPassed,
    value: `${mimePassed ? 'JPEG' : output.blob.type || '未知'} · ${
      extensionPassed ? '.jpg' : '非 .jpg'
    }`,
    reason: formatPassed
      ? undefined
      : !mimePassed
        ? `MIME 类型应为 image/jpeg，实际为 ${output.blob.type || '未知'}`
        : '文件名后缀应为 .jpg',
  })

  const passedCount = checks.filter((check) => check.passed).length
  return {
    checks,
    passed: passedCount === checks.length,
    passedCount,
  }
}
