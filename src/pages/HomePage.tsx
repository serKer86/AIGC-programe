import { useMemo, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { AppFooter } from '../components/AppFooter'
import { HeroCarousel, type HeroSlide } from '../components/HeroCarousel'
import {
  ArrowRightIcon,
  ClipboardIcon,
  CloseIcon,
  ShrinkIcon,
  CalculatorIcon,
  GripIcon,
  IdCardIcon,
  LinkIcon,
  PlusIcon,
  SearchIcon,
  ShieldIcon,
  SlidersIcon,
} from '../components/icons'
import { useDragSort } from '../hooks/useDragSort'
import { SCHOOL_EMBLEM_SRC } from '../components/SchoolBrand'
import { clearUsage, rankToolIds, readUsage } from '../lib/usage'
import { applyToolOrder, readToolOrder, saveToolOrder } from '../lib/toolOrder'
import { isStaticHosting } from '../lib/env'

interface HeroCopy {
  eyebrow: string
  title: string
  desc: string
  cta: string
  facts: string[]
}

interface ToolEntry {
  id: string
  name: string
  path: string
  description: string
  tags: string[]
  keywords: string[]
  status: string
  statusTone: 'ok' | 'info'
  /** 依赖本机后端，静态托管不可用 */
  localOnly?: boolean
  note?: string
  hero?: HeroCopy
  icon: ReactNode
}

const FEATURED_IDS = ['links', 'kazhengtong', 'compress']

const TOOL_HUES: Record<string, number> = {
  kazhengtong: 221,
  homework: 152,
  'gpa-calc': 268,
  compress: 26,
  links: 190,
}

const TOOLS: ToolEntry[] = [
  {
    id: 'kazhengtong',
    name: '卡证通',
    path: '#/kazhengtong',
    description:
      '智能抠图、换底、裁剪压缩与合规校验，生成可直接上传报名系统的证件照。',
    tags: ['四六级', '学生证', '简历', '二寸'],
    keywords: [
      '证件照',
      '报名照',
      '抠图',
      '人像分割',
      '换底',
      '换背景',
      '底色',
      '白底',
      '蓝底',
      '红底',
      '一寸',
      '二寸',
      '小一寸',
      '像素',
      '文件大小',
      'kb',
      '合规',
      '下载照片',
      '照片',
    ],
    status: '已上线',
    statusTone: 'ok',
    hero: {
      eyebrow: '校园工具箱 · 证件照',
      title: '证件照，一次做对。',
      desc: '四六级、学生证、简历、二寸照，自动抠图换底、校验规格，直接下载上传。',
      cta: '开始制作证件照',
      facts: ['照片不上传', '手机可用', '免注册'],
    },
    icon: <IdCardIcon />,
  },
  {
    id: 'homework',
    name: '作业提醒',
    path: '#/homework',
    description:
      '连接本机教务后端，绑定学习通凭证，一键汇总全部课程作业与截止时间。',
    tags: ['作业', '截止提醒', '本地后端'],
    keywords: [
      '学习通',
      '超星',
      '作业',
      '课程',
      '截止时间',
      '未交',
      '已交',
      '待批阅',
      '催交',
      '教务',
      '凭证',
    ],
    status: '已上线',
    statusTone: 'ok',
    localOnly: true,
    note: '本功能目前仅在电脑端可用，手机端打开时无法读取作业。',
    icon: <ClipboardIcon />,
  },
  {
    id: 'gpa-calc',
    name: '杭电GPA计算器',
    path: '#/gpa',
    description: '学习通课程一键带入，按 5 分制换算绩点，成绩只存本机',
    tags: ['成绩'],
    keywords: [
      'gpa',
      '绩点',
      '成绩',
      '学分',
      '均分',
      '加权平均分',
      '补考',
      '计算器',
      '杭电',
      '杭州电子科技大学',
    ],
    status: '已上线',
    statusTone: 'ok',
    localOnly: true,
    icon: <CalculatorIcon />,
  },
  {
    id: 'compress',
    name: '图片压缩',
    path: '#/compress',
    description:
      '批量把照片压到指定 KB 以内，报名附件、作业上传的图片体积限制一次达标。',
    tags: ['批量', '指定KB', '附件'],
    keywords: [
      '压缩',
      '图片压缩',
      '照片压缩',
      '减小',
      '体积',
      '大小',
      'kb',
      'mb',
      '限制',
      '附件',
      '批量',
      'jpg',
      'png',
      'webp',
      '画质',
      '分辨率',
      '报名',
    ],
    status: '已上线',
    statusTone: 'ok',
    hero: {
      eyebrow: '校园工具箱 · 图片压缩',
      title: '附件超限？压到指定 KB。',
      desc: '批量选图，逐个压进上限以内，报名、作业上传的图片一次达标。',
      cta: '去压缩图片',
      facts: ['批量处理', '指定 KB', '本机完成'],
    },
    icon: <ShrinkIcon />,
  },
  {
    id: 'links',
    name: '校园网址',
    path: '#/links',
    description:
      '教务、图书馆、选课等常用页面集中入口，一键新标签打开，自己添加的链接只存本机。',
    tags: ['快捷入口', '教务', '本机保存'],
    keywords: [
      '网址',
      '链接',
      '入口',
      '跳转',
      '教务',
      '教务系统',
      '选课',
      '图书馆',
      '网络认证',
      '校园网',
      '门户',
      '书签',
      '快捷键',
      '网站',
    ],
    status: '已上线',
    statusTone: 'ok',
    hero: {
      eyebrow: '校园工具箱 · 校园网址',
      title: '常用页面，一屏直达。',
      desc: '教务、图书馆、选课入口排成图标格子，点一下就在新标签打开。',
      cta: '打开校园网址',
      facts: ['新标签直达', '链接存本机', '免注册'],
    },
    note: '学校预置入口还在陆续补充，可以先自己添加常用地址。',
    icon: <LinkIcon />,
  },
]

function matchesTool(tool: ToolEntry, terms: string[]): boolean {
  const haystack = [tool.name, tool.description, tool.status, ...tool.tags, ...tool.keywords]
    .join(' ')
    .toLowerCase()
  return terms.every((term) => haystack.includes(term))
}

export function HomePage() {
  const [query, setQuery] = useState('')
  const keyword = query.trim()
  const terms = useMemo(
    () => keyword.toLowerCase().split(/\s+/).filter(Boolean),
    [keyword],
  )
  const [usage, setUsage] = useState(readUsage)
  const [sorting, setSorting] = useState(false)
  const [order, setOrder] = useState<string[]>(() =>
    applyToolOrder(TOOLS, readToolOrder()).map((tool) => tool.id),
  )
  const orderedTools = useMemo(() => {
    const byId = new Map(TOOLS.map((tool) => [tool.id, tool] as const))
    return order
      .map((id) => byId.get(id))
      .filter((tool): tool is ToolEntry => tool !== undefined)
  }, [order])
  const visibleTools = useMemo(
    () =>
      terms.length ? orderedTools.filter((tool) => matchesTool(tool, terms)) : orderedTools,
    [orderedTools, terms],
  )
  const slides = useMemo<HeroSlide[]>(() => {
    const featured: HeroSlide[] = []
    for (const id of FEATURED_IDS) {
      const tool = TOOLS.find((entry) => entry.id === id)
      if (!tool?.hero) continue
      featured.push({ id: tool.id, path: tool.path, ...tool.hero })
    }
    return featured
  }, [])
  const managing = sorting && !keyword
  const { isDragging, getItemProps } = useDragSort(order, {
    enabled: !keyword,
    activation: managing ? 'direct' : 'long-press',
    onReorder: setOrder,
    onCommit: saveToolOrder,
  })
  const frequentTools = useMemo(() => {
    const byId = new Map(TOOLS.map((tool) => [tool.id, tool] as const))
    return rankToolIds(usage, 3)
      .map((toolId) => byId.get(toolId))
      .filter((tool): tool is ToolEntry => tool !== undefined)
  }, [usage])
  const hasFrequent = !keyword && frequentTools.length > 0

  return (
    <div className={hasFrequent ? 'app app--home app--frequent' : 'app app--home'}>
      <header className="app-header">
        <div className="brand">
          <span className="brand__mark brand__mark--school">
            <img
              src={SCHOOL_EMBLEM_SRC}
              alt="杭州电子科技大学校徽"
              width={34}
              height={34}
              decoding="async"
            />
          </span>
          <div>
            <h1 className="brand__title">校园工具箱</h1>
            <p className="brand__subtitle">本地优先的校园办事工具</p>
          </div>
        </div>

        <form className="tool-search" aria-label="工具搜索" onSubmit={(event) => event.preventDefault()}>
          <SearchIcon />
          <input
            className="tool-search__input"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            aria-label="搜索工具功能"
            placeholder="搜索功能，如抠图、绩点、作业"
          />
          {keyword && (
            <button
              className="tool-search__clear"
              type="button"
              onClick={() => setQuery('')}
              aria-label="清空搜索"
            >
              <CloseIcon />
            </button>
          )}
        </form>

        <span className="privacy-pill">
          <ShieldIcon />
          本地处理 · 文件不上传
        </span>
      </header>

      <main className="app-main">
        {!keyword && <HeroCarousel slides={slides} />}

        {hasFrequent && (
          <aside className="usage-panel" aria-labelledby="usage-title">
            <div className="usage-panel__head">
              <h2 className="usage-panel__title" id="usage-title">
                常用
              </h2>
              <button
                className="usage-panel__clear"
                type="button"
                onClick={() => {
                  clearUsage()
                  setUsage({})
                }}
              >
                清除记录
              </button>
            </div>
            <ul className="usage-list">
              {frequentTools.map((tool) => {
                const isStandalonePage = tool.path.endsWith('.html')
                return (
                  <li key={tool.id}>
                    <a
                      className="usage-item"
                      href={tool.path}
                      {...(isStandalonePage
                        ? { target: '_blank', rel: 'noopener noreferrer' }
                        : {})}
                    >
                      <span className="usage-item__icon">{tool.icon}</span>
                      <span className="usage-item__name">{tool.name}</span>
                    </a>
                  </li>
                )
              })}
            </ul>
          </aside>
        )}

        <section className="tools" aria-labelledby="tools-title">
          <div className="section-head">
            <h2 id="tools-title">工具</h2>
            <div className="section-head__aside">
              <span className="section-head__meta">
                {keyword
                  ? `匹配 ${visibleTools.length} / ${TOOLS.length} 个`
                  : managing
                    ? '按住卡片拖到目标位置'
                    : `${TOOLS.length} 个工具`}
              </span>
              {!keyword && (
                <button
                  className={`tools-manage${managing ? ' is-active' : ''}`}
                  type="button"
                  aria-pressed={managing}
                  onClick={() => setSorting((prev) => !prev)}
                >
                  <SlidersIcon />
                  {managing ? '完成' : '管理'}
                </button>
              )}
            </div>
          </div>

          {keyword && visibleTools.length === 0 ? (
            <p className="search-empty">
              没有匹配「{keyword}」的功能，换个说法试试，例如抠图、换底、绩点或作业。
              <button
                className="search-empty__clear"
                type="button"
                onClick={() => setQuery('')}
              >
                清空搜索
              </button>
            </p>
          ) : (
            <div
              className={`tool-grid${isDragging ? ' is-sorting' : ''}${
                managing ? ' is-managing' : ''
              }`}
            >
              {visibleTools.map((tool) => {
                const isStandalonePage = tool.path.endsWith('.html')
                const drag = getItemProps(tool.id)
                return (
                  <a
                    key={tool.id}
                    className={`tool-card${drag.draggingClassName}`}
                    href={tool.path}
                    style={{ '--tool-hue': TOOL_HUES[tool.id] } as CSSProperties}
                    ref={drag.ref}
                    onPointerDown={drag.onPointerDown}
                    onPointerMove={drag.onPointerMove}
                    onPointerUp={drag.onPointerUp}
                    onClickCapture={(event) => {
                      if (managing) {
                        event.preventDefault()
                        return
                      }
                      drag.onClickCapture(event)
                    }}
                    onContextMenu={drag.onContextMenu}
                    {...(isStandalonePage
                      ? { target: '_blank', rel: 'noopener noreferrer' }
                      : {})}
                  >
                    <span className="tool-card__icon">{tool.icon}</span>
                    <span className="tool-card__content">
                      <span className="tool-card__row">
                        <span className="tool-card__name">{tool.name}</span>
                        <span className={`tag tag--${tool.statusTone}`}>
                          {tool.status}
                        </span>
                        {isStaticHosting() && tool.localOnly && (
                          <span className="tag tag--warn">公网不可用</span>
                        )}
                      </span>
                      <span className="tool-card__desc">
                        {tool.description}
                      </span>
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
                      {managing ? <GripIcon /> : <ArrowRightIcon />}
                    </span>
                  </a>
                )
              })}

              {!keyword && (
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
              )}
            </div>
          )}
        </section>
      </main>

      <AppFooter />
    </div>
  )
}
