import { ShieldIcon } from './icons'

interface AppFooterProps {
  message?: string
}

export function AppFooter({
  message = '所有处理均在浏览器本地完成，文件不会上传服务器',
}: AppFooterProps) {
  return (
    <footer className="app-footer">
      <ShieldIcon />
      <span>{message}</span>
    </footer>
  )
}
