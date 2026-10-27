import type {
  ImageSegmenter,
  ImageSegmenterResult,
  MPMask,
} from '@mediapipe/tasks-vision'

export type MatteMode = 'ai' | 'quick'
export type MatteProgress = 'loading' | 'segmenting' | 'compositing'
export type MattingErrorCode = 'segmenter' | 'mask' | 'image' | 'canvas'

export interface CutoutResult {
  url: string
  blob: Blob
  width: number
  height: number
  mode: MatteMode
  durationMs: number
}

export interface RunMattingOptions {
  onProgress?: (stage: MatteProgress) => void
  signal?: AbortSignal
}

export class MattingError extends Error {
  readonly code: MattingErrorCode

  constructor(code: MattingErrorCode, message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'MattingError'
    this.code = code
  }
}

const MAX_OUTPUT_EDGE = 2400
const WASM_BASE = `${import.meta.env.BASE_URL}wasm`
const MODEL_PATH = `${import.meta.env.BASE_URL}models/selfie_segmenter.tflite`

const ALPHA_LOW = 0.22
const ALPHA_HIGH = 0.72

let segmenterPromise: Promise<ImageSegmenter> | null = null

async function createSegmenter(): Promise<ImageSegmenter> {
  const { FilesetResolver, ImageSegmenter: ImageSegmenterTask } = await import(
    '@mediapipe/tasks-vision'
  )
  const fileset = await FilesetResolver.forVisionTasks(WASM_BASE)

  const build = (delegate: 'GPU' | 'CPU') =>
    ImageSegmenterTask.createFromOptions(fileset, {
      baseOptions: {
        modelAssetPath: MODEL_PATH,
        delegate,
      },
      runningMode: 'IMAGE',
      outputConfidenceMasks: true,
    })

  try {
    return await build('GPU')
  } catch {
    return build('CPU')
  }
}

export function loadSegmenter(): Promise<ImageSegmenter> {
  if (!segmenterPromise) {
    segmenterPromise = createSegmenter().catch((error: unknown) => {
      segmenterPromise = null
      throw new MattingError('segmenter', '本地 AI 模型加载失败', {
        cause: error,
      })
    })
  }
  return segmenterPromise
}

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) {
    throw new DOMException('抠图已取消', 'AbortError')
  }
}

function nextPaint() {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, 24)
  })
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.decoding = 'async'
    image.onload = () => resolve(image)
    image.onerror = () =>
      reject(new MattingError('image', '无法读取这张照片'))
    image.src = url
  })
}

function getContext(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const context = canvas.getContext('2d')
  if (!context) {
    throw new MattingError('canvas', '当前浏览器不支持 Canvas 2D')
  }
  return context
}

function fitSize(image: HTMLImageElement) {
  const naturalWidth = image.naturalWidth
  const naturalHeight = image.naturalHeight
  if (!naturalWidth || !naturalHeight) {
    throw new MattingError('image', '照片尺寸无效')
  }

  const longestEdge = Math.max(naturalWidth, naturalHeight)
  const scale = longestEdge > MAX_OUTPUT_EDGE ? MAX_OUTPUT_EDGE / longestEdge : 1

  return {
    width: Math.max(1, Math.round(naturalWidth * scale)),
    height: Math.max(1, Math.round(naturalHeight * scale)),
  }
}

function regionMean(
  data: Float32Array,
  width: number,
  height: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): number {
  const startX = Math.max(0, Math.floor(x0))
  const endX = Math.min(width, Math.ceil(x1))
  const startY = Math.max(0, Math.floor(y0))
  const endY = Math.min(height, Math.ceil(y1))

  let sum = 0
  let count = 0
  for (let y = startY; y < endY; y += 1) {
    for (let x = startX; x < endX; x += 1) {
      sum += data[y * width + x]
      count += 1
    }
  }
  return count > 0 ? sum / count : 0
}

function borderMean(
  data: Float32Array,
  width: number,
  height: number,
): number {
  const thickness = Math.max(2, Math.round(Math.min(width, height) * 0.04))
  const top = regionMean(data, width, height, 0, 0, width, thickness)
  const bottom = regionMean(
    data,
    width,
    height,
    0,
    height - thickness,
    width,
    height,
  )
  const left = regionMean(data, width, height, 0, 0, thickness, height)
  const right = regionMean(
    data,
    width,
    height,
    width - thickness,
    0,
    width,
    height,
  )
  return (top + bottom + left + right) / 4
}

