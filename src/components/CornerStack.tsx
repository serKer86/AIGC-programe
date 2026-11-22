import { useEffect, useState } from 'react'
import { ArrowUpIcon } from './icons'
import { AboutCornerButton } from './SchoolBrand'

const SHOW_TOP_AFTER = 600

/**
 * 右下角控件组：回到顶部 + 关于本网站。
 * 只在宽屏显示，滚动超过一屏后「回到顶部」才出现。
 */
export function CornerStack() {
  const [showTop, setShowTop] = useState(false)

  useEffect(() => {
    const onScroll = () => {
      setShowTop(window.scrollY > SHOW_TOP_AFTER)
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const backToTop = () => {
    const reduce =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' })
  }

  return (
    <div className="corner-stack">
      {showTop && (
        <button
          type="button"
          className="corner-top"
          onClick={backToTop}
          aria-label="回到顶部"
          title="回到顶部"
        >
          <ArrowUpIcon />
        </button>
      )}
      <AboutCornerButton />
    </div>
  )
}
