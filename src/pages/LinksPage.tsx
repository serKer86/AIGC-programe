import {
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type CSSProperties,
  type FormEvent,
} from 'react'
import { AppFooter } from '../components/AppFooter'
import {
  AlbumIcon,
  AlertIcon,
  ArrowLeftIcon,
  CloseIcon,
  GripIcon,
  LinkIcon,
  RefreshIcon,
  ShieldIcon,
} from '../components/icons'
import { useDragSort } from '../hooks/useDragSort'
import {
  clearLinkIcon,
  createIconDataUrl,
  iconSrcFor,
  readLinkIcons,
  saveLinkIcon,
  tileHue,
  tileLetter,
  type IconMap,
} from '../lib/linkIcons'
import {
  DEFAULT_GROUP,
  PRESET_LINKS,
  addLocalLink,
  applyLinkOrder,
  describeHost,
  groupLinks,
  readLinkOrder,
  readLocalLinks,
  removeLocalLink,
  saveLinkOrder,
  saveLocalLink,
  type SchoolLink,
} from '../lib/schoolLinks'

interface Feedback {
  tone: 'ok' | 'error'
  text: string
}

function FeedbackLine({ feedback }: { feedback: Feedback | null }) {
  if (!feedback) return null
  return (
    <div aria-live="polite">
      {feedback.tone === 'error' ? (
        <p className="form-error" role="alert">
          <AlertIcon />
          <span>{feedback.text}</span>
        </p>
      ) : (
        <p className="form-status">
          <span>{feedback.text}</span>
        </p>
      )}
    </div>
  )
}

/** 同域名 + 同路径视为同一个入口（忽略 ticket、t 之类的临时参数） */
function linkKey(url: string): string {
  try {
    const parsed = new URL(url)
    return parsed.origin + parsed.pathname.replace(/\/+$/, '')
  } catch {
    return url
  }
}

