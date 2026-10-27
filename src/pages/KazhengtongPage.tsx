import { useCallback, useEffect, useRef, useState } from 'react'
import { AppFooter } from '../components/AppFooter'
import { MattePanel } from '../components/MattePanel'
import { PhotoPreview } from '../components/PhotoPreview'
import { SpecPanel } from '../components/SpecPanel'
import { StepIndicator } from '../components/StepIndicator'
import { UploadPanel } from '../components/UploadPanel'
import {
  ArrowLeftIcon,
  IdCardIcon,
  ShieldIcon,
} from '../components/icons'
import { readImageSize, validateFile } from '../lib/files'
import type { CutoutResult } from '../lib/matting'
import type { SpecSelection } from '../lib/specs'
import type { UploadedPhoto } from '../types'

type ToolView = 'preview' | 'matte' | 'spec'

export function KazhengtongPage() {
  const [photo, setPhoto] = useState<UploadedPhoto | null>(null)
  const [cutout, setCutout] = useState<CutoutResult | null>(null)
  const [view, setView] = useState<ToolView>('preview')
  const [error, setError] = useState<string | null>(null)
  const [isReading, setIsReading] = useState(false)
  const [specSelection, setSpecSelection] = useState<SpecSelection | null>(null)
  const [compliant, setCompliant] = useState(false)
  const [reviewing, setReviewing] = useState(false)

  const photoRef = useRef<UploadedPhoto | null>(null)
  const cutoutRef = useRef<CutoutResult | null>(null)
  const readTokenRef = useRef(0)

  useEffect(() => {
    return () => {
      if (photoRef.current) URL.revokeObjectURL(photoRef.current.previewUrl)
      if (cutoutRef.current) URL.revokeObjectURL(cutoutRef.current.url)
    }
  }, [])

  const clearCutout = useCallback(() => {
    const previous = cutoutRef.current
    cutoutRef.current = null
    setCutout(null)
    if (previous) URL.revokeObjectURL(previous.url)
  }, [])

  const handleSelect = useCallback(
    async (file: File) => {
      setError(null)

      const validation = validateFile(file)
      if (!validation.ok) {
        setError(validation.reason)
        return
      }

      const token = readTokenRef.current + 1
      readTokenRef.current = token
      setIsReading(true)

      const previewUrl = URL.createObjectURL(file)
      try {
        const { width, height } = await readImageSize(previewUrl)
        if (token !== readTokenRef.current) {
          URL.revokeObjectURL(previewUrl)
          return
        }

        const previous = photoRef.current
        const next: UploadedPhoto = { file, previewUrl, width, height }
        photoRef.current = next
        setPhoto(next)
        setView('preview')
        setCompliant(false)
        setReviewing(false)
        clearCutout()
        if (previous) URL.revokeObjectURL(previous.previewUrl)
      } catch {
        URL.revokeObjectURL(previewUrl)
        if (token === readTokenRef.current) {
          setError('无法读取这张照片，请换一张 JPG / PNG 图片重试。')
        }
      } finally {
        if (token === readTokenRef.current) setIsReading(false)
      }
    },
    [clearCutout],
  )

  const handleMatteResult = useCallback((next: CutoutResult) => {
    const previous = cutoutRef.current
    cutoutRef.current = next
    setCutout(next)
    setCompliant(false)
    setReviewing(false)
    if (previous) URL.revokeObjectURL(previous.url)
  }, [])

  const handleReset = useCallback(() => {
    readTokenRef.current += 1
    const previous = photoRef.current
    photoRef.current = null
    setPhoto(null)
    setView('preview')
    setError(null)
    setIsReading(false)
    setCompliant(false)
    setReviewing(false)
    clearCutout()
    if (previous) URL.revokeObjectURL(previous.previewUrl)
  }, [clearCutout])

  const handleRestart = useCallback(() => {
    handleReset()
    window.scrollTo(0, 0)
  }, [handleReset])

  const currentStep = !photo
    ? 1
    : view === 'spec'
      ? compliant && reviewing
        ? 4
        : 3
      : 2

  return (
    <div className="app app--kzt">
      <div className="tool-nav">
        <a className="back-link" href="#/">
          <ArrowLeftIcon />
          校园工具箱
        </a>
        <span className="privacy-pill">
          <ShieldIcon />
          本地处理 · 照片不上传
        </span>
      </div>

      <header className="app-header">
        <div className="brand">
          <span className="brand__mark">
            <IdCardIcon />
          </span>
          <div>
            <h1 className="brand__title">卡证通</h1>
            <p className="brand__subtitle">校园证件照智能采集与合规检测</p>
          </div>
        </div>
      </header>

      <main className="app-main">
        <StepIndicator current={currentStep} />

        {photo ? (
          view === 'matte' ? (
            <MattePanel
              photo={photo}
              result={cutout}
              onResult={handleMatteResult}
              onBack={() => setView('preview')}
              onContinue={() => {
                setCompliant(false)
                setReviewing(false)
                setView('spec')
                window.scrollTo(0, 0)
              }}
            />
          ) : view === 'spec' && cutout ? (
            <SpecPanel
              cutout={cutout}
              initialSelection={specSelection}
              onSelectionChange={setSpecSelection}
              onComplianceChange={setCompliant}
              onReviewChange={setReviewing}
              onBack={() => {
                setReviewing(false)
                setView('matte')
              }}
              onRestart={handleRestart}
            />
          ) : (
            <PhotoPreview
              photo={photo}
              onContinue={() => setView('matte')}
              onReset={handleReset}
            />
          )
        ) : (
          <UploadPanel
            error={error}
            isReading={isReading}
            onSelect={handleSelect}
          />
        )}

        {view === 'preview' && (
          <section className="tips" aria-labelledby="tips-title">
            <h2 className="tips__title" id="tips-title">
              拍摄建议
            </h2>
            <ul>
              <li>纯色或简洁背景，光线均匀，避免逆光和大面积阴影</li>
              <li>正对镜头、免冠、五官清晰，头部居中并露出双肩</li>
              <li>关闭美颜与滤镜，保留真实面部细节</li>
            </ul>
          </section>
        )}
      </main>

      <AppFooter message="所有处理均在浏览器本地完成，照片不会上传服务器" />
    </div>
  )
}
