import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import {
  ALL_COURSES_SOURCE,
  ApiTimeoutError,
  bindChaoxing,
  checkHealth,
  fetchAllHomework,
  fetchChaoxingStatus,
  fetchHomeworkList,
  fetchLastHomework,
  unbindChaoxing,
} from '../api/homework'
import type {
  BindErrorCode,
  FailedCourse,
  FetchHomeworkErrorCode,
  HomeworkItem as HomeworkItemData,
} from '../api/homework'
import { AppFooter } from '../components/AppFooter'
import { HomeworkCourseGroup } from '../components/HomeworkCourseGroup'
import {
  AlertIcon,
  ArrowLeftIcon,
  CheckIcon,
  ClipboardIcon,
  RefreshIcon,
  ShieldIcon,
} from '../components/icons'
import { formatHomeworkDate, sortHomework } from '../lib/homework'

type ConnectionState = 'checking' | 'online' | 'offline'
type CredentialState = 'checking' | 'unbound' | 'bound' | 'error'

const START_COMMAND =
  'cd backend && python -m uvicorn main:app --host 127.0.0.1 --port 8000'
const URL_STORAGE_KEY = 'toolbox.homework.workListUrl'
const TIMEOUT_HINT = '请求超时（15 秒），请确认本地后端与网络状态后重试'
const FETCH_ALL_TIMEOUT_HINT =
  '拉取全部课程超时（120 秒），请稍后重试或改用单门课程拉取'
const DISCLAIMER =
  '数据来源于学习通网页解析，仅供参考，以学习通官方显示为准；本工具只读，不包含自动提交、自动签到等功能。'

const BIND_ERRORS: Record<BindErrorCode, string> = {
  INVALID_CREDENTIALS: '手机号或密码错误，请检查后重试',
  NEED_CAPTCHA: '需要验证码，请先手动登录学习通后再重试',
  NETWORK_ERROR: '网络错误，无法连接学习通，请稍后重试',
}

const FETCH_ERRORS: Record<FetchHomeworkErrorCode, string> = {
  SESSION_EXPIRED: '登录已过期，请重新绑定学习通',
  PARSE_EMPTY: '未解析到作业，页面结构可能已变化',
  INVALID_URL: 'URL 无效，请粘贴学习通课程页或作业列表页的完整地址',
  NETWORK_ERROR: '网络错误，无法连接学习通，请稍后重试',
}

function readStoredUrl(): string {
  try {
    return localStorage.getItem(URL_STORAGE_KEY) ?? ''
  } catch {
    return ''
  }
}

function storeUrl(url: string): void {
  try {
    localStorage.setItem(URL_STORAGE_KEY, url)
  } catch {
    // localStorage 不可用时只在当前会话中保留 URL
  }
}

function isAbortError(reason: unknown): boolean {
  return reason instanceof DOMException && reason.name === 'AbortError'
}

function describeError(
  reason: unknown,
  fallback: string,
  timeoutHint = TIMEOUT_HINT,
): string {
  if (reason instanceof ApiTimeoutError) return timeoutHint
  if (reason instanceof Error && reason.message.startsWith('本地后端')) {
    return `${fallback}：${reason.message}`
  }
  return fallback
}

