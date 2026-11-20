import { useEffect, useRef, useState } from 'react'
import { HomePage } from './pages/HomePage'
import { HomeworkPage } from './pages/Homework'
import { KazhengtongPage } from './pages/KazhengtongPage'
import { CompressPage } from './pages/CompressPage'
import { LinksPage } from './pages/LinksPage'
import { recordToolOpen, toolIdForRoute } from './lib/usage'

function readRoute(): string {
  const hash = window.location.hash.replace(/^#/, '')
  if (hash) return hash
  // 兼容 /kazhengtong 这类路径式地址（分享链接、直接在地址栏输入）
  const path = window.location.pathname.replace(/\/+$/, '')
  if (path && path !== '/index.html' && !path.endsWith('.html')) return path
  return '/'
}

const TITLES: Record<string, string> = {
  '/kazhengtong': '卡证通 · 校园证件照智能采集',
  '/homework': '作业提醒 · 校园工具箱',
  '/compress': '图片压缩 · 压到指定 KB',
  '/links': '校园网址 · 常用入口直达',
  '/': '校园工具箱 · 证件照一次做对',
}

export default function App() {
  const [route, setRoute] = useState(readRoute)
  const recordedRoute = useRef<string | null>(null)

  useEffect(() => {
    const handleHashChange = () => setRoute(readRoute())
    window.addEventListener('hashchange', handleHashChange)
    return () => window.removeEventListener('hashchange', handleHashChange)
  }, [])

  useEffect(() => {
    window.scrollTo(0, 0)
    document.title = TITLES[route] ?? TITLES['/']
    if (recordedRoute.current === route) return
    recordedRoute.current = route
    const toolId = toolIdForRoute(route)
    if (toolId) recordToolOpen(toolId)
  }, [route])

  if (route === '/kazhengtong') return <KazhengtongPage />
  if (route === '/homework') return <HomeworkPage />
  if (route === '/compress') return <CompressPage />
  if (route === '/links') return <LinksPage />
  return <HomePage />
}
