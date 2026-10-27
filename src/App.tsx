import { useEffect, useState } from 'react'
import { HomePage } from './pages/HomePage'
import { HomeworkPage } from './pages/Homework'
import { KazhengtongPage } from './pages/KazhengtongPage'

function readRoute(): string {
  return window.location.hash.replace(/^#/, '') || '/'
}

const TITLES: Record<string, string> = {
  '/kazhengtong': '卡证通 · 校园证件照智能采集',
  '/homework': '作业提醒 · 校园工具箱',
  '/': '校园工具箱 · 证件照一次做对',
}

export default function App() {
  const [route, setRoute] = useState(readRoute)

  useEffect(() => {
    const handleHashChange = () => setRoute(readRoute())
    window.addEventListener('hashchange', handleHashChange)
    return () => window.removeEventListener('hashchange', handleHashChange)
  }, [])

  useEffect(() => {
    window.scrollTo(0, 0)
    document.title = TITLES[route] ?? TITLES['/']
  }, [route])

  if (route === '/kazhengtong') return <KazhengtongPage />
  if (route === '/homework') return <HomeworkPage />
  return <HomePage />
}
