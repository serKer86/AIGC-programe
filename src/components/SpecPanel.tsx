import { useEffect, useMemo, useRef, useState } from 'react'
import {
  evaluateCompliance,
  type ComplianceReport,
} from '../lib/compliance'
import { detectCutoutFace, type FaceBox } from '../lib/face'
import { generateSpecOutput, type SpecOutput } from '../lib/output'
import {
  buildDownloadFilename,
  CUSTOM_BACKGROUND_ID,
  customBackground,
  formatSizeRange,
  getSpecPreset,
  resolveSelection,
  selectionForPreset,
  SPEC_PRESETS,
  type SpecPreset,
  type SpecSelection,
} from '../lib/specs'
import type { CutoutResult } from '../lib/matting'
import {
  AlertIcon,
  ArrowLeftIcon,
  CheckIcon,
  DownloadIcon,
  RefreshIcon,
  ShieldIcon,
} from './icons'

interface SpecPanelProps {
  cutout: CutoutResult
  initialSelection: SpecSelection | null
  onSelectionChange: (selection: SpecSelection) => void
  onComplianceChange: (passed: boolean) => void
  onReviewChange: (reviewing: boolean) => void
  onBack: () => void
  onRestart: () => void
}

type Phase = 'processing' | 'ready' | 'error'

