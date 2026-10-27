const MAX_FILE_BYTES = 10 * 1024 * 1024
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png']
const ALLOWED_EXTENSIONS = ['jpg', 'jpeg', 'png']

export type FileValidation = { ok: true } | { ok: false; reason: string }

function getExtension(name: string): string {
  const dot = name.lastIndexOf('.')
  return dot === -1 ? '' : name.slice(dot + 1).toLowerCase()
}

function describeType(file: File): string {
  if (file.type) return file.type.replace('image/', '').toUpperCase()
  const extension = getExtension(file.name)
  return extension ? extension.toUpperCase() : '未知格式'
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`
}

export function describeFormat(file: File): string {
  if (file.type === 'image/jpeg') return 'JPEG'
  if (file.type === 'image/png') return 'PNG'
  const extension = getExtension(file.name)
  return extension ? extension.toUpperCase() : '未知'
}

export function validateFile(file: File): FileValidation {
  const extension = getExtension(file.name)
  const isHeic =
    file.type === 'image/heic' ||
    file.type === 'image/heif' ||
    extension === 'heic' ||
    extension === 'heif'

  if (isHeic) {
    return {
      ok: false,
      reason:
        '暂不支持 HEIC 照片。请在手机相机设置中选择「兼容性最佳」，或先转换为 JPG 后再上传。',
    }
  }

  const mimeAllowed = !file.type || ALLOWED_MIME_TYPES.includes(file.type)
  const extensionAllowed = ALLOWED_EXTENSIONS.includes(extension)
  if (!mimeAllowed || !extensionAllowed) {
    return {
      ok: false,
      reason: `仅支持 JPG / PNG / JPEG 格式，当前文件为 ${describeType(file)}。`,
    }
  }

  if (file.size === 0) {
    return { ok: false, reason: '照片内容为空，请重新选择一张图片。' }
  }

  if (file.size > MAX_FILE_BYTES) {
    return {
      ok: false,
      reason: `照片大小 ${formatBytes(file.size)}，超过 10 MB 上限，请压缩或换一张照片。`,
    }
  }

  return { ok: true }
}

export function readImageSize(
  url: string,
): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.decoding = 'async'
    image.onload = () => {
      if (!image.naturalWidth || !image.naturalHeight) {
        reject(new Error('empty image'))
        return
      }
      resolve({ width: image.naturalWidth, height: image.naturalHeight })
    }
    image.onerror = () => reject(new Error('decode failed'))
    image.src = url
  })
}
