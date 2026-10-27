import { useEffect, useState } from 'react'
import { formatBytes } from '../lib/files'
import {
  MattingError,
  runMatting,
  type CutoutResult,
  type MatteMode,
  type MatteProgress,
} from '../lib/matting'
import type { UploadedPhoto } from '../types'
import {
  AlertIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
  CheckIcon,
  RefreshIcon,
  ShieldIcon,
} from './icons'

interface MattePanelProps {
  photo: UploadedPhoto
  result: CutoutResult | null
  onResult: (result: CutoutResult) => void
  onBack: () => void
  onContinue: () => void
}

type Phase = MatteProgress | 'done' | 'error'

interface RunRequest {
  mode: MatteMode
  id: number
}

interface ErrorInfo {
  title: string
  message: string
}

const PROGRESS_COPY: Record<MatteProgress, { title: string; hint: string }> = {
  loading: {
    title: '正在加载本地 AI 模型',
    hint: '首次使用需加载约 13 MB 模型，之后会使用浏览器缓存。照片不会上传。',
  },
  segmenting: {
    title: '正在识别人像轮廓',
    hint: 'AI 模型在浏览器本机运行，通常需要 1–3 秒。',
  },
  compositing: {
    title: '正在生成透明背景',
    hint: '正在合成人像边缘，马上就好。',
  },
}

const QUICK_COPY = {
  title: '正在按背景色分离人像',
  hint: '不依赖 AI 模型，适合白墙、蓝底等纯色背景。',
}

function describeError(error: unknown): ErrorInfo {
  if (error instanceof MattingError) {
    if (error.code === 'segmenter') {
      return {
        title: 'AI 抠图未能完成',
        message:
          '本地模型加载或推理失败，可能是浏览器不支持 WebGL / WASM。可以重试，或改用快速抠图。',
      }
    }
    if (error.code === 'mask') {
      return {
        title: '没有识别到清晰人像',
        message:
          '请换一张人像完整、背景简洁的照片再试，也可以使用快速抠图。',
      }
    }
    return {
      title: '照片处理失败',
      message: '请换一张 JPG / PNG 照片重试。',
    }
  }
  return {
    title: '抠图没有完成',
    message: '发生未知错误，请重试或换一张照片。',
  }
}

function formatDuration(durationMs: number) {
  return `${(Math.max(100, durationMs) / 1000).toFixed(1)} 秒`
}