export function SpecPanel({
  cutout,
  initialSelection,
  onSelectionChange,
  onComplianceChange,
  onReviewChange,
  onBack,
  onRestart,
}: SpecPanelProps) {
  const [selection, setSelection] = useState<SpecSelection>(() =>
    resolveSelection(initialSelection),
  )
  const [faceBox, setFaceBox] = useState<FaceBox | null>(null)
  const [faceStatus, setFaceStatus] = useState<
    'detecting' | 'detected' | 'unavailable'
  >('detecting')
  const [phase, setPhase] = useState<Phase>('processing')
  const [output, setOutput] = useState<SpecOutput | null>(null)
  const [report, setReport] = useState<ComplianceReport | null>(null)
  const [complianceError, setComplianceError] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [retryTick, setRetryTick] = useState(0)

  const outputRef = useRef<SpecOutput | null>(null)
  const complianceRef = useRef<HTMLElement | null>(null)

  const preset = getSpecPreset(selection.presetId)
  const size =
    preset.sizes.find((item) => item.id === selection.sizeId) ??
    preset.sizes[0]
  const background = useMemo(
    () =>
      selection.backgroundId === CUSTOM_BACKGROUND_ID
        ? customBackground(selection.customColor ?? '#FFFFFF')
        : preset.backgrounds.find((item) => item.id === selection.backgroundId) ??
          preset.backgrounds[0],
    [selection.backgroundId, selection.customColor, preset],
  )

  const selectionRef = useRef(selection)
  useEffect(() => {
    selectionRef.current = selection
  }, [selection])

  const colorTimerRef = useRef<number | null>(null)
  useEffect(() => {
    return () => {
      if (colorTimerRef.current) window.clearTimeout(colorTimerRef.current)
    }
  }, [])

  useEffect(() => {
    return () => {
      if (outputRef.current) URL.revokeObjectURL(outputRef.current.url)
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    detectCutoutFace(cutout.url)
      .then((box) => {
        if (cancelled) return
        setFaceBox(box)
        setFaceStatus(box ? 'detected' : 'unavailable')
      })
      .catch(() => {
        if (!cancelled) setFaceStatus('unavailable')
      })

    return () => {
      cancelled = true
    }
  }, [cutout.url])

  useEffect(() => {
    if (faceStatus === 'detecting') return

    let cancelled = false
    const controller = new AbortController()

    generateSpecOutput({
      cutoutUrl: cutout.url,
      face: faceBox,
      preset,
      size,
      background,
      signal: controller.signal,
    })
      .then((next) => {
        if (cancelled || controller.signal.aborted) {
          URL.revokeObjectURL(next.url)
          return
        }

        const previous = outputRef.current
        outputRef.current = next
        setOutput(next)
        setPhase('ready')
        setReport(null)
        setComplianceError(null)
        setErrorMessage(null)
        onComplianceChange(false)
        if (previous) URL.revokeObjectURL(previous.url)
      })
      .catch((error: unknown) => {
        if (cancelled || controller.signal.aborted) return
        if (error instanceof DOMException && error.name === 'AbortError') return

        const previous = outputRef.current
        outputRef.current = null
        setOutput(null)
        setPhase('error')
        setReport(null)
        setErrorMessage('生成 JPG 时出错，请重试或返回重新抠图。')
        onComplianceChange(false)
        if (previous) URL.revokeObjectURL(previous.url)
      })

    return () => {
      cancelled = true
      controller.abort()
    }
  }, [
    cutout.url,
    preset,
    size,
    background,
    faceStatus,
    faceBox,
    retryTick,
    onComplianceChange,
  ])

  useEffect(() => {
    if (!output || phase !== 'ready') return

    let cancelled = false
    const filename = buildDownloadFilename(preset, output.createdAt)

    evaluateCompliance({ output, preset, size, background, filename })
      .then((next) => {
        if (cancelled) return
        setReport(next)
        setComplianceError(null)
        onComplianceChange(next.passed)
      })
      .catch(() => {
        if (cancelled) return
        setReport(null)
        setComplianceError('合规校验未能完成，请重新生成后再试。')
        onComplianceChange(false)
      })

    return () => {
      cancelled = true
    }
  }, [output, phase, preset, size, background, onComplianceChange])

  useEffect(() => {
    const node = complianceRef.current
    if (!node) return

    const observer = new IntersectionObserver(
      ([entry]) => onReviewChange(entry.isIntersecting),
      { threshold: 0.35 },
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [output, onReviewChange])

  const busy = phase === 'processing' || faceStatus === 'detecting'

  const beginProcessing = () => {
    setPhase('processing')
    setReport(null)
    setComplianceError(null)
    setErrorMessage(null)
    onComplianceChange(false)
  }

  const choosePreset = (next: SpecPreset) => {
    if (next.id === preset.id) return
    beginProcessing()
    const nextSelection = selectionForPreset(next)
    setSelection(nextSelection)
    onSelectionChange(nextSelection)
  }

  const chooseSize = (nextId: string) => {
    if (nextId === size.id) return
    beginProcessing()
    const nextSelection = { ...selection, sizeId: nextId }
    setSelection(nextSelection)
    onSelectionChange(nextSelection)
  }

  const chooseBackground = (nextId: string) => {
    if (nextId === background.id) return
    beginProcessing()
    const nextSelection = { ...selection, backgroundId: nextId }
    setSelection(nextSelection)
    onSelectionChange(nextSelection)
  }

  const handleCustomColor = (event: { target: { value: string } }) => {
    const color = event.target.value
    if (colorTimerRef.current) window.clearTimeout(colorTimerRef.current)
    colorTimerRef.current = window.setTimeout(() => {
      const current = selectionRef.current
      if (
        current.backgroundId === CUSTOM_BACKGROUND_ID &&
        color === current.customColor
      ) {
        return
      }
      beginProcessing()
      const nextSelection = {
        ...current,
        backgroundId: CUSTOM_BACKGROUND_ID,
        customColor: color,
      }
      setSelection(nextSelection)
      onSelectionChange(nextSelection)
    }, 250)
  }

  const retryGeneration = () => {
    setReport(null)
    setComplianceError(null)
    setErrorMessage(null)
    setPhase('processing')
    onComplianceChange(false)
    setRetryTick((tick) => tick + 1)
  }

  const filename = output
    ? buildDownloadFilename(preset, output.createdAt)
    : ''

  const badge = busy ? (
    <span className="tag tag--info">
      <ShieldIcon />
      本机生成
    </span>
  ) : phase === 'error' ? (
    <span className="tag tag--error">
      <AlertIcon />
      生成失败
    </span>
  ) : report?.passed ? (
    <span className="tag tag--ok">
      <CheckIcon />
      全部合规
    </span>
  ) : report ? (
    <span className="tag tag--warn">
      <AlertIcon />
      需调整
    </span>
  ) : output ? (
    <span className="tag tag--info">
      <ShieldIcon />
      校验中
    </span>
  ) : null

  return (
    <section className="card kzt-spec" aria-labelledby="spec-title">
      <div className="card__head">
        <h2 className="card__title" id="spec-title">
          选择规格与底色
        </h2>
        {badge}
      </div>

      <div className="spec-layout">
        <div className="spec-settings">
          <div className="spec-grid" role="group" aria-label="证件照规格">
        {SPEC_PRESETS.map((item) => {
          const selected = item.id === preset.id
          return (
            <button
              key={item.id}
              type="button"
              className={`spec-option${selected ? ' is-selected' : ''}`}
              aria-pressed={selected}
              onClick={() => choosePreset(item)}
            >
              <span className="spec-option__name">{item.name}</span>
              <span className="spec-option__dims">
                {item.sizes
                  .map((option) => `${option.width}×${option.height}`)
                  .join(' / ')}
              </span>
              <span className="spec-option__meta">
                {formatSizeRange(item)} · JPG
              </span>
              {selected && (
                <span className="spec-option__check" aria-hidden="true">
                  <CheckIcon />
                </span>
              )}
            </button>
          )
        })}
      </div>

      {preset.sizes.length > 1 && (
        <div className="spec-field">
          <span className="spec-label">输出尺寸</span>
          <div className="chip-row" role="group" aria-label="输出尺寸">
            {preset.sizes.map((option) => {
              const selected = option.id === size.id
              return (
                <button
                  key={option.id}
                  type="button"
                  className={`chip${selected ? ' is-selected' : ''}`}
                  aria-pressed={selected}
                  onClick={() => chooseSize(option.id)}
                >
                  {option.label}
                </button>
              )
            })}
          </div>
        </div>
      )}

      <div className="spec-field">
        <span className="spec-label">背景底色</span>
        <div className="bg-row" role="group" aria-label="背景底色">
          {preset.backgrounds.map((option) => {
            const selected = option.id === background.id
            return (
              <button
                key={option.id}
                type="button"
                className={`bg-option${selected ? ' is-selected' : ''}`}
                aria-pressed={selected}
                onClick={() => chooseBackground(option.id)}
              >
                <span
                  className="bg-option__swatch"
                  style={{ backgroundColor: option.color }}
                  aria-hidden="true"
                />
                <span>
                  <span className="bg-option__label">{option.label}</span>
                  <span className="bg-option__rgb">{option.color}</span>
                </span>
              </button>
            )
          })}
          <label
            className={`bg-option bg-option--custom${
              background.id === CUSTOM_BACKGROUND_ID ? ' is-selected' : ''
            }`}
          >
            <input
              type="color"
              className="bg-option__native"
              value={selection.customColor ?? '#FFFFFF'}
              onChange={handleCustomColor}
              aria-label="自定义背景底色"
            />
            <span
              className="bg-option__swatch"
              style={{ backgroundColor: selection.customColor ?? '#FFFFFF' }}
              aria-hidden="true"
            />
            <span>
              <span className="bg-option__label">自定义</span>
              <span className="bg-option__rgb">
                {(selection.customColor ?? '#FFFFFF').toUpperCase()}
              </span>
            </span>
          </label>
        </div>
      </div>

          <div className="spec-notes">
            <p className="spec-label">规格说明</p>
            <ul>
              {preset.notes.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
            {preset.compatibility && (
              <p className="spec-compat">{preset.compatibility}</p>
            )}
          </div>
        </div>

        <div className="spec-result">
      <div
        className={`spec-stage ${output ? 'is-result' : 'is-cutout'}${
          busy ? ' is-busy' : ''
        }`}
      >
        {output ? (
          <img
            className="spec-stage__image"
            src={output.url}
            alt={`${preset.name} ${size.width} × ${size.height} 证件照预览`}
          />
        ) : (
          <img
            className="spec-stage__backdrop"
            src={cutout.url}
            alt="待裁剪的透明人像"
          />
        )}

        {busy && (
          <div className="matte-overlay" role="status" aria-live="polite">
            <span className="matte-overlay__spinner" aria-hidden="true" />
            <p className="matte-overlay__title">
              {faceStatus === 'detecting'
                ? '正在识别人脸，准备智能裁剪'
                : '正在生成 JPG'}
            </p>
            <p className="matte-overlay__hint">
              {faceStatus === 'detecting'
                ? '会按人脸位置自动构图，所有计算均在本机完成。'
                : `正在压缩到 ${formatSizeRange(preset)} · ${size.width} × ${size.height} px`}
            </p>
          </div>
        )}
      </div>

      {phase === 'error' && !output && (
        <div className="matte-error" role="alert">
          <span className="matte-error__icon">
            <AlertIcon />
          </span>
          <p className="matte-error__title">JPG 生成失败</p>
          <p className="matte-error__desc">{errorMessage}</p>
        </div>
      )}

      {faceStatus === 'unavailable' && (
        <p className="spec-warning" role="status">
          <AlertIcon />
          未识别到清晰人脸，已按画面中心裁剪。建议返回换一张正脸照片。
        </p>
      )}

      {output && (
        <section
          className="compliance"
          aria-labelledby="compliance-title"
          ref={complianceRef}
        >
          <div className="compliance__head">
            <h3 className="compliance__title" id="compliance-title">
              合规校验
            </h3>
            {report ? (
              <span
                className={`tag ${report.passed ? 'tag--ok' : 'tag--warn'}`}
              >
                {report.passed ? <CheckIcon /> : <AlertIcon />}
                {report.passedCount}/{report.checks.length} 通过
              </span>
            ) : (
              <span className="tag tag--info">校验中</span>
            )}
          </div>

          {report ? (
            <ul className="compliance__list">
              {report.checks.map((item) => (
                <li
                  key={item.id}
                  className={`compliance__item ${
                    item.passed ? 'is-pass' : 'is-fail'
                  }`}
                >
                  <span className="compliance__icon" aria-hidden="true">
                    {item.passed ? <CheckIcon /> : <AlertIcon />}
                  </span>
                  <span className="compliance__body">
                    <span className="compliance__label">{item.label}</span>
                    <span className="compliance__value">{item.value}</span>
                    {!item.passed && item.reason && (
                      <span className="compliance__reason">{item.reason}</span>
                    )}
                  </span>
                  <span className="compliance__state">
                    {item.passed ? '通过' : '不通过'}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="compliance__loading" role="status">
              {complianceError ??
                '正在核对像素、底色、文件大小与格式，结果仅在本机计算…'}
            </p>
          )}

          {report && !report.passed && (
            <p className="compliance__hint">
              调整上方规格或底色后会重新生成并校验；四项全部通过后即可下载。
            </p>
          )}
        </section>
      )}

      {output && (
        <>
          {output.quality < 0.7 && report?.passed && (
            <p className="spec-warning">
              <AlertIcon />
              已采用较高压缩率（质量 {Math.round(output.quality * 100)}
              %），细节可能略有损失。
            </p>
          )}

          <div className="preview-actions">
            {report?.passed ? (
              <a
                className="btn btn--primary"
                href={output.url}
                download={filename}
              >
                <DownloadIcon />
                下载 JPG
              </a>
            ) : (
              <button type="button" className="btn btn--primary" disabled>
                <DownloadIcon />
                全部通过后可下载
              </button>
            )}
            <button type="button" className="btn btn--ghost" onClick={onRestart}>
              <RefreshIcon />
              重新制作
            </button>
          </div>

          <p className="spec-foot">
            <button type="button" className="text-link" onClick={onBack}>
              <ArrowLeftIcon />
              返回上一步调整抠图
            </button>
          </p>

          <p className="note">
            已按人脸位置自动裁剪；JPG 质量 {Math.round(output.quality * 100)}
            %，文件仅在本机生成。
          </p>
        </>
      )}

      {phase === 'error' && !output && (
        <div className="preview-actions">
          <button
            type="button"
            className="btn btn--primary"
            onClick={retryGeneration}
          >
            <RefreshIcon />
            重新生成
          </button>
          <button type="button" className="btn btn--ghost" onClick={onBack}>
            返回重新抠图
          </button>
        </div>
      )}

      {!output && phase !== 'error' && (
        <p className="matte-foot">
          <button type="button" className="text-link" onClick={onBack}>
            <ArrowLeftIcon />
            返回上一步
          </button>
        </p>
      )}
        </div>
      </div>
    </section>
  )
}
