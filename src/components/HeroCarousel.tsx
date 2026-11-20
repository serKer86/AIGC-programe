import { useEffect, useRef, useState } from 'react'
import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from 'react'
import { ArrowRightIcon } from './icons'

export interface HeroSlide {
  id: string
  eyebrow: string
  title: string
  desc: string
  cta: string
  facts: string[]
  path: string
}

const SWIPE_THRESHOLD = 44
const SWIPE_START = 8
const RUBBER_BAND = 3

export function HeroCarousel({ slides }: { slides: HeroSlide[] }) {
  const [index, setIndex] = useState(0)
  const [offset, setOffset] = useState(0)
  const [dragging, setDragging] = useState(false)
  const startRef = useRef({ x: 0, y: 0 })
  const activeRef = useRef(false)
  const suppressClickRef = useRef(false)
  const last = slides.length - 1

  useEffect(() => {
    if (!dragging) return

    const onUp = (event: PointerEvent) => {
      const dx = event.clientX - startRef.current.x
      activeRef.current = false
      setDragging(false)
      setOffset(0)
      if (dx <= -SWIPE_THRESHOLD) setIndex(Math.min(index + 1, last))
      else if (dx >= SWIPE_THRESHOLD) setIndex(Math.max(index - 1, 0))
    }

    const onMove = (event: PointerEvent) => {
      if (!event.buttons) {
        onUp(event)
        return
      }
      const dx = event.clientX - startRef.current.x
      const dy = event.clientY - startRef.current.y
      const edge = (index === 0 && dx > 0) || (index === last && dx < 0)
      setOffset(edge && Math.abs(dx) > Math.abs(dy) ? dx / RUBBER_BAND : dx)
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
    }
  }, [dragging, index, last])

  const handlePointerDown = (event: ReactPointerEvent<HTMLElement>) => {
    suppressClickRef.current = false
    if (event.pointerType === 'mouse' && event.button !== 0) return
    activeRef.current = true
    startRef.current = { x: event.clientX, y: event.clientY }
  }

  const handlePointerMove = (event: ReactPointerEvent<HTMLElement>) => {
    if (!activeRef.current || dragging) return
    const dx = event.clientX - startRef.current.x
    const dy = event.clientY - startRef.current.y
    if (Math.abs(dx) < SWIPE_START || Math.abs(dx) < Math.abs(dy)) return
    suppressClickRef.current = true
    setDragging(true)
  }

  const handleRelease = () => {
    if (!dragging) activeRef.current = false
  }

  const handleClickCapture = (event: ReactMouseEvent<HTMLElement>) => {
    if (!suppressClickRef.current) return
    suppressClickRef.current = false
    event.preventDefault()
    event.stopPropagation()
  }

  return (
    <div className="hero-slot">
      <section
        className="hero hero--carousel"
        aria-label="重点功能"
        aria-roledescription="轮播"
        onKeyDown={(event) => {
          if (event.key === 'ArrowLeft') setIndex(Math.max(index - 1, 0))
          else if (event.key === 'ArrowRight') setIndex(Math.min(index + 1, last))
          else return
          event.preventDefault()
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handleRelease}
        onPointerCancel={handleRelease}
        onPointerLeave={handleRelease}
        onClickCapture={handleClickCapture}
      >
        <div
          className="hero__track"
          style={{
            transform: `translate3d(calc(${-index * 100}% + ${offset}px), 0, 0)`,
            transition: dragging ? 'none' : 'transform 320ms cubic-bezier(0.22, 0.61, 0.36, 1)',
          }}
        >
          {slides.map((slide, position) => {
            const standalone = slide.path.endsWith('.html')
            return (
              <article
                className="hero__slide"
                key={slide.id}
                aria-roledescription="幻灯片"
                aria-label={`${position + 1} / ${slides.length}`}
                aria-hidden={position !== index}
                inert={position !== index}
              >
                <p className="hero__eyebrow">{slide.eyebrow}</p>
                <h2 className="hero__title">{slide.title}</h2>
                <p className="hero__desc">{slide.desc}</p>
                <a
                  className="btn btn--primary hero__cta"
                  href={slide.path}
                  {...(standalone ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                >
                  {slide.cta}
                  <ArrowRightIcon />
                </a>
                <ul className="hero__facts">
                  {slide.facts.map((fact) => (
                    <li key={fact}>{fact}</li>
                  ))}
                </ul>
              </article>
            )
          })}
        </div>

        <span className="hero__index" role="status">
          {`${index + 1}/${slides.length}`}
        </span>
      </section>

      {index > 0 && <span className="hero__peek hero__peek--prev" aria-hidden="true" />}
      {index < last && <span className="hero__peek hero__peek--next" aria-hidden="true" />}
    </div>
  )
}
