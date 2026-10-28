import type { ReactNode } from 'react'
import { AppFooter } from '../components/AppFooter'
import {
  ArrowRightIcon,
  ClipboardIcon,
  GridIcon,
  IdCardIcon,
  PlusIcon,
  ShieldIcon,
} from '../components/icons'

interface ToolEntry {
  id: string
  name: string
  path: string
  description: string
  tags: string[]
  status: string
  statusTone: 'ok' | 'info'
  note?: string
  icon: ReactNode
}

const TOOLS: ToolEntry[] = [
  {
    id: 'kazhengtong',
    name: '卡证通',
    path: '/kazhengtong',
    description:
      '智能抠图、换底、裁剪压缩与合规校验，生成可直接上传报名系统的证件照。',
    tags: ['四六级', '学生证', '简历', '二寸'],
    status: '已上线',
    statusTone: 'ok',
    icon: <IdCardIcon />,
  },
  {
    id: 'homework',
    name: '作业提醒',
    path: '/homework',
    description:
      '连接本机教务后端，绑定学习通凭证，一键汇总全部课程作业与截止时间。',
    tags: ['作业', '截止提醒', '本地后端'],
    status: '已上线',
    statusTone: 'ok',
    note: '说明：本功能目前仅在电脑端可用，手机端打开时无法读取作业。',
    icon: <ClipboardIcon />,
  },
]

export function HomePage() {
  return (
    <div className="app app--home">
      <header className="app-header">
        <div className="brand">
          <span className="brand__mark">
            <GridIcon />
          </span>
          <div>
            <p className="brand__title">校园工具箱</p>
            <p className="brand__subtitle">本地优先的校园办事工具</p>
          </div>
        </div>
        <span className="privacy-pill">
          <ShieldIcon />
          本地处理 · 文件不上传
        </span>
      </header>

      <main className="app-main">
        <section className="hero" aria-labelledby="hero-title">
          <p className="hero__eyebrow">校园工具箱 · 证件照</p>
          <h1 className="hero__title" id="hero-title">
            证件照，
            <br />
            一次做对。
          </h1>
          <p className="hero__desc">
            四六级、学生证、简历、二寸照，
            <br />
            自动抠图换底、校验规格，直接下载上传。
          </p>
          <a className="btn btn--primary hero__cta" href="#/kazhengtong">
            开始制作证件照
            <ArrowRightIcon />
          </a>
          <ul className="hero__facts">
            <li>照片不上传</li>
            <li>手机可用</li>
            <li>免注册</li>
          </ul>
        </section>

        <section className="tools" aria-labelledby="tools-title">
          <div className="section-head">
            <h2 id="tools-title">工具</h2>
            <span className="section-head__meta">{TOOLS.length} 个工具</span>
          </div>

          <div className="tool-grid">
            {TOOLS.map((tool) => (
              <a key={tool.id} className="tool-card" href={`#${tool.path}`}>
                <span className="tool-card__icon">{tool.icon}</span>
                <span className="tool-card__content">
                  <span className="tool-card__row">
                    <span className="tool-card__name">{tool.name}</span>
                    <span className={`tag tag--${tool.statusTone}`}>
                      {tool.status}
                    </span>
                  </span>
                  <span className="tool-card__desc">{tool.description}</span>
                  <span className="tool-card__tags">
                    {tool.tags.map((tag) => (
                      <span key={tag}>{tag}</span>
                    ))}
                  </span>
                  {tool.note && (
                    <span className="tool-card__note">{tool.note}</span>
                  )}
                </span>
                <span className="tool-card__arrow" aria-hidden="true">
                  <ArrowRightIcon />
                </span>
              </a>
            ))}

            <div className="tool-card tool-card--soon">
              <span className="tool-card__icon">
                <PlusIcon />
              </span>
              <span className="tool-card__content">
                <span className="tool-card__row">
                  <span className="tool-card__name">更多校园工具</span>
                  <span className="tag tag--soon">开发中</span>
                </span>
                <span className="tool-card__desc">
                  规格速查、材料清单等工具，将按同样的本地优先方式陆续加入。
                </span>
              </span>
            </div>
          </div>
        </section>
      </main>

      <AppFooter />
    </div>
  )
}
