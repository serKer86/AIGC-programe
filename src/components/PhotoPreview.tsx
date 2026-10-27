import { describeFormat, formatBytes } from '../lib/files'
import type { UploadedPhoto } from '../types'
import { CheckIcon } from './icons'

interface PhotoPreviewProps {
  photo: UploadedPhoto
  onContinue: () => void
  onReset: () => void
}

export function PhotoPreview({
  photo,
  onContinue,
  onReset,
}: PhotoPreviewProps) {
  return (
    <section className="card kzt-preview" aria-labelledby="preview-title">
      <div className="card__head">
        <h2 className="card__title" id="preview-title">
          照片预览
        </h2>
        <span className="tag tag--ok">
          <CheckIcon />
          已读取
        </span>
      </div>

      <div className="photo-frame">
        <img src={photo.previewUrl} alt="已选择的人像照片预览" />
      </div>

      <dl className="meta-list">
        <div>
          <dt>文件名</dt>
          <dd title={photo.file.name}>{photo.file.name}</dd>
        </div>
        <div>
          <dt>尺寸</dt>
          <dd>
            {photo.width} × {photo.height} px
          </dd>
        </div>
        <div>
          <dt>大小</dt>
          <dd>{formatBytes(photo.file.size)}</dd>
        </div>
        <div>
          <dt>格式</dt>
          <dd>{describeFormat(photo.file)}</dd>
        </div>
      </dl>

      <div className="preview-actions">
        <button
          type="button"
          className="btn btn--primary"
          onClick={onContinue}
        >
          继续：人像抠图
        </button>
        <button type="button" className="btn btn--ghost" onClick={onReset}>
          重新选择
        </button>
      </div>

      <p className="note">
        确认照片清晰、人像完整后，将在本机完成人像抠图，照片不会上传。
      </p>
    </section>
  )
}