export function LinksPage() {
  const [localLinks, setLocalLinks] = useState<SchoolLink[]>(readLocalLinks)
  const [icons, setIcons] = useState<IconMap>(readLinkIcons)
  const [name, setName] = useState('')
  const [url, setUrl] = useState('')
  const [listFeedback, setListFeedback] = useState<Feedback | null>(null)
  const [formFeedback, setFormFeedback] = useState<Feedback | null>(null)
  const [managing, setManaging] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<string | null>(null)

  const iconInputRef = useRef<HTMLInputElement>(null)
  const iconTargetRef = useRef<string | null>(null)

  const allLinks = useMemo<SchoolLink[]>(() => {
    // 预置入口优先；用户本地已有的同一页面（同域名+同路径，忽略参数）不再重复展示
    const presetKeys = new Set(PRESET_LINKS.map((link) => linkKey(link.url)))
    const extra = localLinks.filter((link) => !presetKeys.has(linkKey(link.url)))
    return [...PRESET_LINKS, ...extra]
  }, [localLinks])
  const [order, setOrder] = useState<string[]>(readLinkOrder)
  const orderedLinks = useMemo(() => applyLinkOrder(allLinks, order), [allLinks, order])
  const groups = useMemo(() => groupLinks(orderedLinks), [orderedLinks])
  const dragIds = useMemo(() => orderedLinks.map((link) => link.id), [orderedLinks])

  // 和首页工具卡片一致：进入「管理」后可以直接拖动图标排序
  const { isDragging, getItemProps } = useDragSort(dragIds, {
    enabled: managing,
    activation: 'direct',
    onReorder: setOrder,
    onCommit: saveLinkOrder,
  })
  const pendingLink = pendingDelete
    ? allLinks.find((link) => link.id === pendingDelete) ?? null
    : null

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    const result = addLocalLink(name, url, allLinks)
    if (!result.ok) {
      setFormFeedback({ tone: 'error', text: result.reason })
      return
    }
    if (!saveLocalLink(result.link, localLinks)) {
      setFormFeedback({
        tone: 'error',
        text: '本机存储不可用（可能处于无痕模式），这次添加不会保留。',
      })
      return
    }
    setLocalLinks([...localLinks, result.link])
    setName('')
    setUrl('')
    setFormFeedback({ tone: 'ok', text: `已添加「${result.link.name}」，只保存在本机浏览器。` })
  }

  const handleDelete = () => {
    if (!pendingLink) return
    if (!removeLocalLink(pendingLink.id, localLinks)) {
      setListFeedback({ tone: 'error', text: '本机存储不可用，无法删除。' })
      return
    }
    setLocalLinks(localLinks.filter((link) => link.id !== pendingLink.id))
    setIcons(clearLinkIcon(pendingLink.id, icons))
    setPendingDelete(null)
    setListFeedback({ tone: 'ok', text: `已删除「${pendingLink.name}」。` })
  }

  const startIconPick = (id: string) => {
    iconTargetRef.current = id
    iconInputRef.current?.click()
  }

  const handleIconInput = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    const targetId = iconTargetRef.current
    iconTargetRef.current = null
    event.target.value = ''
    if (!file || !targetId) return

    const target = allLinks.find((link) => link.id === targetId)
    try {
      const dataUrl = await createIconDataUrl(file)
      const saved = saveLinkIcon(targetId, dataUrl, icons)
      if (!saved.ok) {
        setListFeedback({ tone: 'error', text: saved.reason })
        return
      }
      setIcons(saved.icons)
      setListFeedback({
        tone: 'ok',
        text: `已换上自选图标（「${target?.name ?? ''}」），图片只存在这台设备。`,
      })
    } catch (cause) {
      setListFeedback({
        tone: 'error',
        text: cause instanceof Error ? cause.message : '图标处理失败，换一张图片试试。',
      })
    }
  }

  const resetIcon = (link: SchoolLink) => {
    setIcons(clearLinkIcon(link.id, icons))
    setListFeedback({ tone: 'ok', text: `已恢复「${link.name}」的默认图标。` })
  }

  return (
    <div className="app app--links">
      <div className="tool-nav">
        <a className="back-link" href="#/">
          <ArrowLeftIcon />
          校园工具箱
        </a>
        <span className="privacy-pill">
          <ShieldIcon />
          链接仅保存在本机
        </span>
      </div>

      <header className="app-header">
        <div className="brand">
          <span className="brand__mark">
            <LinkIcon />
          </span>
          <div>
            <h1 className="brand__title">校园网址</h1>
            <p className="brand__subtitle">常用页面一键直达，自己加的链接只存本机</p>
          </div>
        </div>
      </header>

      <main className="app-main">
        <section className="card links-list" aria-labelledby="links-list-title">
          <div className="card__head">
            <h2 className="card__title" id="links-list-title">
              常用入口
            </h2>
            {allLinks.length > 0 && (
              <span className="links-head__side">
                <span className="section-head__meta">{allLinks.length} 个</span>
                <button
                  type="button"
                  className="btn btn--ghost btn--sm"
                  onClick={() => {
                    setManaging((previous) => !previous)
                    setPendingDelete(null)
                  }}
                >
                  {managing ? '完成' : '管理'}
                </button>
              </span>
            )}
          </div>

          {!allLinks.length ? (
            <div className="empty-state">
              <span className="empty-state__icon">
                <LinkIcon />
              </span>
              <p className="empty-state__title">还没有常用入口</p>
              <p className="empty-state__text">
                把教务系统、图书馆、选课、网络认证这些天天要开的页面加进来，
                下次就不用从浏览器书签里翻了。链接只保存在这台设备。
              </p>
            </div>
          ) : (
            groups.map((group) => (
              <div className="links-group" key={group.group}>
                {(groups.length > 1 || group.group !== DEFAULT_GROUP) && (
                  <h3 className="links-group__title">
                    {group.group}
                    <span className="links-group__count">{group.links.length}</span>
                  </h3>
                )}
                <div
                  className={`link-grid${managing ? ' is-managing' : ''}${
                    isDragging ? ' is-sorting' : ''
                  }`}
                >
                  {group.links.map((link) => {
                    const src = iconSrcFor(link, icons)
                    const hueStyle = { '--link-hue': tileHue(link.url) } as CSSProperties
                    const face = (
                      <>
                        <span className={`link-tile__icon${src ? '' : ' is-letter'}`} style={hueStyle}>
                          {src ? (
                            <img className="link-tile__img" src={src} alt="" />
                          ) : (
                            <span className="link-tile__letter">{tileLetter(link.url)}</span>
                          )}
                        </span>
                        <span className="link-tile__name">{link.name}</span>
                        {managing && (
                          <span className="link-tile__host">{describeHost(link.url)}</span>
                        )}
                      </>
                    )
                    const drag = getItemProps(link.id)
                    return (
                      <div
                        key={link.id}
                        className={`link-tile${managing ? ' is-managing' : ''}${
                          drag.draggingClassName
                        }`}
                        ref={drag.ref}
                        onPointerDown={(event) => {
                          // 图标操作按钮上的按下不算拖拽起点
                          if ((event.target as HTMLElement).closest('button')) return
                          drag.onPointerDown(event)
                        }}
                        onPointerMove={drag.onPointerMove}
                        onPointerUp={drag.onPointerUp}
                        onContextMenu={drag.onContextMenu}
                      >
                        {managing ? (
                          <div className="link-tile__face">{face}</div>
                        ) : (
                          <a
                            className="link-tile__face"
                            href={link.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            title={`在新标签打开 ${describeHost(link.url)}`}
                          >
                            {face}
                          </a>
                        )}
                        {managing && (
                          <span className="link-tile__grip" aria-hidden="true">
                            <GripIcon />
                          </span>
                        )}
                        {managing && (
                          <span className="link-tile__actions">
                            <button
                              type="button"
                              className="link-tile__act"
                              onClick={() => startIconPick(link.id)}
                              aria-label={`为 ${link.name} 自选图标`}
                            >
                              <AlbumIcon />
                            </button>
                            {icons[link.id] && (
                              <button
                                type="button"
                                className="link-tile__act"
                                onClick={() => resetIcon(link)}
                                aria-label={`恢复 ${link.name} 的默认图标`}
                              >
                                <RefreshIcon />
                              </button>
                            )}
                            {link.local && (
                              <button
                                type="button"
                                className="link-tile__act link-tile__act--danger"
                                onClick={() => setPendingDelete(link.id)}
                                aria-label={`删除 ${link.name}`}
                              >
                                <CloseIcon />
                              </button>
                            )}
                          </span>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            ))
          )}

          {pendingLink && (
            <div className="link-confirm" role="alert">
              <span>删除「{pendingLink.name}」？这台设备上的自选图标也会一起清掉。</span>
              <span className="link-confirm__actions">
                <button type="button" className="btn btn--danger btn--sm" onClick={handleDelete}>
                  确认删除
                </button>
                <button
                  type="button"
                  className="btn btn--ghost btn--sm"
                  onClick={() => setPendingDelete(null)}
                >
                  取消
                </button>
              </span>
            </div>
          )}

          <FeedbackLine feedback={listFeedback} />

          <input
            ref={iconInputRef}
            type="file"
            accept="image/*"
            hidden
            onChange={handleIconInput}
          />
        </section>

        <section className="card links-add" aria-labelledby="links-add-title">
          <h2 className="card__title" id="links-add-title">
            添加自己的链接
          </h2>
          <p className="card__desc">
            名称随便写，网址粘贴浏览器地址栏里的完整地址即可，没带 https:// 会自动补上。
          </p>

          <form className="link-form" onSubmit={handleSubmit}>
            <div className="field">
              <label className="field__label" htmlFor="link-name">
                名称
              </label>
              <input
                className="field__input"
                id="link-name"
                type="text"
                maxLength={24}
                placeholder="教务系统"
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </div>
            <div className="field">
              <label className="field__label" htmlFor="link-url">
                网址
              </label>
              <input
                className="field__input"
                id="link-url"
                type="text"
                inputMode="url"
                placeholder="jwgl.example.edu.cn"
                value={url}
                onChange={(event) => setUrl(event.target.value)}
              />
            </div>
            <button type="submit" className="btn btn--primary">
              添加
            </button>
          </form>

          <FeedbackLine feedback={formFeedback} />
        </section>

        <section className="tips" aria-labelledby="links-tips-title">
          <h2 className="tips__title" id="links-tips-title">
            使用说明
          </h2>
          <ul>
            <li>没有配图的入口按域名首字母生成图标，同一域名颜色固定</li>
            <li>点「管理」可以拖动图标调整顺序，也可以换图标或删除；顺序和图标都只存这台设备</li>
            <li>链接在新标签打开，本页不会内嵌任何学校站点</li>
            <li>无痕模式下添加的链接和图标关闭页面即消失</li>
          </ul>
        </section>
      </main>

      <AppFooter message="链接保存在本机浏览器，不会上传服务器" />
    </div>
  )
}