export function MattePanel({
  photo,
  result,
  onResult,
  onBack,
  onContinue,
}: MattePanelProps) {
  const [request, setRequest] = useState<RunRequest | null>(
    result ? null : { mode: 'ai', id: 0 },
  )
  const [phase, setPhase] = useState<Phase>(result ? 'done' : 'loading')
  const [errorInfo, setErrorInfo] = useState<ErrorInfo | null>(null)

  useEffect(() => {
    if (!request) return

    const controller = new AbortController()
    const { signal } = controller

    runMatting(photo.previewUrl, request.mode, {
      signal,
      onProgress: (stage) => {
        if (!signal.aborted) setPhase(stage)
      },
    })
      .then((next) => {
        if (signal.aborted) {
          URL.revokeObjectURL(next.url)
          return
        }

        onResult(next)
        setPhase('done')
        setErrorInfo(null)
      })
      .catch((error: unknown) => {
        if (signal.aborted) return
        setErrorInfo(describeError(error))
        setPhase('error')
      })

    return () => controller.abort()
  }, [photo.previewUrl, request, onResult])

  const busy =
    phase === 'loading' || phase === 'segmenting' || phase === 'compositing'

  const progressCopy = busy
    ? request?.mode === 'quick'
      ? QUICK_COPY
      : PROGRESS_COPY[phase as MatteProgress]
    : null

  const retry = (mode: MatteMode) => {
    if (busy) return
    setErrorInfo(null)
    setPhase(mode === 'quick' ? 'compositing' : 'loading')
    setRequest((previous) => ({
      mode,
      id: (previous?.id ?? 0) + 1,
    }))
  }

  return (
    <section className="card kzt-matte" aria-labelledby="matte-title">
      <div className="card__head">
        <h2 className="card__title" id="matte-title">
          人像抠图
        </h2>
        {phase === 'done' && result && (
          <span className="tag tag--ok">
            <CheckIcon />
            透明背景
          </span>
        )}
        {busy && (
          <span className="tag tag--info">
            <ShieldIcon />
            本地处理
          </span>
        )}
        {phase === 'error' && (
          <span className="tag tag--error">
            <AlertIcon />
            未完成
          </span>
        )}
      </div>

      {phase === 'error' && !result ? (
        <div className="matte-error" role="alert">
          <span className="matte-error__icon">
            <AlertIcon />
          </span>
          <p className="matte-error__title">{errorInfo?.title}</p>
          <p className="matte-error__desc">{errorInfo?.message}</p>
        </div>
      ) : (
        <div
          className={`matte-stage ${result ? 'is-result' : 'is-backdrop'}${
            busy ? ' is-busy' : ''
          }`}
        >
          {result ? (
            <img
              className="matte-stage__image"
              src={result.url}
              alt="抠图结果：透明背景人像"
            />
          ) : (
            <img
              className="matte-stage__backdrop"
              src={photo.previewUrl}
              alt="待抠图的人像照片"
            />
          )}

          {busy && progressCopy && (
            <div className="matte-overlay" role="status" aria-live="polite">
              <span className="matte-overlay__spinner" aria-hidden="true" />
              <p className="matte-overlay__title">{progressCopy.title}</p>
              <p className="matte-overlay__hint">{progressCopy.hint}</p>
            </div>
          )}
        </div>
      )}

      {result && (
        <>
          <dl className="meta-list">
            <div>
              <dt>抠图方式</dt>
              <dd>
                {result.mode === 'ai' ? 'AI 人像分割' : '快速背景识别'}
              </dd>
            </div>
            <div>
              <dt>透明图尺寸</dt>
              <dd>
                {result.width} × {result.height} px
              </dd>
            </div>
            <div>
              <dt>文件大小</dt>
              <dd>{formatBytes(result.blob.size)}</dd>
            </div>
            <div>
              <dt>处理耗时</dt>
              <dd>{formatDuration(result.durationMs)}</dd>
            </div>
          </dl>

          {phase === 'error' && errorInfo && (
            <p className="matte-alert" role="alert">
              <AlertIcon />
              {errorInfo.title}，已保留上一次结果。
            </p>
          )}

          <div className="preview-actions">
            <button
              type="button"
              className="btn btn--primary"
              onClick={onContinue}
              disabled={busy}
            >
              继续：选择规格
              <ArrowRightIcon />
            </button>
            <button
              type="button"
              className="btn btn--ghost"
              onClick={() => retry('ai')}
              disabled={busy}
            >
              <RefreshIcon />
              重新抠图
            </button>
          </div>

          <p className="note">
            棋盘格代表透明区域。
            {result.mode === 'ai'
              ? '下一步可选择规格、底色，并生成可下载的 JPG。'
              : '快速模式适合纯色背景，发丝等细节可能不如 AI 抠图。'}
          </p>
        </>
      )}

      {phase === 'error' && !result && (
        <>
          <div className="preview-actions">
            <button
              type="button"
              className="btn btn--primary"
              onClick={() => retry('ai')}
            >
              <RefreshIcon />
              重试 AI 抠图
            </button>
            <button
              type="button"
              className="btn btn--ghost"
              onClick={() => retry('quick')}
            >
              快速抠图（纯色背景）
            </button>
          </div>
          <p className="note">
            快速抠图通过识别照片四角的背景颜色来分离人像，不依赖 AI 模型。
          </p>
        </>
      )}

      <p className="matte-foot">
        <button type="button" className="text-link" onClick={onBack}>
          <ArrowLeftIcon />
          返回上一步
        </button>
      </p>
    </section>
  )
}