export function HomeworkPage() {
  const [status, setStatus] = useState<ConnectionState>('checking')
  const [service, setService] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [credential, setCredential] = useState<CredentialState>('checking')
  const [credentialError, setCredentialError] = useState<string | null>(null)
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [bindError, setBindError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [unbinding, setUnbinding] = useState(false)
  const [confirmingUnbind, setConfirmingUnbind] = useState(false)
  const [workListUrl, setWorkListUrl] = useState(readStoredUrl)
  const [activeUrl, setActiveUrl] = useState('')
  const [items, setItems] = useState<HomeworkItemData[]>([])
  const [fetchedAt, setFetchedAt] = useState<string | null>(null)
  const [loadingLast, setLoadingLast] = useState(false)
  const [lastError, setLastError] = useState<string | null>(null)
  const [fetchMode, setFetchMode] = useState<'single' | 'all' | null>(null)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [courseCount, setCourseCount] = useState<number | null>(null)
  const [failedCourses, setFailedCourses] = useState<FailedCourse[]>([])
  const requestRef = useRef<AbortController | null>(null)
  const workRequestRef = useRef<AbortController | null>(null)
  const credentialCardRef = useRef<HTMLElement | null>(null)
  const fetching = fetchMode !== null

  const loadLastHomework = useCallback((signal: AbortSignal) => {
    setLoadingLast(true)
    setLastError(null)
    fetchLastHomework(signal)
      .then((last) => {
        if (signal.aborted) return
        const isAllScope = last.sourceUrl === ALL_COURSES_SOURCE
        if (last.items.length > 0 || isAllScope) {
          setItems(last.items)
          setFetchedAt(last.fetchedAt)
          setActiveUrl(last.sourceUrl ?? '')
          setCourseCount(last.courseCount)
          setFailedCourses(last.failedCourses)
          if (last.sourceUrl && !isAllScope) {
            setWorkListUrl(last.sourceUrl)
            storeUrl(last.sourceUrl)
          }
        }
      })
      .catch((reason: unknown) => {
        if (signal.aborted || isAbortError(reason)) return
        setLastError(
          describeError(reason, '读取上次同步数据失败，可手动拉取作业'),
        )
      })
      .finally(() => {
        if (!signal.aborted) setLoadingLast(false)
      })
  }, [])

  const loadCredential = useCallback(
    (signal: AbortSignal) => {
      fetchChaoxingStatus(signal)
        .then((result) => {
          if (signal.aborted) return
          setCredential(result.bound ? 'bound' : 'unbound')
          setCredentialError(null)
          if (result.bound) loadLastHomework(signal)
        })
        .catch((reason: unknown) => {
          if (signal.aborted || isAbortError(reason)) return
          setCredential('error')
          setCredentialError(
            describeError(reason, '读取凭证状态失败，请重新检测'),
          )
        })
    },
    [loadLastHomework],
  )

  const performCheck = useCallback(() => {
    requestRef.current?.abort()
    const controller = new AbortController()
    requestRef.current = controller

    checkHealth(controller.signal)
      .then((health) => {
        if (controller.signal.aborted) return
        setStatus('online')
        setService(health.service)
        setError(null)
        loadCredential(controller.signal)
      })
      .catch((reason: unknown) => {
        if (controller.signal.aborted || isAbortError(reason)) return
        setStatus('offline')
        setError(describeError(reason, '无法连接本地后端'))
      })
  }, [loadCredential])

  useEffect(() => {
    performCheck()
    return () => {
      requestRef.current?.abort()
      workRequestRef.current?.abort()
    }
  }, [performCheck])

  const retry = () => {
    setStatus('checking')
    setService(null)
    setError(null)
    setCredential('checking')
    setCredentialError(null)
    setBindError(null)
    setFetchError(null)
    setLastError(null)
    setConfirmingUnbind(false)
    performCheck()
  }

  const reloadCredential = () => {
    if (status !== 'online') return
    setCredential('checking')
    setCredentialError(null)
    const controller = new AbortController()
    requestRef.current?.abort()
    requestRef.current = controller
    loadCredential(controller.signal)
  }

  const handleBind = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (submitting) return

    setSubmitting(true)
    setBindError(null)
    bindChaoxing(phone.trim(), password)
      .then((result) => {
        if (result.ok) {
          setCredential('bound')
          setPhone('')
          setPassword('')
          setItems([])
          setFetchedAt(null)
          setActiveUrl('')
          setFetchError(null)
          setLastError(null)
          setCourseCount(null)
          setFailedCourses([])
          setConfirmingUnbind(false)
          return
        }
        const mapped = result.code
          ? BIND_ERRORS[result.code]
          : '绑定失败，请稍后重试'
        const detail = result.message?.trim()
        setBindError(
          detail && !mapped.includes(detail)
            ? `${mapped}（学习通提示：${detail.slice(0, 80)}）`
            : mapped,
        )
      })
      .catch((reason: unknown) => {
        setBindError(
          describeError(
            reason,
            '网络错误，无法连接本地后端，请确认服务已启动',
          ),
        )
      })
      .finally(() => setSubmitting(false))
  }

  const handleUnbind = () => {
    if (unbinding) return

    setUnbinding(true)
    setBindError(null)
    unbindChaoxing()
      .then(() => {
        workRequestRef.current?.abort()
        setCredential('unbound')
        setPhone('')
        setPassword('')
        setItems([])
        setFetchedAt(null)
        setActiveUrl('')
        setFetchError(null)
        setLastError(null)
        setCourseCount(null)
        setFailedCourses([])
        setConfirmingUnbind(false)
      })
      .catch((reason: unknown) => {
        setConfirmingUnbind(false)
        setBindError(
          describeError(
            reason,
            '网络错误，无法连接本地后端，请确认服务已启动',
          ),
        )
      })
      .finally(() => setUnbinding(false))
  }

  const handleSessionExpired = () => {
    setCredential('unbound')
    setBindError('登录已过期，请重新绑定学习通')
    setItems([])
    setFetchedAt(null)
    setActiveUrl('')
    setCourseCount(null)
    setFailedCourses([])
    setLastError(null)
    setConfirmingUnbind(false)
    requestAnimationFrame(() => {
      credentialCardRef.current?.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      })
    })
  }

  const runFetch = (rawUrl: string) => {
    const target = rawUrl.trim()
    if (!target) {
      setFetchError('请粘贴课程页或作业列表页 URL')
      return
    }

    workRequestRef.current?.abort()
    const controller = new AbortController()
    workRequestRef.current = controller
    setFetchMode('single')
    setFetchError(null)
    setLastError(null)

    fetchHomeworkList(target, controller.signal)
      .then((result) => {
        if (controller.signal.aborted) return
        if (result.ok) {
          const nextItems = Array.isArray(result.items) ? result.items : []
          const sourceUrl = result.sourceUrl ?? target
          setItems(nextItems)
          setFetchedAt(result.fetchedAt ?? new Date().toISOString())
          setActiveUrl(sourceUrl)
          setWorkListUrl(sourceUrl)
          storeUrl(sourceUrl)
          setCourseCount(null)
          setFailedCourses([])
          return
        }

        if (result.code === 'SESSION_EXPIRED') {
          handleSessionExpired()
          return
        }

        if (result.code === 'PARSE_EMPTY') {
          setFetchError(result.message ?? FETCH_ERRORS.PARSE_EMPTY)
          return
        }
        if (result.code === 'NETWORK_ERROR' && result.message) {
          setFetchError(result.message)
          return
        }
        setFetchError(
          result.code ? FETCH_ERRORS[result.code] : '拉取失败，请稍后重试',
        )
      })
      .catch((reason: unknown) => {
        if (controller.signal.aborted || isAbortError(reason)) return
        setFetchError(
          describeError(
            reason,
            '网络错误，无法连接本地后端，请确认服务已启动',
          ),
        )
      })
      .finally(() => {
        if (!controller.signal.aborted) setFetchMode(null)
      })
  }

  const runFetchAll = () => {
    workRequestRef.current?.abort()
    const controller = new AbortController()
    workRequestRef.current = controller
    setFetchMode('all')
    setFetchError(null)
    setLastError(null)

    fetchAllHomework(controller.signal)
      .then((result) => {
        if (controller.signal.aborted) return
        if (result.ok) {
          setItems(Array.isArray(result.items) ? result.items : [])
          setFetchedAt(result.fetchedAt ?? new Date().toISOString())
          setActiveUrl(result.sourceUrl ?? ALL_COURSES_SOURCE)
          setCourseCount(
            typeof result.courseCount === 'number' ? result.courseCount : null,
          )
          setFailedCourses(
            Array.isArray(result.failedCourses) ? result.failedCourses : [],
          )
          return
        }

        if (result.code === 'SESSION_EXPIRED') {
          handleSessionExpired()
          return
        }

        if (
          result.message &&
          (result.code === 'PARSE_EMPTY' || result.code === 'NETWORK_ERROR')
        ) {
          setFetchError(result.message)
          return
        }
        setFetchError(
          result.code
            ? FETCH_ERRORS[result.code]
            : '拉取全部课程失败，请稍后重试',
        )
      })
      .catch((reason: unknown) => {
        if (controller.signal.aborted || isAbortError(reason)) return
        setFetchError(
          describeError(
            reason,
            '网络错误，无法连接本地后端，请确认服务已启动',
            FETCH_ALL_TIMEOUT_HINT,
          ),
        )
      })
      .finally(() => {
        if (!controller.signal.aborted) setFetchMode(null)
      })
  }

  const handleFetch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (fetching) return
    runFetch(workListUrl)
  }

  const handleRefresh = () => {
    if (fetching) return
    if (activeUrl === ALL_COURSES_SOURCE) {
      runFetchAll()
      return
    }
    runFetch(activeUrl || workListUrl)
  }

  const isAllScope = activeUrl === ALL_COURSES_SOURCE
  const sortedItems = useMemo(() => sortHomework(items), [items])
  const courseGroups = useMemo(() => {
    const groups = new Map<string, HomeworkItemData[]>()
    for (const item of sortedItems) {
      const key = item.courseName || '未标注课程'
      const group = groups.get(key)
      if (group) group.push(item)
      else groups.set(key, [item])
    }
    return [...groups.entries()].map(([courseName, groupItems]) => ({
      courseName,
      items: groupItems,
    }))
  }, [sortedItems])

  const badge =
    status === 'checking' ? (
      <span className="tag tag--info">检测中</span>
    ) : status === 'online' ? (
      <span className="tag tag--ok">
        <CheckIcon />
        已连接
      </span>
    ) : (
      <span className="tag tag--warn">
        <AlertIcon />
        未连接
      </span>
    )

  const credentialBadge =
    credential === 'checking' ? (
      <span className="tag tag--info">检测中</span>
    ) : credential === 'bound' ? (
      <span className="tag tag--ok">已绑定</span>
    ) : credential === 'error' ? (
      <span className="tag tag--warn">状态未知</span>
    ) : (
      <span className="tag tag--info">未绑定</span>
    )

  return (
    <div className="app app--homework">
      <div className="tool-nav">
        <a className="back-link" href="#/">
          <ArrowLeftIcon />
          校园工具箱
        </a>
        <span className="privacy-pill">
          <ShieldIcon />
          仅本机运行
        </span>
      </div>

      <header className="app-header">
        <div className="brand">
          <span className="brand__mark">
            <ClipboardIcon />
          </span>
          <div>
            <h1 className="brand__title">作业提醒</h1>
            <p className="brand__subtitle">教务作业集中提醒 · 阶段 5</p>
          </div>
        </div>
      </header>

      <main className="app-main">
        <section className="card homework-connection" aria-labelledby="connection-title">
          <div className="card__head">
            <h2 className="card__title" id="connection-title">
              后端连接状态
            </h2>
            {badge}
          </div>

          <div
            className={`conn-status conn-status--${status}`}
            role="status"
            aria-live="polite"
          >
            <span className="conn-status__icon" aria-hidden="true">
              {status === 'checking' ? (
                <span className="conn-status__spinner" />
              ) : status === 'online' ? (
                <CheckIcon />
              ) : (
                <AlertIcon />
              )}
            </span>
            <span className="conn-status__body">
              <span className="conn-status__title">
                {status === 'checking'
                  ? '正在连接本地后端…'
                  : status === 'online'
                    ? '后端已连接'
                    : '未连接本地后端'}
              </span>
              <span className="conn-status__hint">
                {status === 'checking'
                  ? '正在检查 http://127.0.0.1:8000/api/health'
                  : status === 'online'
                    ? `服务 ${service ?? 'homework-reminder'} 已就绪，可以绑定学习通凭证。`
                    : '本地后端未启动或端口 8000 不可达。启动后点击「重新检测」。'}
              </span>
            </span>
          </div>

          {status === 'offline' && (
            <div className="conn-command">
              <p className="conn-command__label">在项目根目录启动后端</p>
              <code>{START_COMMAND}</code>
            </div>
          )}

          {status === 'offline' && (
            <p className="note">
              首次运行需先安装依赖：<code>pip install -r backend/requirements.txt</code>
              {error ? `（${error}）` : ''}
            </p>
          )}

          <div className="conn-actions">
            <button
              type="button"
              className="btn btn--ghost"
              onClick={retry}
              disabled={status === 'checking'}
            >
              <RefreshIcon />
              重新检测
            </button>
          </div>
        </section>

        <div className="bind-notice homework-notice" role="note">
          <ShieldIcon />
          <p>
            凭证仅加密存储在本地，不会上传至任何第三方服务器；本工具只读，不包含自动提交作业功能。
          </p>
        </div>

        {status === 'online' && (
          <section
            className="card homework-credential"
            aria-labelledby="credential-title"
            ref={credentialCardRef}
          >
            <div className="card__head">
              <h2 className="card__title" id="credential-title">
                学习通凭证
              </h2>
              {credentialBadge}
            </div>

            {credential === 'bound' ? (
              <div className="bind-bound">
                <span className="bind-bound__icon" aria-hidden="true">
                  <CheckIcon />
                </span>
                <span className="bind-bound__body">
                  <span className="bind-bound__title">已绑定学习通</span>
                  <span className="bind-bound__hint">
                    登录凭证已加密保存在本机 backend/data/cookies.enc，可随时解绑。
                  </span>
                </span>
              </div>
            ) : credential === 'checking' ? (
              <p className="note">正在读取本地凭证状态…</p>
            ) : credential === 'error' ? (
              <div className="bind-error" role="alert">
                <AlertIcon />
                <span>
                  无法读取本地凭证状态
                  {credentialError ? `（${credentialError}）` : ''}
                </span>
              </div>
            ) : (
              <p className="card__desc">
                使用学习通手机号与密码完成模拟登录，仅保存登录 Cookie。
              </p>
            )}

            {credential === 'unbound' && (
              <form className="bind-form" onSubmit={handleBind}>
                <label className="field" htmlFor="chaoxing-phone">
                  <span className="field__label">手机号</span>
                  <input
                    id="chaoxing-phone"
                    name="phone"
                    className="field__input"
                    type="tel"
                    inputMode="numeric"
                    autoComplete="username"
                    placeholder="学习通登录手机号"
                    value={phone}
                    onChange={(event) => setPhone(event.target.value)}
                    disabled={submitting}
                    required
                  />
                </label>

                <label className="field" htmlFor="chaoxing-password">
                  <span className="field__label">密码</span>
                  <input
                    id="chaoxing-password"
                    name="password"
                    className="field__input"
                    type="password"
                    autoComplete="current-password"
                    placeholder="学习通登录密码"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    disabled={submitting}
                    required
                  />
                </label>

                {bindError && (
                  <p className="bind-error" role="alert">
                    <AlertIcon />
                    <span>{bindError}</span>
                  </p>
                )}

                <div className="conn-actions">
                  <button
                    type="submit"
                    className="btn btn--primary"
                    disabled={
                      submitting || !phone.trim() || password.length === 0
                    }
                  >
                    {submitting && (
                      <span className="btn__spinner" aria-hidden="true" />
                    )}
                    {submitting ? '正在绑定…' : '绑定'}
                  </button>
                </div>
              </form>
            )}

            {credential === 'bound' && (
              <>
                {bindError && (
                  <p className="bind-error" role="alert">
                    <AlertIcon />
                    <span>{bindError}</span>
                  </p>
                )}

                {confirmingUnbind ? (
                  <div
                    className="unbind-confirm"
                    role="alertdialog"
                    aria-labelledby="unbind-confirm-title"
                  >
                    <p className="unbind-confirm__title" id="unbind-confirm-title">
                      确认解绑学习通？
                    </p>
                    <p className="unbind-confirm__hint">
                      解绑会删除本机加密凭证并清除上次同步的作业，需要重新绑定才能继续拉取。
                    </p>
                    <div className="unbind-confirm__actions">
                      <button
                        type="button"
                        className="btn btn--ghost"
                        onClick={() => setConfirmingUnbind(false)}
                        disabled={unbinding}
                      >
                        取消
                      </button>
                      <button
                        type="button"
                        className="btn btn--danger"
                        onClick={handleUnbind}
                        disabled={unbinding}
                      >
                        {unbinding && (
                          <span className="btn__spinner" aria-hidden="true" />
                        )}
                        {unbinding ? '正在解绑…' : '确认解绑'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="conn-actions">
                    <button
                      type="button"
                      className="btn btn--ghost"
                      onClick={() => setConfirmingUnbind(true)}
                      disabled={unbinding}
                    >
                      解绑
                    </button>
                  </div>
                )}
              </>
            )}

            {credential === 'error' && (
              <div className="conn-actions">
                <button
                  type="button"
                  className="btn btn--ghost"
                  onClick={reloadCredential}
                >
                  <RefreshIcon />
                  重新读取
                </button>
              </div>
            )}
          </section>
        )}

        {status === 'online' && credential === 'bound' && (
          <section className="card homework-work" aria-labelledby="work-list-title">
            <div className="card__head">
              <h2 className="card__title" id="work-list-title">
                作业列表
              </h2>
              {items.length > 0 && (
                <span className="tag tag--info">
                  {courseGroups.length} 门有作业 · {items.length} 项
                </span>
              )}
            </div>

            <p className="card__desc">
              可一键拉取学习通全部课程；也可在网页版打开某门课，复制课程页或作业列表页
              URL 粘贴到下方。
            </p>

            <div className="fetch-all">
              <button
                type="button"
                className="btn btn--primary"
                onClick={runFetchAll}
                disabled={fetching}
              >
                {fetching && fetchMode === 'all' && (
                  <span className="btn__spinner" aria-hidden="true" />
                )}
                {fetching && fetchMode === 'all'
                  ? '正在拉取全部课程…'
                  : '拉取全部课程'}
              </button>
              <p className="fetch-all__hint">
                自动读取全部课程并汇总作业，通常需要 10–30 秒。
              </p>
            </div>

            <form className="fetch-form" onSubmit={handleFetch} noValidate>
              <label className="field" htmlFor="worklist-url">
                <span className="field__label">课程页或作业列表页 URL</span>
                <input
                  id="worklist-url"
                  name="workListUrl"
                  className="field__input"
                  type="url"
                  inputMode="url"
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="https://mooc2-ans.chaoxing.com/mooc2-ans/mycourse/stu?…"
                  value={workListUrl}
                  onChange={(event) => setWorkListUrl(event.target.value)}
                  disabled={fetching}
                />
              </label>

              <div className="fetch-actions">
                <button
                  type="submit"
                  className="btn btn--primary"
                  disabled={fetching || workListUrl.trim().length === 0}
                >
                  {fetching && fetchMode === 'single' && (
                    <span className="btn__spinner" aria-hidden="true" />
                  )}
                  {fetching && fetchMode === 'single' ? '正在拉取…' : '拉取'}
                </button>
                <button
                  type="button"
                  className="btn btn--ghost"
                  onClick={handleRefresh}
                  disabled={fetching || !(activeUrl || workListUrl.trim())}
                >
                  <RefreshIcon />
                  刷新
                </button>
              </div>
            </form>

            {fetchError && (
              <p className="bind-error" role="alert">
                <AlertIcon />
                <span>{fetchError}</span>
              </p>
            )}

            {lastError && (
              <p className="bind-error" role="alert">
                <AlertIcon />
                <span>{lastError}</span>
              </p>
            )}

            {failedCourses.length > 0 && (
              <div className="fetch-warning" role="status">
                <AlertIcon />
                <span>
                  {failedCourses.length} 门课程拉取失败：
                  {failedCourses
                    .slice(0, 3)
                    .map((course) => course.courseName)
                    .join('、')}
                  {failedCourses.length > 3 ? ' 等' : ''}
                  。可点击「刷新」重试。
                </span>
              </div>
            )}

            {loadingLast && items.length === 0 && (
              <p className="note">正在读取上次同步的作业…</p>
            )}

            {courseGroups.length > 0 ? (
              <ul className="work-items">
                {courseGroups.map((group) => (
                  <HomeworkCourseGroup
                    key={`${group.courseName}-${fetchedAt ?? ''}`}
                    items={group.items}
                  />
                ))}
              </ul>
            ) : (
              !fetchError &&
              !lastError &&
              !loadingLast &&
              !fetching && (
                <div className="work-empty">
                  <ClipboardIcon />
                  <p>
                    {isAllScope
                      ? '全部课程暂无待办作业'
                      : '暂无作业数据，请粘贴课程作业页 URL 拉取'}
                  </p>
                  <span>
                    {isAllScope
                      ? '可点击「刷新」重新检查全部课程。'
                      : '拉取后可在这里查看截止时间与紧急标记。'}
                  </span>
                </div>
              )
            )}

            {fetchedAt && (
              <p className="work-meta">
                {isAllScope && courseCount !== null
                  ? `范围：全部 ${courseCount} 门课程 · `
                  : ''}
                最后同步时间：{formatHomeworkDate(fetchedAt)}
              </p>
            )}
          </section>
        )}

        <section className="card homework-stage" aria-labelledby="stage-title">
          <div className="card__head">
            <h2 className="card__title" id="stage-title">
              本阶段内容
            </h2>
            <span className="tag tag--info">阶段 5</span>
          </div>
          <ul className="homework-list">
            <li>一键发现全部课程并汇总作业，按课程与标题自动去重</li>
            <li>同一门课程默认收起为最紧急的一条，右下角可展开全部作业</li>
            <li>保留单门课程拉取，可粘贴课程页或作业列表页 URL</li>
            <li>进入页面自动恢复上次同步结果，并显示课程范围与同步时间</li>
            <li>单门接口 15 秒超时，全部课程拉取最长等待 120 秒</li>
            <li>部分课程失败不影响其他课程，会列出失败课程并可刷新重试</li>
            <li>解绑前二次确认，页面底部固定展示解析免责声明</li>
          </ul>
          <p className="note">
            登录过期会提示重新绑定；页面结构变化时返回解析提示，不会自动提交作业。
          </p>
        </section>
      </main>

      <AppFooter message="作业数据仅在本机处理，后端服务不对局域网开放" />

      <aside className="homework-disclaimer" role="note">
        <ShieldIcon />
        <p>{DISCLAIMER}</p>
      </aside>
    </div>
  )
}
