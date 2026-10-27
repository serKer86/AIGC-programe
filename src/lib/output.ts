import type { FaceBox } from './face'
import type {
  SpecBackground,
  SpecPreset,
  SpecSize,
} from './specs'

export interface CropRect {
  x: number
  y: number
  width: number
  height: number
}

export interface SpecOutput {
  url: string
  blob: Blob
  width: number
  height: number
  quality: number
  sizeKB: number
  crop: CropRect
  withinRange: boolean
  belowMinimum: boolean
  createdAt: number
}

export interface GenerateSpecOptions {
  cutoutUrl: string
  face: FaceBox | null
  preset: SpecPreset
  size: SpecSize
  background: SpecBackground
  signal?: AbortSignal
}

const FACE_HEIGHT_RATIO = 0.4
// BlazeFace boxes stop near the forehead, so the crown sits about half a face box higher.
const CROWN_EXTRA = 0.5
const TOP_MARGIN_RATIO = 0.1

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) {
    throw new DOMException('生成已取消', 'AbortError')
  }
}

export function computeCrop(
  sourceWidth: number,
  sourceHeight: number,
  targetWidth: number,
  targetHeight: number,
  face: FaceBox | null,
): CropRect {
  const aspect = targetWidth / targetHeight
  let width: number
  let height: number

  if (face && face.width > 0 && face.height > 0) {
    height = Math.min(sourceHeight, face.height / FACE_HEIGHT_RATIO)
    width = height * aspect
    if (width > sourceWidth) {
      width = sourceWidth
      height = width / aspect
    }
  } else {
    height = sourceHeight
    width = height * aspect
    if (width > sourceWidth) {
      width = sourceWidth
      height = width / aspect
    }
  }

  let x: number
  let y: number

  if (face) {
    const crown = face.y - face.height * CROWN_EXTRA
    x = face.x + face.width / 2 - width / 2
    y = crown - height * TOP_MARGIN_RATIO
  } else {
    x = (sourceWidth - width) / 2
    y = (sourceHeight - height) * 0.2
  }

  x = Math.min(Math.max(0, x), Math.max(0, sourceWidth - width))
  y = Math.min(Math.max(0, y), Math.max(0, sourceHeight - height))

  return { x, y, width, height }
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

function encodeJpeg(
  canvas: HTMLCanvasElement,
  quality: number,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob)
        else reject(new Error('jpeg export failed'))
      },
      'image/jpeg',
      quality,
    )
  })
}

export async function generateSpecOutput({
  cutoutUrl,
  face,
  preset,
  size,
  background,
  signal,
}: GenerateSpecOptions): Promise<SpecOutput> {
  throwIfAborted(signal)
  const image = await loadImage(cutoutUrl)
  throwIfAborted(signal)

  const crop = computeCrop(
    image.naturalWidth,
    image.naturalHeight,
    size.width,
    size.height,
    face,
  )

  const canvas = document.createElement('canvas')
  canvas.width = size.width
  canvas.height = size.height
  const context = canvas.getContext('2d')
  if (!context) {
    throw new Error('canvas unavailable')
  }

  context.fillStyle = background.color
  context.fillRect(0, 0, size.width, size.height)
  context.imageSmoothingEnabled = true
  context.imageSmoothingQuality = 'high'
  context.drawImage(
    image,
    crop.x,
    crop.y,
    crop.width,
    crop.height,
    0,
    0,
    size.width,
    size.height,
  )

  const maxBytes = preset.maxKB * 1024
  const minBytes = preset.minKB * 1024

  let blob = await encodeJpeg(canvas, 1)
  let quality = 1

  if (blob.size > maxBytes) {
    for (let candidateQuality = 0.95; candidateQuality >= 0.3; candidateQuality -= 0.05) {
      throwIfAborted(signal)
      const candidate = await encodeJpeg(canvas, candidateQuality)
      blob = candidate
      quality = candidateQuality
      if (candidate.size <= maxBytes) break
    }
  }

  return {
    url: URL.createObjectURL(blob),
    blob,
    width: size.width,
    height: size.height,
    quality,
    sizeKB: blob.size / 1024,
    crop,
    withinRange: blob.size >= minBytes && blob.size <= maxBytes,
    belowMinimum: blob.size < minBytes,
    createdAt: Date.now(),
  }
}
