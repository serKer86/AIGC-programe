import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type {
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
} from 'react'

const LONG_PRESS_MS = 320
const MOVE_SLOP = 10
const DRAG_SHIFT = 6
const DRAG_SCALE = 1.02
const FLIP_MS = 180
const EDGE_ZONE = 64
const EDGE_SPEED = 16

interface Press {
  id: string
  element: HTMLElement
  startX: number
  startY: number
  offsetX: number
  offsetY: number
  timer: number
  activated: boolean
  moved: boolean
}

export interface DragSortItemProps {
  ref: (element: HTMLElement | null) => void
  draggingClassName: string
  onPointerDown: (event: ReactPointerEvent<HTMLElement>) => void
  onPointerMove: (event: ReactPointerEvent<HTMLElement>) => void
  onPointerUp: () => void
  onClickCapture: (event: ReactMouseEvent<HTMLElement>) => void
  onContextMenu: (event: ReactMouseEvent<HTMLElement>) => void
}

type ActivationMode = 'long-press' | 'direct'

function prefersReducedMotion(): boolean {
  return (
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}

// 卡片列表比屏幕高，拖到视口上下边缘时代替用户缓慢滚动，否则永远够不到首位
function edgeVelocity(clientY: number): number {
  const height = window.innerHeight
  if (clientY < EDGE_ZONE) return -Math.min(EDGE_SPEED, (EDGE_ZONE - clientY) / 2)
  if (clientY > height - EDGE_ZONE) return Math.min(EDGE_SPEED, (clientY - (height - EDGE_ZONE)) / 2)
  return 0
}

export function useDragSort(
  ids: string[],
  options: {
    enabled: boolean
    activation?: ActivationMode
    onReorder: (next: string[]) => void
    onCommit: (next: string[]) => void
  },
): { isDragging: boolean; getItemProps: (id: string) => DragSortItemProps } {
  const { enabled, activation = 'long-press', onReorder, onCommit } = options

  const elementsRef = useRef(new Map<string, HTMLElement>())
  const refCallbacksRef = useRef(new Map<string, (element: HTMLElement | null) => void>())
  const pressRef = useRef<Press | null>(null)
  const idsRef = useRef(ids)
  const beforeRectsRef = useRef(new Map<string, DOMRect>())
  const suppressClickRef = useRef(false)
  const enabledRef = useRef(enabled)
  const activationRef = useRef(activation)
  const dragIdRef = useRef<string | null>(null)
  const detachRef = useRef<(() => void) | null>(null)
  const detachPendingRef = useRef<(() => void) | null>(null)
  const rebaseRef = useRef<(() => void) | null>(null)
  const pendingCommitRef = useRef(false)
  const [dragId, setDragId] = useState<string | null>(null)

  useEffect(() => {
    enabledRef.current = enabled
  }, [enabled])

  useEffect(() => {
    activationRef.current = activation
  }, [activation])

  const cancelPress = () => {
    const press = pressRef.current
    if (!press || press.activated) return
    window.clearTimeout(press.timer)
    pressRef.current = null
    detachPendingRef.current?.()
    detachPendingRef.current = null
  }

  const targetSlot = (id: string): number => {
    const current = idsRef.current
    const dragged = elementsRef.current.get(id)?.getBoundingClientRect()
    if (!dragged) return -1
    const centerX = dragged.left + dragged.width / 2
    const centerY = dragged.top + dragged.height / 2
    for (const otherId of current) {
      if (otherId === id) continue
      const rect = elementsRef.current.get(otherId)?.getBoundingClientRect()
      if (!rect) continue
      // 用卡片自己的中心判定：越过中线就换，不需要把指针推进邻居卡片内部
      if (
        centerX >= rect.left &&
        centerX <= rect.right &&
        centerY >= rect.top &&
        centerY <= rect.bottom
      ) {
        return current.indexOf(otherId)
      }
    }
    return -1
  }

  const moveTo = (id: string, slot: number): boolean => {
    const current = idsRef.current
    const from = current.indexOf(id)
    if (from === -1 || slot === -1 || slot === from) return false

    const next = current.filter((entry) => entry !== id)
    next.splice(Math.min(Math.max(slot, 0), next.length), 0, id)

    beforeRectsRef.current.clear()
    for (const [entryId, element] of elementsRef.current) {
      if (entryId !== id) beforeRectsRef.current.set(entryId, element.getBoundingClientRect())
    }
    idsRef.current = next
    pendingCommitRef.current = true
    onReorder(next)
    return true
  }

  const endDrag = () => {
    const press = pressRef.current
    detachRef.current?.()
    detachPendingRef.current?.()
    detachPendingRef.current = null
    for (const element of elementsRef.current.values()) {
      element.style.transition = ''
      element.style.transform = ''
    }
    if (press?.activated && press.moved) {
      onCommit(idsRef.current)
      suppressClickRef.current = true
    }
    dragIdRef.current = null
    setDragId(null)
    pressRef.current = null
  }

  const beginDrag = (press: Press) => {
    if (pressRef.current !== press) return
    press.activated = true
    detachPendingRef.current?.()
    detachPendingRef.current = null
    dragIdRef.current = press.id
    setDragId(press.id)

    let clientX = press.startX
    let clientY = press.startY
    let appliedX = 0
    let appliedY = 0
    let velocity = 0
    let frame = 0

    // 位移每次都以元素当前的布局位置重算，网格把卡片挪走一格后卡片才不会停在指针前面
    const paint = () => {
      const rect = press.element.getBoundingClientRect()
      appliedX = clientX - press.offsetX - (rect.left - appliedX)
      appliedY = clientY - press.offsetY - (rect.top - appliedY)
      press.element.style.transition = 'none'
      press.element.style.transform = `translate3d(${appliedX}px, ${appliedY}px, 0) scale(${DRAG_SCALE})`
    }

    // 换位要等 React 提交后网格才真的挪一格，提交前再判定一次会拿着旧矩形把卡片换回原位
    const relocate = () => {
      if (pendingCommitRef.current) return
      if (moveTo(press.id, targetSlot(press.id))) press.moved = true
    }

    const tick = () => {
      if (velocity) {
        window.scrollBy(0, velocity)
        paint()
        relocate()
      }
      frame = requestAnimationFrame(tick)
    }

    const onMove = (event: PointerEvent) => {
      const active = pressRef.current
      // 按钮已经松开（在卡片外松手、切到别的窗口）时立刻收尾，否则鼠标悬停就会带着卡片跑
      if (!active || !event.buttons) {
        endDrag()
        return
      }
      clientX = event.clientX
      clientY = event.clientY
      velocity = edgeVelocity(clientY)
      paint()
      // 只看指针本身走了多远：位移值里含 scale 的补偿量，拿它判定会误伤宽卡片
      if (
        Math.abs(clientX - active.startX) > DRAG_SHIFT ||
        Math.abs(clientY - active.startY) > DRAG_SHIFT
      ) {
        active.moved = true
      }
      relocate()
    }

    // 拖拽期间阻止页面滚动，否则手指上移会被浏览器当成滚动、手势被取消
    const blockScroll = (event: TouchEvent) => {
      if (event.cancelable) event.preventDefault()
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', endDrag)
    window.addEventListener('pointercancel', endDrag)
    document.addEventListener('touchmove', blockScroll, { passive: false })
    frame = requestAnimationFrame(tick)
    rebaseRef.current = paint
    detachRef.current = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', endDrag)
      window.removeEventListener('pointercancel', endDrag)
      document.removeEventListener('touchmove', blockScroll)
      cancelAnimationFrame(frame)
      rebaseRef.current = null
      detachRef.current = null
    }
  }

  useEffect(
    () => () => {
      detachRef.current?.()
      detachPendingRef.current?.()
    },
    [],
  )

  useLayoutEffect(() => {
    pendingCommitRef.current = false
    // 换位提交后立刻按新的布局位置重算位移，否则被拖的卡片会停在旧偏移上跳一格
    rebaseRef.current?.()
    const dragged = dragIdRef.current
    const before = beforeRectsRef.current
    if (!dragged || before.size === 0 || prefersReducedMotion()) return
    beforeRectsRef.current = new Map()
    requestAnimationFrame(() => {
      for (const [id, element] of elementsRef.current) {
        if (id === dragged) continue
        const snapshot = before.get(id)
        if (!snapshot) continue
        const after = element.getBoundingClientRect()
        const dx = snapshot.left - after.left
        const dy = snapshot.top - after.top
        if (Math.abs(dx) < 1 && Math.abs(dy) < 1) continue
        element.style.transition = 'none'
        element.style.transform = `translate3d(${dx}px, ${dy}px, 0)`
        requestAnimationFrame(() => {
          element.style.transition = `transform ${FLIP_MS}ms ease`
          element.style.transform = ''
        })
      }
    })
  }, [ids])

  const getItemProps = (id: string): DragSortItemProps => {
    let attach = refCallbacksRef.current.get(id)
    if (!attach) {
      // <a href> 的原生拖拽会在鼠标移动几像素后接管手势、补发 pointercancel，卡片直接被弹回原位；
      // React 不把 dragstart 代理到 onDragStart，所以挂在元素上
      const blockNativeDrag = (event: DragEvent) => event.preventDefault()
      attach = (element: HTMLElement | null) => {
        if (element) {
          element.addEventListener('dragstart', blockNativeDrag)
          elementsRef.current.set(id, element)
        } else {
          elementsRef.current.delete(id)
        }
      }
      refCallbacksRef.current.set(id, attach)
    }

    return {
      ref: attach,
      draggingClassName: dragId === id ? ' is-dragging' : '',
      onPointerDown: (event) => {
        suppressClickRef.current = false
        if (!enabledRef.current || dragIdRef.current) return
        if (event.pointerType === 'mouse' && event.button !== 0) return
        const rect = event.currentTarget.getBoundingClientRect()
        const press: Press = {
          id,
          element: event.currentTarget,
          startX: event.clientX,
          startY: event.clientY,
          offsetX: event.clientX - rect.left,
          offsetY: event.clientY - rect.top,
          timer: 0,
          activated: false,
          moved: false,
        }
        pressRef.current = press
        const release = () => cancelPress()
        window.addEventListener('pointerup', release)
        window.addEventListener('pointercancel', release)
        window.addEventListener('blur', release)
        detachPendingRef.current = () => {
          window.removeEventListener('pointerup', release)
          window.removeEventListener('pointercancel', release)
          window.removeEventListener('blur', release)
          detachPendingRef.current = null
        }
        if (activationRef.current === 'direct' && event.pointerType === 'mouse') {
          beginDrag(press)
          return
        }
        press.timer = window.setTimeout(() => beginDrag(press), LONG_PRESS_MS)
      },
      onPointerMove: (event) => {
        const press = pressRef.current
        if (!press || press.activated) return
        if (!event.buttons) {
          cancelPress()
          return
        }
        const dx = event.clientX - press.startX
        const dy = event.clientY - press.startY
        if (Math.abs(dx) <= MOVE_SLOP && Math.abs(dy) <= MOVE_SLOP) return
        // 管理模式下卡片已经设了 touch-action:none，任何方向越过阈值都由拖拽接管
        if (activationRef.current === 'direct' && event.pointerType !== 'mouse') {
          beginDrag(press)
          return
        }
        cancelPress()
      },
      onPointerUp: () => {
        cancelPress()
      },
      onClickCapture: (event) => {
        if (!suppressClickRef.current) return
        suppressClickRef.current = false
        event.preventDefault()
        event.stopPropagation()
      },
      onContextMenu: (event) => {
        if (pressRef.current) event.preventDefault()
      },
    }
  }

  return { isDragging: dragId !== null, getItemProps }
}