function extractPersonMask(result: ImageSegmenterResult): {
  data: Float32Array
  width: number
  height: number
} {
  const masks: MPMask[] = result.confidenceMasks ?? []
  if (masks.length === 0) {
    throw new MattingError('mask', '模型没有返回人像蒙版')
  }

  let best: {
    data: Float32Array
    width: number
    height: number
    score: number
  } | null = null

  for (const mask of masks) {
    const { width, height } = mask
    const data = mask.getAsFloat32Array()

    const center = regionMean(
      data,
      width,
      height,
      width * 0.32,
      height * 0.22,
      width * 0.68,
      height * 0.72,
    )
    const border = borderMean(data, width, height)
    const score = center - border

    if (!best || score > best.score) {
      best = { data, width, height, score }
    }
  }

  if (!best) {
    throw new MattingError('mask', '模型没有返回人像蒙版')
  }

  // 单通道模型可能输出背景概率，用「中心比边缘更亮」判断是否需要取反。
  if (best.score < 0) {
    const inverted = new Float32Array(best.data.length)
    for (let index = 0; index < best.data.length; index += 1) {
      inverted[index] = 1 - best.data[index]
    }
    return { data: inverted, width: best.width, height: best.height }
  }

  return { data: best.data, width: best.width, height: best.height }
}

function alphaFromMaskValue(value: number): number {
  const t = Math.min(
    1,
    Math.max(0, (value - ALPHA_LOW) / (ALPHA_HIGH - ALPHA_LOW)),
  )
  return t * t * (3 - 2 * t)
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob)
      } else {
        reject(new MattingError('canvas', '透明图导出失败'))
      }
    }, 'image/png')
  })
}

async function composeCutout(
  image: HTMLImageElement,
  mask: { data: Float32Array; width: number; height: number },
) {
  const { width, height } = fitSize(image)

  const maskCanvas = document.createElement('canvas')
  maskCanvas.width = mask.width
  maskCanvas.height = mask.height
  const maskContext = getContext(maskCanvas)
  const maskImage = maskContext.createImageData(mask.width, mask.height)

  for (let index = 0; index < mask.data.length; index += 1) {
    const offset = index * 4
    maskImage.data[offset] = 255
    maskImage.data[offset + 1] = 255
    maskImage.data[offset + 2] = 255
    maskImage.data[offset + 3] = Math.round(
      alphaFromMaskValue(mask.data[index]) * 255,
    )
  }
  maskContext.putImageData(maskImage, 0, 0)

  const alphaCanvas = document.createElement('canvas')
  alphaCanvas.width = width
  alphaCanvas.height = height
  const alphaContext = getContext(alphaCanvas)
  alphaContext.imageSmoothingEnabled = true
  alphaContext.imageSmoothingQuality = 'high'
  alphaContext.drawImage(maskCanvas, 0, 0, width, height)

  const output = document.createElement('canvas')
  output.width = width
  output.height = height
  const outputContext = getContext(output)
  outputContext.drawImage(image, 0, 0, width, height)
  outputContext.globalCompositeOperation = 'destination-in'
  outputContext.drawImage(alphaCanvas, 0, 0)
  outputContext.globalCompositeOperation = 'source-over'

  const blob = await canvasToBlob(output)
  return { blob, width, height }
}

interface BackgroundSwatch {
  r: number
  g: number
  b: number
}

function sampleCornerSwatches(
  data: Uint8ClampedArray,
  width: number,
  height: number,
): BackgroundSwatch[] {
  const patch = Math.min(
    24,
    Math.max(4, Math.round(Math.min(width, height) * 0.02)),
  )
  const corners = [
    [0, 0],
    [width - patch, 0],
    [0, height - patch],
    [width - patch, height - patch],
  ]

  return corners.map(([left, top]) => {
    let r = 0
    let g = 0
    let b = 0
    let count = 0

    for (let y = top; y < top + patch; y += 1) {
      for (let x = left; x < left + patch; x += 1) {
        const offset = (y * width + x) * 4
        r += data[offset]
        g += data[offset + 1]
        b += data[offset + 2]
        count += 1
      }
    }

    return { r: r / count, g: g / count, b: b / count }
  })
}

