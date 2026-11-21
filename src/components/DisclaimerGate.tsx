import { useEffect, useRef, useState } from 'react'
import { ShieldIcon } from './icons'
import {
  acceptDisclaimer,
  deferDisclaimer,
  hasAcceptedDisclaimer,
} from '../lib/consent'
import { isStaticHosting } from '../lib/env'

/**
 * 首次访问的免责声明弹层。
 * 只用 localStorage 记一个 accepted 标记，不收集任何信息。
 */
export function DisclaimerGate() {
  // 直接打开「关于本网站」时不必先挡一层，页面本身就是完整声明
  const [open, setOpen] = useState(
    () => !window.location.hash.startsWith('#/about') && !hasAcceptedDisclaimer(),
  )
  const acceptRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    acceptRef.current?.focus()
    return () => {
      document.body.style.overflow = previous
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        deferDisclaimer()
        setOpen(false)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open])

  if (!open) return null

  const accept = () => {
    acceptDisclaimer()
    setOpen(false)
  }

  const later = () => {
    deferDisclaimer()
    setOpen(false)
  }

  return (
    <div className="gate" role="dialog" aria-modal="true" aria-labelledby="gate-title">
      <div className="gate__panel">
        <div className="gate__head">
          <span className="gate__icon">
            <ShieldIcon />
          </span>
          <h2 className="gate__title" id="gate-title">
            使用前请知悉
          </h2>
        </div>

        <div className="gate__body">
          <ul className="gate__list">
            <li>
              本站是<strong>个人学习与竞赛作品</strong>，与杭州电子科技大学
              <strong>没有隶属或授权关系</strong>，不是学校官方系统。
            </li>
            <li>
              证件照、图片压缩<strong>全部在浏览器本地完成</strong>，文件不会上传服务器。
            </li>
            <li>
              学习通账号密码经加密后<strong>只保存在你自己的电脑上</strong>
              （<code>backend/data/</code>），任何服务器都收不到。
            </li>
            <li>
              作业提醒与 GPA 学习通同步依赖
              <strong>本机后端</strong>
              {isStaticHosting() ? '，当前公网版本不可用。' : '，需要先在本机启动后端。'}
            </li>
            <li>
              页面内的外部链接指向第三方站点，其内容与安全性由该站点自行负责。
            </li>
          </ul>
        </div>

        <div className="gate__foot">
          <a className="gate__more" href="#/about" onClick={() => setOpen(false)}>
            查看完整声明
          </a>
          <span className="gate__actions">
            <button type="button" className="btn btn--ghost btn--sm" onClick={later}>
              稍后再说
            </button>
            <button
              type="button"
              className="btn btn--primary btn--sm"
              ref={acceptRef}
              onClick={accept}
            >
              我已知悉
            </button>
          </span>
        </div>
      </div>
    </div>
  )
}
