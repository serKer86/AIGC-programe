import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type KeyboardEvent,
} from 'react'
import { AppFooter } from '../components/AppFooter'
import {
  AlertIcon,
  ArrowLeftIcon,
  ShrinkIcon,
  DownloadIcon,
  ShieldIcon,
  UploadIcon,
} from '../components/icons'
import {
  buildOutputName,
  compressImage,
  supportsWebP,
  type CompressFormat,
  type CompressResult,
} from '../lib/compress'
import { formatBytes, validateFile } from '../lib/files'

type ItemStatus = 'queued' | 'working' | 'done' | 'failed'

interface CompressItem {
  id: string
  file: File
  status: ItemStatus
  result: CompressResult | null
  error: string | null
}

const MAX_ITEMS = 20
const KB_PRESETS = [100, 200, 500, 1024]
const EDGE_OPTIONS: { label: string; value: string }[] = [
  { label: '不限制', value: '0' },
  { label: '最长边 2560 px', value: '2560' },
  { label: '最长边 1920 px', value: '1920' },
  { label: '最长边 1600 px', value: '1600' },
  { label: '最长边 1200 px', value: '1200' },
]

function createId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `item-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

export function CompressPage() {
  const [items, setItems] = useState<CompressItem[]>([])
  const [kbText, setKbText] = useState('100')
  const [format, setFormat] = useState<CompressFormat>('image/jpeg')
  const [maxEdgeText, setMaxEdgeText] = useState('1920')
  const [error, setError] = useState<string | null>(null)
  const [isRunning, setIsRunning] = useState(false)
  const [isDragging, setIsDragging] = useState(false)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const itemsRef = useRef<CompressItem[]>([])
  const abortRef = useRef<AbortController | null>(null)

  const syncItems = useCallback((next: CompressItem[]) => {
    itemsRef.current = next
    setItems(next)
  }, [])

  useEffect(() => {
    return () => {
      for (const item of itemsRef.current) {
        if (item.result) URL.revokeObjectURL(item.result.url)
      }
    }
  }, [])

  const patchItem = useCallback(
    (id: string, patch: Partial<CompressItem>) => {
      const next = itemsRef.current.map((item) => {
        if (item.id !== id) return item
        if (item.result && patch.result && patch.result !== item.result) {
          URL.revokeObjectURL(item.result.url)
        }
        return { ...item, ...patch }
      })
      syncItems(next)
    },
    [syncItems],
  )

  const addFiles = useCallback(
    (fileList: FileList) => {
      setError(null)
      const incoming = Array.from(fileList)
      const room = MAX_ITEMS - itemsRef.current.length
      if (room <= 0) {
        setError(`一次最多处理 ${MAX_ITEMS} 张，请先清空列表。`)
        return
      }

      const accepted: CompressItem[] = []
      let rejected: string | null = null

      for (const file of incoming.slice(0, room)) {
        const validation = validateFile(file)
        if (!validation.ok) {
          rejected = validation.reason
          continue
        }
        accepted.push({ id: createId(), file, status: 'queued', result: null, error: null })
      }

      if (incoming.length > room) {
        rejected = `一次最多 ${MAX_ITEMS} 张，超出部分已忽略。`
      }

      if (accepted.length) syncItems([...itemsRef.current, ...accepted])
      if (rejected) setError(rejected)
    },
    [syncItems],
  )

  const handleInput = (event: ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files
    if (files && files.length) addFiles(files)
    event.target.value = ''
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      fileInputRef.current?.click()
    }
  }

  const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    setIsDragging(true)
  }

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    setIsDragging(false)
    if (event.dataTransfer.files?.length) addFiles(event.dataTransfer.files)
  }

  const removeItem = (id: string) => {
    const target = itemsRef.current.find((item) => item.id === id)
    if (target?.result) URL.revokeObjectURL(target.result.url)
    syncItems(itemsRef.current.filter((item) => item.id !== id))
  }

  const clearAll = () => {
    abortRef.current?.abort()
    for (const item of itemsRef.current) {
      if (item.result) URL.revokeObjectURL(item.result.url)
    }
    syncItems([])
    setError(null)
  }

  const parsedKB = Math.round(Number(kbText))
  const isValidKB = Number.isFinite(parsedKB) && parsedKB >= 5 && parsedKB <= 4096

  const runQueue = async () => {
    setError(null)
    if (!isValidKB) {
      setError('目标体积请填写 5 到 4096 之间的整数 KB。')
      return
    }

    const maxEdgeValue = Number(maxEdgeText)
    const targets = itemsRef.current.filter(
      (item) => item.status === 'queued' || item.status === 'failed',
    )
    if (!targets.length) return

    const controller = new AbortController()
    abortRef.current = controller
    setIsRunning(true)

    for (const item of targets) {
      if (controller.signal.aborted) break
      patchItem(item.id, { status: 'working', error: null })
      try {
        const result = await compressImage(item.file, {
          maxKB: parsedKB,
          format,
          maxEdge: maxEdgeValue > 0 ? maxEdgeValue : null,
          signal: controller.signal,
        })
        patchItem(item.id, { status: 'done', result, error: null })
      } catch (cause) {
        if (cause instanceof DOMException && cause.name === 'AbortError') {
          patchItem(item.id, { status: 'queued' })
          break
        }
        patchItem(item.id, {
          status: 'failed',
          error: '这张图处理失败，可能已损坏或浏览器无法解码。',
        })
      }
    }

    setIsRunning(false)
    abortRef.current = null
  }

  const downloadAll = () => {
    const done = itemsRef.current.filter((item) => item.status === 'done' && item.result)
    done.forEach((item, index) => {
      window.setTimeout(() => {
        const anchor = document.createElement('a')
        anchor.href = item.result!.url
        anchor.download = buildOutputName(
          item.file.name,
          item.result!.maxKB,
          item.result!.format,
        )
        document.body.append(anchor)
        anchor.click()
        anchor.remove()
      }, index * 350)
    })
  }

  const doneItems = items.filter((item) => item.status === 'done' && item.result)
  const sourceBytes = doneItems.reduce((sum, item) => sum + item.file.size, 0)
  const resultBytes = doneItems.reduce((sum, item) => sum + item.result!.blob.size, 0)
  const savedPercent = sourceBytes > 0 ? Math.round((1 - resultBytes / sourceBytes) * 100) : 0
  const webpUnavailable = format === 'image/webp' && !supportsWebP()

  return (
    <div className="app app--compress">
      <div className="tool-nav">
        <a className="back-link" href="#/">
          <ArrowLeftIcon />
          校园工具箱
        </a>
        <span className="privacy-pill">
          <ShieldIcon />
          本地处理 · 图片不上传
        </span>
      </div>

      <header className="app-header">
        <div className="brand">
          <span className="brand__mark">
            <ShrinkIcon />
          </span>
          <div>
            <h1 className="brand__title">图片压缩</h1>
            <p className="brand__subtitle">批量压到指定 KB，报名与作业附件直接用</p>
          </div>
        </div>
      </header>

      <main className="app-main">
        <section className="card compress-settings" aria-labelledby="compress-settings-title">
          <h2 className="card__title" id="compress-settings-title">
            目标设置
          </h2>

          <div
            className={`dropzone${isDragging ? ' is-dragging' : ''}`}
            role="button"
            tabIndex={0}
            aria-label="选择要压缩的图片，可多选，也可以拖拽到这里"
            onClick={() => fileInputRef.current?.click()}
            onKeyDown={handleKeyDown}
            onDragOver={handleDragOver}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
          >
            <span className="dropzone__icon">
              <UploadIcon />
            </span>
            <p className="dropzone__title">点击选择图片（可多选）</p>
            <p className="dropzone__hint">
              支持 JPG / PNG / JPEG · 单张最大 10 MB · 一次最多 {MAX_ITEMS} 张
            </p>
          </div>

          <input ref={fileInputRef} type="file" accept="image/jpeg,image/png" multiple hidden onChange={handleInput} />

          <div className="field">
            <label className="field__label" htmlFor="compress-kb">
              目标体积上限（KB）
            </label>
            <input
              className="field__input"
              id="compress-kb"
              type="number"
              min={5}
              max={4096}
              step={5}
              inputMode="numeric"
              value={kbText}
              onChange={(event) => setKbText(event.target.value)}
            />
            <div className="chip-row">
              {KB_PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  className={`chip${parsedKB === preset ? ' is-selected' : ''}`}
                  onClick={() => setKbText(String(preset))}
                >
                  {preset >= 1024 ? `${preset / 1024} MB` : `${preset} KB`}
                </button>
              ))}
            </div>
          </div>

          <div className="field-row">
            <div className="field">
              <label className="field__label" htmlFor="compress-format">
                输出格式
              </label>
              <select
                className="field__input"
                id="compress-format"
                value={format}
                onChange={(event) => setFormat(event.target.value as CompressFormat)}
              >
                <option value="image/jpeg">JPG（兼容性最好）</option>
                <option value="image/webp">WebP（体积更小）</option>
              </select>
            </div>
            <div className="field">
              <label className="field__label" htmlFor="compress-edge">
                尺寸上限
              </label>
              <select
                className="field__input"
                id="compress-edge"
                value={maxEdgeText}
                onChange={(event) => setMaxEdgeText(event.target.value)}
              >
                {EDGE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {webpUnavailable && (
            <p className="note">
              当前浏览器不支持 WebP 编码，选择 WebP 时会自动改用 JPG。
            </p>
          )}

          <div className="upload-actions">
            <button
              type="button"
              className="btn btn--primary"
              onClick={runQueue}
              disabled={isRunning || !items.some((item) => item.status !== 'done')}
            >
              {isRunning ? '正在压缩…' : '开始压缩'}
            </button>
            {isRunning ? (
              <button type="button" className="btn btn--ghost" onClick={() => abortRef.current?.abort()}>
                取消
              </button>
            ) : (
              <button type="button" className="btn btn--ghost" onClick={clearAll} disabled={!items.length}>
                清空列表
              </button>
            )}
          </div>

          <div aria-live="polite">
            {error && (
              <p className="form-error" role="alert">
                <AlertIcon />
                <span>{error}</span>
              </p>
            )}
          </div>
        </section>

        <section className="card compress-queue" aria-labelledby="compress-queue-title">
          <div className="card__head">
            <h2 className="card__title" id="compress-queue-title">
              处理队列
            </h2>
            <span className="section-head__meta">
              {items.length ? `${doneItems.length} / ${items.length} 完成` : '暂无图片'}
            </span>
          </div>

          {!items.length ? (
            <div className="empty-state">
              <span className="empty-state__icon">
                <UploadIcon />
              </span>
              <p className="empty-state__title">队列里还没有图片</p>
              <p className="empty-state__text">
                在左边选好图片后点「开始压缩」，每张图会从原始体积压到目标上限以内，压不到时会在队列里标出来。
              </p>
            </div>
          ) : (
            <>
              <ul className="compress-list">
                {items.map((item) => (
                  <li key={item.id} className={`compress-row compress-row--${item.status}`}>
                    <span className="compress-row__main">
                      <span className="compress-row__name">{item.file.name}</span>
                      <span className="compress-row__meta">
                        {item.status === 'queued' && `等待中 · ${formatBytes(item.file.size)}`}
                        {item.status === 'working' && '正在压缩…'}
                        {item.status === 'failed' && (item.error ?? '处理失败')}
                        {item.status === 'done' && item.result && (
                          <>
                            {formatBytes(item.file.size)} →{' '}
                            <strong>{formatBytes(item.result.blob.size)}</strong> ·{' '}
                            {item.result.width}×{item.result.height} ·{' '}
                            {item.result.format === 'image/webp' ? 'WebP' : 'JPG'} · 质量{' '}
                            {Math.round(item.result.quality * 100)}
                            {!item.result.withinTarget && ' · 未能压到上限'}
                          </>
                        )}
                      </span>
                    </span>
                    <span className="compress-row__actions">
                      {item.status === 'done' && item.result && (
                        <a
                          className="btn btn--primary btn--sm"
                          href={item.result.url}
                          download={buildOutputName(
                            item.file.name,
                            item.result.maxKB,
                            item.result.format,
                          )}
                        >
                          <DownloadIcon />
                          下载
                        </a>
                      )}
                      <button
                        type="button"
                        className="btn btn--ghost btn--sm"
                        onClick={() => removeItem(item.id)}
                        disabled={item.status === 'working'}
                      >
                        移除
                      </button>
                    </span>
                  </li>
                ))}
              </ul>

              {doneItems.length > 0 && (
                <div className="compress-summary">
                  <span>
                    共 {doneItems.length} 张：{formatBytes(sourceBytes)} → {formatBytes(resultBytes)}
                    {savedPercent > 0 ? `，减少 ${savedPercent}%` : ''}
                  </span>
                  <button
                    type="button"
                    className="btn btn--ghost btn--sm"
                    onClick={downloadAll}
                    disabled={doneItems.length < 2}
                  >
                    <DownloadIcon />
                    全部下载
                  </button>
                </div>
              )}
            </>
          )}
        </section>

        <section className="tips" aria-labelledby="compress-tips-title">
          <h2 className="tips__title" id="compress-tips-title">
            使用说明
          </h2>
          <ul>
            <li>先降质量再缩尺寸，压到上限后停止，画质尽量保住</li>
            <li>报名系统要求「小于 100 KB」时填 100，要求「不小于 20 KB」时把上限调大即可</li>
            <li>PNG 透明图转 JPG 会用白底填充，需要保留透明请选 WebP</li>
            <li>连续下载多张时浏览器可能询问是否允许，选择允许即可</li>
          </ul>
        </section>
      </main>

      <AppFooter message="所有压缩均在浏览器本地完成，图片不会上传服务器" />
    </div>
  )
}
