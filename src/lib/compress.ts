export type CompressFormat = 'image/jpeg' | 'image/webp'

export interface CompressOptions {
  maxKB: number
  format: CompressFormat
  maxEdge: number | null
  signal?: AbortSignal
}

export interface CompressResult {
  blob: Blob
  url: string
  width: number
  height: number
  quality: number
  format: CompressFormat
  maxKB: number
  withinTarget: boolean
}

const QUALITY_STEPS = [0.92, 0.85, 0.78, 0.7, 0.62, 0.54, 0.46, 0.38, 0.3]
const EXTRA_SCALES = [0.88, 0.76, 0.64, 0.52, 0.42]
const EXTENSIONS: Record<CompressFormat, string> = {
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
}

let webpSupport: boolean | null = null

export function supportsWebP(): boolean {
  if (webpSupport === null) {
    const canvas = document.createElement('canvas')
    canvas.width = 1
    canvas.height = 1
    webpSupport = canvas.toDataURL('image/webp').startsWith('data:image/webp')
  }
  return webpSupport
}

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) {
    throw new DOMException('压缩已取消', 'AbortError')
  }
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.decoding = 'async'
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('decode failed'))
    image.src = url
  })
}

function encode(
  canvas: HTMLCanvasElement,
  format: CompressFormat,
  quality: number,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob)
        else reject(new Error('encode failed'))
      },
      format,
      quality,
    )
  })
}

function drawScaled(
  image: HTMLImageElement,
  scale: number,
  fillBackground: boolean,
): HTMLCanvasElement {
  const width = Math.max(1, Math.round(image.naturalWidth * scale))
  const height = Math.max(1, Math.round(image.naturalHeight * scale))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('canvas unavailable')
  if (fillBackground) {
    context.fillStyle = '#ffffff'
    context.fillRect(0, 0, width, height)
  }
  context.imageSmoothingEnabled = true
  context.imageSmoothingQuality = 'high'
  context.drawImage(image, 0, 0, width, height)
  return canvas
}

interface Fit {
  blob: Blob
  quality: number
}

interface QualitySearch {
  best: Fit | null
  smallest: Fit
}

// 同一张画布上体积随质量单调递减，二分即可找出压进上限的最高质量档，
// 比逐档试探少一半以上的编码次数。
async function searchQuality(
  canvas: HTMLCanvasElement,
  format: CompressFormat,
  targetBytes: number,
  signal?: AbortSignal,
): Promise<QualitySearch> {
  const cache = new Map<number, Blob>()
  const encodeAt = async (index: number): Promise<Blob> => {
    const cached = cache.get(index)
    if (cached) return cached
    throwIfAborted(signal)
    const blob = await encode(canvas, format, QUALITY_STEPS[index])
    cache.set(index, blob)
    return blob
  }

  const last = QUALITY_STEPS.length - 1
  const highest = await encodeAt(0)
  if (highest.size <= targetBytes) {
    return {
      best: { blob: highest, quality: QUALITY_STEPS[0] },
      smallest: { blob: highest, quality: QUALITY_STEPS[0] },
    }
  }

  const lowest = await encodeAt(last)
  if (lowest.size > targetBytes) {
    return { best: null, smallest: { blob: lowest, quality: QUALITY_STEPS[last] } }
  }

  let bestIndex = last
  let low = 1
  let high = last - 1
  while (low <= high) {
    const middle = (low + high) >> 1
    if ((await encodeAt(middle)).size <= targetBytes) {
      bestIndex = middle
      high = middle - 1
    } else {
      low = middle + 1
    }
  }

  return {
    best: { blob: await encodeAt(bestIndex), quality: QUALITY_STEPS[bestIndex] },
    smallest: { blob: lowest, quality: QUALITY_STEPS[last] },
  }
}

export async function compressImage(
  file: File,
  { maxKB, format, maxEdge, signal }: CompressOptions,
): Promise<CompressResult> {
  const usedFormat: CompressFormat =
    format === 'image/webp' && !supportsWebP() ? 'image/jpeg' : format
  const targetBytes = Math.max(1, Math.round(maxKB * 1024))

  const sourceUrl = URL.createObjectURL(file)
  let image: HTMLImageElement
  try {
    image = await loadImage(sourceUrl)
  } finally {
    URL.revokeObjectURL(sourceUrl)
  }

  const longestEdge = Math.max(image.naturalWidth, image.naturalHeight)
  const baseScale = maxEdge && longestEdge > maxEdge ? maxEdge / longestEdge : 1
  const scales = [baseScale, ...EXTRA_SCALES.map((scale) => baseScale * scale)]

  let smallest: { blob: Blob; width: number; height: number; quality: number } | null =
    null

  for (const scale of scales) {
    throwIfAborted(signal)
    const canvas = drawScaled(image, scale, usedFormat === 'image/jpeg')
    const { best, smallest: floor } = await searchQuality(
      canvas,
      usedFormat,
      targetBytes,
      signal,
    )

    if (best) {
      return buildResult({
        blob: best.blob,
        format: usedFormat,
        width: canvas.width,
        height: canvas.height,
        quality: best.quality,
        maxKB,
        targetBytes,
      })
    }

    if (!smallest || floor.blob.size < smallest.blob.size) {
      smallest = {
        blob: floor.blob,
        width: canvas.width,
        height: canvas.height,
        quality: floor.quality,
      }
    }
  }

  if (!smallest) throw new Error('encode failed')

  return buildResult({
    blob: smallest.blob,
    format: usedFormat,
    width: smallest.width,
    height: smallest.height,
    quality: smallest.quality,
    maxKB,
    targetBytes,
  })
}

function buildResult({
  blob,
  format,
  width,
  height,
  quality,
  maxKB,
  targetBytes,
}: {
  blob: Blob
  format: CompressFormat
  width: number
  height: number
  quality: number
  maxKB: number
  targetBytes: number
}): CompressResult {
  return {
    blob,
    url: URL.createObjectURL(blob),
    width,
    height,
    quality,
    format,
    maxKB,
    withinTarget: blob.size <= targetBytes,
  }
}

export function buildOutputName(
  originalName: string,
  maxKB: number,
  format: CompressFormat,
): string {
  const dot = originalName.lastIndexOf('.')
  const stem = dot > 0 ? originalName.slice(0, dot) : originalName
  return `${stem}_${maxKB}KB.${EXTENSIONS[format]}`
}
