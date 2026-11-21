import { ShieldIcon } from './icons'
import { SchoolMark } from './SchoolBrand'

interface AppFooterProps {
  message?: string
}

export function AppFooter({
  message = '所有处理均在浏览器本地完成，文件不会上传服务器',
}: AppFooterProps) {
  return (
    <footer className="app-footer">
      <p className="app-footer__line">
        <ShieldIcon />
        <span>{message}</span>
      </p>
      <p className="app-footer__line app-footer__school">
        <SchoolMark />
        <span className="app-footer__sep" aria-hidden="true">
          ·
        </span>
        <a className="app-footer__link" href="#/about">
          关于本网站
        </a>
      </p>
    </footer>
  )
}
