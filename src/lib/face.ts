import type { FaceDetector } from '@mediapipe/tasks-vision'

export interface FaceBox {
  x: number
  y: number
  width: number
  height: number
}

const WASM_BASE = `${import.meta.env.BASE_URL}wasm`
const MODEL_PATH = `${import.meta.env.BASE_URL}models/blaze_face_short_range.tflite`

let detectorPromise: Promise<FaceDetector> | null = null

async function createDetector(): Promise<FaceDetector> {
  const { FilesetResolver, FaceDetector: FaceDetectorTask } = await import(
    '@mediapipe/tasks-vision'
  )
  const fileset = await FilesetResolver.forVisionTasks(WASM_BASE)

  const build = (delegate: 'GPU' | 'CPU') =>
    FaceDetectorTask.createFromOptions(fileset, {
      baseOptions: {
        modelAssetPath: MODEL_PATH,
        delegate,
      },
      runningMode: 'IMAGE',
      minDetectionConfidence: 0.4,
    })

  try {
    return await build('GPU')
  } catch {
    return build('CPU')
  }
}

function loadDetector(): Promise<FaceDetector> {
  if (!detectorPromise) {
    detectorPromise = createDetector().catch((error: unknown) => {
      detectorPromise = null
      throw error
    })
  }
  return detectorPromise
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

export async function detectCutoutFace(cutoutUrl: string): Promise<FaceBox | null> {
  const image = await loadImage(cutoutUrl)

  const canvas = document.createElement('canvas')
  canvas.width = image.naturalWidth
  canvas.height = image.naturalHeight
  const context = canvas.getContext('2d')
  if (!context) return null

  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, canvas.width, canvas.height)
  context.drawImage(image, 0, 0)

  const detector = await loadDetector()
  const result = detector.detect(canvas)

  let best: FaceBox | null = null
  for (const detection of result.detections) {
    const box = detection.boundingBox
    if (!box || box.width <= 0 || box.height <= 0) continue

    if (!best || box.width * box.height > best.width * best.height) {
      best = {
        x: box.originX,
        y: box.originY,
        width: box.width,
        height: box.height,
      }
    }
  }

  return best
}
