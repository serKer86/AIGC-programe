import { useCallback, useEffect, useRef, useState } from 'react'
import { isLocalHost } from '../lib/env'

const POLL_MS = 30_000
const PROBE_TIMEOUT_MS = 5_000
const RECOVER_HINT_MS = 4_000

/**
 * 本机后端心跳：每 30 秒探一次 /api/health，断开时在左下角给出提示。
 * 只在 127.0.0.1 / localhost 下生效——公网版本没有本机后端，不需要提示。
 */
const BACKEND_ROUTES = new Set(['/', '/homework', '/gpa'])

export function BackendBanner({ route }: { route: string }) {
  const enabled = isLocalHost() && BACKEND_ROUTES.has(route)
  const [down, setDown] = useState(false)
  const [checking, setChecking] = useState(false)
  const [dismissed, setDismissed] = useState(false)
  const [recovered, setRecovered] = useState(false)
  const wasDown = useRef(false)
  const recoverTimer = useRef<number | null>(null)

  const probe = useCallback(async () => {
    setChecking(true)
    const controller = new AbortController()
    const timer = window.setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS)
    try {
      const response = await fetch('/api/health', { cache: 'no-store', signal: controller.signal })
      // 静态服务器没有 /api 代理时会返回 404，这属于"无法判断"，不要误报断线
      if (response.status === 404) {
        setDown(false)
        wasDown.current = false
        return
      }
      if (!response.ok) throw new Error(`后端返回 ${response.status}`)
      const data = (await response.json()) as { status?: string }
      if (data.status !== 'ok') throw new Error('后端状态异常')
      setDown(false)
      setDismissed(false)
      if (wasDown.current) {
        setRecovered(true)
        if (recoverTimer.current) window.clearTimeout(recoverTimer.current)
        recoverTimer.current = window.setTimeout(() => setRecovered(false), RECOVER_HINT_MS)
      }
      wasDown.current = false
    } catch {
      setDown(true)
      wasDown.current = true
      setRecovered(false)
    } finally {
      window.clearTimeout(timer)
      setChecking(false)
    }
  }, [])

  useEffect(() => {
    if (!enabled) return
    // 首次探测：结果在 await 之后才写入 state，不会引起同步重渲染
    // oxlint-disable-next-line react/set-state-in-effect
    void probe()

    const timer = window.setInterval(() => {
      void probe()
    }, POLL_MS)

    // 休眠唤醒 / 切回标签页时立刻补一次，避免等满 30 秒
    const onVisible = () => {
      if (document.visibilityState === 'visible') void probe()
    }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onVisible)

    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', onVisible)
      if (recoverTimer.current) window.clearTimeout(recoverTimer.current)
    }
  }, [enabled, probe])

  if (!enabled) return null

  if (recovered && !down) {
    return (
      <div className="backend-banner backend-banner--ok" role="status">
        <span className="backend-banner__dot" aria-hidden="true" />
        <div className="backend-banner__body">
          <strong>本机后端已恢复</strong>
          <span>作业提醒、学习通同步可以正常使用了</span>
        </div>
      </div>
    )
  }

  if (!down || dismissed) return null

  return (
    <div className="backend-banner" role="alert">
      <span className="backend-banner__dot" aria-hidden="true" />
      <div className="backend-banner__body">
        <strong>本机后端已断开</strong>
        <span>作业提醒和学习通同步暂时不可用，后端恢复后会自动重连</span>
      </div>
      <button
        type="button"
        className="backend-banner__retry"
        onClick={() => void probe()}
        disabled={checking}
        title="也可在项目目录双击 start-backend-silent.vbs 重启后端"
      >
        {checking ? '检测中…' : '重新连接'}
      </button>
      <button
        type="button"
        className="backend-banner__close"
        aria-label="暂时隐藏提示"
        onClick={() => setDismissed(true)}
      >
        ×
      </button>
    </div>
  )
}
