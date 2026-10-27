import {
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type KeyboardEvent,
} from 'react'
import { AlbumIcon, AlertIcon, CameraIcon, UploadIcon } from './icons'

interface UploadPanelProps {
  error: string | null
  isReading: boolean
  onSelect: (file: File) => void
}

export function UploadPanel({ error, isReading, onSelect }: UploadPanelProps) {
  const albumInputRef = useRef<HTMLInputElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)
  const [isDragging, setIsDragging] = useState(false)

  const openAlbum = () => albumInputRef.current?.click()

  const handleInput = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (file) onSelect(file)
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      openAlbum()
    }
  }

  const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    setIsDragging(true)
  }

  const handleDragLeave = () => {
    setIsDragging(false)
  }

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    setIsDragging(false)
    const file = event.dataTransfer.files?.[0]
    if (file) onSelect(file)
  }

  return (
    <section className="card kzt-upload" aria-labelledby="upload-title">
      <h2 className="card__title" id="upload-title">
        上传照片
      </h2>
      <p className="card__desc">
        选择一张光线均匀、正面免冠的人像照片，系统会在本机自动完成抠图与合规处理。
      </p>

      <div
        className={`dropzone${isDragging ? ' is-dragging' : ''}`}
        role="button"
        tabIndex={0}
        aria-label="从相册选择照片，也可以将图片拖拽到这里"
        onClick={openAlbum}
        onKeyDown={handleKeyDown}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <span className="dropzone__icon">
          <UploadIcon />
        </span>
        <p className="dropzone__title">点击选择照片</p>
        <p className="dropzone__hint">
          支持 JPG / PNG / JPEG · 最大 10 MB
        </p>
      </div>

      <div className="upload-actions">
        <button type="button" className="btn btn--primary" onClick={openAlbum}>
          <AlbumIcon />
          从相册选择
        </button>
        <button
          type="button"
          className="btn btn--ghost"
          onClick={() => cameraInputRef.current?.click()}
        >
          <CameraIcon />
          拍照
        </button>
      </div>

      <input
        ref={albumInputRef}
        type="file"
        accept="image/jpeg,image/png"
        hidden
        onChange={handleInput}
      />
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/jpeg,image/png"
        capture="environment"
        hidden
        onChange={handleInput}
      />

      <div aria-live="polite">
        {isReading && (
          <p className="form-status">
            <span className="spinner" aria-hidden="true" />
            正在读取照片…
          </p>
        )}
        {error && (
          <p className="form-error" role="alert">
            <AlertIcon />
            <span>{error}</span>
          </p>
        )}
      </div>
    </section>
  )
}