function buildBackgroundMask(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  swatches: BackgroundSwatch[],
  tolerance: number,
): Uint8Array {
  const total = width * height
  const candidates = new Uint8Array(total)

  for (let index = 0; index < total; index += 1) {
    const offset = index * 4
    const r = pixels[offset]
    const g = pixels[offset + 1]
    const b = pixels[offset + 2]

    let distance = Number.POSITIVE_INFINITY
    for (const swatch of swatches) {
      const dr = r - swatch.r
      const dg = g - swatch.g
      const db = b - swatch.b
      const candidate = Math.sqrt(dr * dr + dg * dg + db * db)
      if (candidate < distance) distance = candidate
    }

    if (distance <= tolerance) candidates[index] = 1
  }

  const connected = new Uint8Array(total)
  const queue = new Int32Array(total)
  let head = 0
  let tail = 0

  const enqueue = (index: number) => {
    if (candidates[index] === 1 && connected[index] === 0) {
      connected[index] = 1
      queue[tail] = index
      tail += 1
    }
  }

  for (let x = 0; x < width; x += 1) {
    enqueue(x)
    enqueue((height - 1) * width + x)
  }
  for (let y = 1; y < height - 1; y += 1) {
    enqueue(y * width)
    enqueue(y * width + width - 1)
  }

  while (head < tail) {
    const index = queue[head]
    head += 1
    const x = index % width

    if (x > 0) enqueue(index - 1)
    if (x < width - 1) enqueue(index + 1)
    if (index >= width) enqueue(index - width)
    if (index < total - width) enqueue(index + width)
  }

  return connected
}

async function runQuickCutout(previewUrl: string) {
  const image = await loadImage(previewUrl)
  const { width, height } = fitSize(image)

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = getContext(canvas)
  context.drawImage(image, 0, 0, width, height)

  const imageData = context.getImageData(0, 0, width, height)
  const swatches = sampleCornerSwatches(imageData.data, width, height)
  // 只移除与画面边缘连通的背景，避免浅色衣服等内部相近色被误删。
  const backgroundMask = buildBackgroundMask(
    imageData.data,
    width,
    height,
    swatches,
    38,
  )

  const maskCanvas = document.createElement('canvas')
  maskCanvas.width = width
  maskCanvas.height = height
  const maskContext = getContext(maskCanvas)
  const maskImage = maskContext.createImageData(width, height)

  for (let index = 0; index < backgroundMask.length; index += 1) {
    const offset = index * 4
    maskImage.data[offset] = 255
    maskImage.data[offset + 1] = 255
    maskImage.data[offset + 2] = 255
    maskImage.data[offset + 3] = backgroundMask[index] === 1 ? 0 : 255
  }
  maskContext.putImageData(maskImage, 0, 0)

  const alphaCanvas = document.createElement('canvas')
  alphaCanvas.width = width
  alphaCanvas.height = height
  const alphaContext = getContext(alphaCanvas)
  alphaContext.filter = 'blur(0.8px)'
  alphaContext.drawImage(maskCanvas, 0, 0)

  const output = document.createElement('canvas')
  output.width = width
  output.height = height
  const outputContext = getContext(output)
  outputContext.drawImage(image, 0, 0, width, height)
  outputContext.globalCompositeOperation = 'destination-in'
  outputContext.drawImage(alphaCanvas, 0, 0)
  outputContext.globalCompositeOperation = 'source-over'

  const blob = await canvasToBlob(output)
  return { blob, width, height }
}

function finalize(
  blob: Blob,
  width: number,
  height: number,
  mode: MatteMode,
  startedAt: number,
): CutoutResult {
  return {
    url: URL.createObjectURL(blob),
    blob,
    width,
    height,
    mode,
    durationMs: Math.max(0, Math.round(performance.now() - startedAt)),
  }
}

export async function runMatting(
  previewUrl: string,
  mode: MatteMode,
  options: RunMattingOptions = {},
): Promise<CutoutResult> {
  const { onProgress, signal } = options
  const startedAt = performance.now()

  throwIfAborted(signal)

  if (mode === 'quick') {
    onProgress?.('compositing')
    await nextPaint()
    throwIfAborted(signal)

    const { blob, width, height } = await runQuickCutout(previewUrl)
    throwIfAborted(signal)
    return finalize(blob, width, height, 'quick', startedAt)
  }

  onProgress?.('loading')
  const segmenter = await loadSegmenter()
  throwIfAborted(signal)

  onProgress?.('segmenting')
  await nextPaint()

  const image = await loadImage(previewUrl)
  throwIfAborted(signal)

  let mask: { data: Float32Array; width: number; height: number }
  let result: ImageSegmenterResult
  try {
    result = segmenter.segment(image)
  } catch (error) {
    throw new MattingError('segmenter', '人像分割失败', { cause: error })
  }

  try {
    mask = extractPersonMask(result)
  } finally {
    result.close()
  }
  throwIfAborted(signal)

  onProgress?.('compositing')
  await nextPaint()

  const { blob, width, height } = await composeCutout(image, mask)
  throwIfAborted(signal)

  return finalize(blob, width, height, 'ai', startedAt)
}
