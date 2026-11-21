import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { AppFooter } from '../components/AppFooter'
import {
  AlertIcon,
  ArrowLeftIcon,
  CloseIcon,
  CalculatorIcon,
  PlusIcon,
  RefreshIcon,
  ShieldIcon,
} from '../components/icons'
import { fetchChaoxingCourses } from '../api/homework'
import { isLocalHost } from '../lib/env'
import {
  FIVE_LEVELS,
  MODE_LABELS,
  TWO_LEVELS,
  coursePoint,
  createCourse,
  formatGpa,
  formatPoint,
  mergeCourses,
  readCourses,
  saveCourses,
  summarize,
  type GpaCourse,
  type ScoreMode,
} from '../lib/gpa'

interface Feedback {
  tone: 'ok' | 'error'
  text: string
}

const MODE_OPTIONS: ScoreMode[] = ['hundred', 'five', 'two']

const MODE_HINTS: Record<ScoreMode, string> = {
  hundred: '填 0–100 的分数，95 分及以上记 5.0，其余每分 0.1。',
  five: '按优秀 / 良好 / 中等 / 及格 / 不及格换算。',
  two: '按合格 / 不合格换算。',
}

function formatCredit(credit: number): string {
  return Number.isInteger(credit) ? String(credit) : credit.toFixed(1)
}

function parseCredit(text: string): number | null {
  const value = Number(text)
  return Number.isFinite(value) && value > 0 ? value : null
}

function ScoreInput({
  course,
  onChange,
}: {
  course: GpaCourse
  onChange: (value: string) => void
}) {
  if (course.mode === 'hundred') {
    return (
      <input
        className="field__input"
        type="number"
        min={0}
        max={100}
        step={0.5}
        inputMode="decimal"
        placeholder="分数"
        aria-label={`${course.name || '课程'}的成绩`}
        value={course.score}
        onChange={(event) => onChange(event.target.value)}
      />
    )
  }

  const options = course.mode === 'five' ? FIVE_LEVELS : TWO_LEVELS
  return (
    <select
      className="field__input"
      aria-label={`${course.name || '课程'}的成绩等级`}
      value={course.score}
      onChange={(event) => onChange(event.target.value)}
    >
      <option value="">选择成绩</option>
      {options.map((level) => (
        <option key={level} value={level}>
          {level}
        </option>
      ))}
    </select>
  )
}

function FeedbackLine({ feedback }: { feedback: Feedback | null }) {
  if (!feedback) return null
  return (
    <div className="gpa-feedback" aria-live="polite">
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

export function GpaPage() {
  const [courses, setCourses] = useState<GpaCourse[]>(readCourses)
  const [feedback, setFeedback] = useState<Feedback | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [draftName, setDraftName] = useState('')
  const [draftCredit, setDraftCredit] = useState('')
  const [draftMode, setDraftMode] = useState<ScoreMode>('hundred')

  const syncStarted = useRef(false)
  const storageWarned = useRef(false)

  const summary = useMemo(() => summarize(courses), [courses])
  const missingCredit = useMemo(
    () => courses.filter((course) => course.credit === null).length,
    [courses],
  )
  const missingScore = useMemo(
    () => courses.filter((course) => course.score.trim() === '').length,
    [courses],
  )

  useEffect(() => {
    if (saveCourses(courses)) return
    if (storageWarned.current) return
    storageWarned.current = true
    setFeedback({
      tone: 'error',
      text: '本机存储不可用（可能处于无痕模式），这次填写的成绩不会保留。',
    })
  }, [courses])

  const runSync = async (silent: boolean) => {
    if (!isLocalHost()) {
      if (!silent) {
        setFeedback({
          tone: 'error',
          text: '当前是公网版本，读不到学习通课程。请手动添加课程，或在本机双击 start-dev.cmd 后打开。',
        })
      }
      return
    }
    setSyncing(true)
    try {
      const result = await fetchChaoxingCourses()
      if (!result.ok) {
        if (silent) return
        setFeedback({
          tone: 'error',
          text:
            result.code === 'SESSION_EXPIRED'
              ? '学习通还没绑定。先到「作业提醒」绑定账号，也可以直接在下面手动添加课程。'
              : (result.message ?? '读取课程失败，稍后再试。'),
        })
        return
      }

      const incoming = result.courses ?? []
      if (incoming.length === 0) {
        if (!silent) {
          setFeedback({ tone: 'error', text: '学习通里没读到课程。' })
        }
        return
      }

      const merged = mergeCourses(courses, incoming)
      if (merged.added > 0) {
        setCourses(merged.courses)
        setFeedback({
          tone: 'ok',
          text: `已带入 ${merged.added} 门课程。学习通不提供学分数，补填学分后就能看到 GPA。`,
        })
      } else if (!silent) {
        setFeedback({
          tone: 'ok',
          text: `学习通里的 ${incoming.length} 门课程都与列表重名，没有新增。`,
        })
      }
    } catch (error) {
      if (silent) return
      setFeedback({
        tone: 'error',
        text:
          error instanceof Error
            ? `连不上本地后端（${error.message}），请先双击 start-backend.cmd。`
            : '连不上本地后端，请先启动 start-backend.cmd。',
      })
    } finally {
      setSyncing(false)
    }
  }

  useEffect(() => {
    if (syncStarted.current) return
    syncStarted.current = true
    if (courses.length > 0) return
    if (!isLocalHost()) return
    void runSync(true)
    // 只在首次进入时尝试一次预填，之后交给按钮手动触发
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const updateCourse = (id: string, patch: Partial<GpaCourse>) => {
    setCourses((previous) =>
      previous.map((course) =>
        course.id === id ? { ...course, ...patch } : course,
      ),
    )
  }

  const changeMode = (course: GpaCourse, mode: ScoreMode) => {
    if (course.mode === mode) return
    // 换了计分方式，之前的分数形式不再适用，直接清空
    updateCourse(course.id, { mode, score: '' })
  }

  const removeCourse = (id: string) => {
    setCourses((previous) => previous.filter((course) => course.id !== id))
  }

  const handleAdd = (event: FormEvent) => {
    event.preventDefault()
    const name = draftName.trim()
    if (!name) {
      setFeedback({ tone: 'error', text: '先填课程名。' })
      return
    }
    const credit = parseCredit(draftCredit)
    setCourses((previous) => [
      ...previous,
      createCourse({ name, credit, mode: draftMode }),
    ])
    setDraftName('')
    setDraftCredit('')
    setFeedback({
      tone: 'ok',
      text: `已添加「${name}」（${MODE_LABELS[draftMode]}）${
        credit === null ? '，学分留空所以暂时不计入加权' : ''
      }。`,
    })
  }

  const handleClear = () => {
    if (courses.length === 0) return
    if (!window.confirm('清空所有课程和已填成绩？本机保存的记录会一起删除。')) return
    setCourses([])
    setFeedback({ tone: 'ok', text: '已清空。' })
  }

  return (
    <div className="app app--gpa">
      <div className="tool-nav">
        <a className="back-link" href="#/">
          <ArrowLeftIcon />
          校园工具箱
        </a>
        <span className="privacy-pill">
          <ShieldIcon />
          成绩只存本机
        </span>
      </div>

      <header className="app-header">
        <div className="brand">
          <span className="brand__mark">
            <CalculatorIcon />
          </span>
          <div>
            <h1 className="brand__title">杭电 GPA 计算器</h1>
            <p className="brand__subtitle">
              5 分制 · 学习通课程一键带入，只填分数
            </p>
          </div>
        </div>
      </header>

      <main className="app-main">
        <section className="card gpa-summary" aria-labelledby="gpa-summary-title">
          <div className="gpa-summary__hero">
            <span className="gpa-summary__label" id="gpa-summary-title">
              加权平均绩点（5 分制）
            </span>
            <p className="gpa-summary__value">{formatGpa(summary.gpa)}</p>
            <p className="gpa-summary__hint">
              按学分加权计算，未填分数或学分的课程不计入
            </p>
          </div>
          <ul className="gpa-summary__facts">
            <li>
              <span>已计入</span>
              <strong>{summary.courseCount} 门</strong>
            </li>
            <li>
              <span>计入学分</span>
              <strong>{formatCredit(summary.countedCredit)}</strong>
            </li>
            <li>
              <span>课程总数</span>
              <strong>{courses.length} 门</strong>
            </li>
          </ul>
        </section>

        <FeedbackLine feedback={feedback} />

        <section className="card gpa-list" aria-labelledby="gpa-list-title">
          <div className="card__head">
            <h2 className="card__title" id="gpa-list-title">
              课程与成绩
            </h2>
            <span className="gpa-list__actions">
              <button
                type="button"
                className="btn btn--ghost btn--sm"
                onClick={() => void runSync(false)}
                disabled={syncing || !isLocalHost()}
              >
                <RefreshIcon />
                {syncing ? '同步中…' : '从学习通同步'}
              </button>
              {courses.length > 0 && (
                <button
                  type="button"
                  className="btn btn--ghost btn--sm"
                  onClick={handleClear}
                >
                  清空
                </button>
              )}
            </span>
          </div>

          {!isLocalHost() && (
            <p className="notice">
              <AlertIcon />
              <span>
                公网版本读不到学习通课程，请手动添加课程；在本机运行时可一键带入。
              </span>
            </p>
          )}

          {courses.length > 0 && (missingCredit > 0 || missingScore > 0) && (
            <p className="notice">
              <AlertIcon />
              <span>
                {missingCredit > 0 && `有 ${missingCredit} 门课还没填学分`}
                {missingCredit > 0 && missingScore > 0 && '，'}
                {missingScore > 0 && `有 ${missingScore} 门课还没填分数`}
                。两项都填上才会算进加权 GPA。
              </span>
            </p>
          )}

          {courses.length === 0 ? (
            <div className="gpa-empty">
              <p className="gpa-empty__title">还没有课程</p>
              <p className="card__desc">
                {isLocalHost()
                  ? '点上面的「从学习通同步」，把本学期课程一键带进来，你只需要填分数；也可以直接在下面手动添加。'
                  : '公网版本用「添加课程」手动录入即可，成绩和 GPA 都在你自己的浏览器里计算。'}
              </p>
            </div>
          ) : (
            <>
              <div className="gpa-head" aria-hidden="true">
                <span>课程</span>
                <span>学分</span>
                <span>计算方式</span>
                <span>成绩</span>
                <span>绩点</span>
                <span />
              </div>

              <ul className="gpa-rows">
                {courses.map((course) => {
                  const point = coursePoint(course)
                  return (
                    <li className="gpa-row" key={course.id}>
                      <label className="gpa-cell gpa-row__name">
                        <span className="gpa-cell__label">课程</span>
                        <input
                          className="field__input"
                          value={course.name}
                          placeholder="课程名"
                          aria-label="课程名"
                          onChange={(event) =>
                            updateCourse(course.id, {
                              name: event.target.value,
                            })
                          }
                        />
                      </label>

                      <label className="gpa-cell gpa-row__credit">
                        <span className="gpa-cell__label">学分</span>
                        <input
                          className="field__input"
                          type="number"
                          min={0}
                          step={0.5}
                          inputMode="decimal"
                          placeholder="学分"
                          aria-label={`${course.name || '课程'}的学分`}
                          value={course.credit ?? ''}
                          onChange={(event) =>
                            updateCourse(course.id, {
                              credit: parseCredit(event.target.value),
                            })
                          }
                        />
                      </label>

                      <label className="gpa-cell gpa-row__mode">
                        <span className="gpa-cell__label">计算方式</span>
                        <select
                          className="field__input"
                          aria-label={`${course.name || '课程'}的计算方式`}
                          value={course.mode}
                          onChange={(event) =>
                            changeMode(course, event.target.value as ScoreMode)
                          }
                        >
                          {MODE_OPTIONS.map((mode) => (
                            <option key={mode} value={mode}>
                              {MODE_LABELS[mode]}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label className="gpa-cell gpa-row__score">
                        <span className="gpa-cell__label">成绩</span>
                        <ScoreInput
                          course={course}
                          onChange={(value) =>
                            updateCourse(course.id, { score: value })
                          }
                        />
                      </label>

                      <span className={`gpa-row__point${point === null ? ' is-empty' : ''}`}>
                        {formatPoint(point)}
                      </span>

                      <span className="gpa-row__side">
                        <label className="gpa-row__retake" title="经补考及格的课程绩点记 1.5">
                          <input
                            type="checkbox"
                            checked={course.retake}
                            onChange={(event) =>
                              updateCourse(course.id, {
                                retake: event.target.checked,
                              })
                            }
                          />
                          补考
                        </label>
                        <button
                          type="button"
                          className="gpa-row__remove"
                          aria-label={`删除 ${course.name || '这门课'}`}
                          onClick={() => removeCourse(course.id)}
                        >
                          <CloseIcon />
                        </button>
                      </span>
                    </li>
                  )
                })}
              </ul>
            </>
          )}
        </section>

        <div className="gpa-side">
          <section className="card gpa-add" aria-labelledby="gpa-add-title">
          <h2 className="card__title" id="gpa-add-title">
            添加课程
          </h2>
          <form className="gpa-add__form" onSubmit={handleAdd}>
            <input
              className="field__input"
              placeholder="课程名"
              aria-label="新课程名"
              value={draftName}
              onChange={(event) => setDraftName(event.target.value)}
            />
            <input
              className="field__input"
              type="number"
              min={0}
              step={0.5}
              inputMode="decimal"
              placeholder="学分"
              aria-label="新课程学分"
              value={draftCredit}
              onChange={(event) => setDraftCredit(event.target.value)}
            />
            <select
              className="field__input"
              aria-label="新课程的计算方式"
              value={draftMode}
              onChange={(event) => setDraftMode(event.target.value as ScoreMode)}
            >
              {MODE_OPTIONS.map((mode) => (
                <option key={mode} value={mode}>
                  {MODE_LABELS[mode]}
                </option>
              ))}
            </select>
            <button className="btn btn--primary" type="submit">
              <PlusIcon />
              添加
            </button>
          </form>
          <p className="card__desc">{MODE_HINTS[draftMode]}</p>
        </section>

        <section className="card gpa-rules" aria-labelledby="gpa-rules-title">
          <h2 className="card__title" id="gpa-rules-title">
            绩点换算表
          </h2>
          <div className="gpa-rules__grid">
            <div className="gpa-rules__block">
              <h3>百分制</h3>
              <ul>
                <li>
                  <span>95～100</span>
                  <b>5.0</b>
                </li>
                <li>
                  <span>90～94</span>
                  <b>4.5～4.9</b>
                </li>
                <li>
                  <span>80～89</span>
                  <b>3.5～4.4</b>
                </li>
                <li>
                  <span>70～79</span>
                  <b>2.5～3.4</b>
                </li>
                <li>
                  <span>60～69</span>
                  <b>1.5～2.4</b>
                </li>
                <li>
                  <span>60 以下</span>
                  <b>0</b>
                </li>
              </ul>
            </div>
            <div className="gpa-rules__block">
              <h3>五级计分制</h3>
              <ul>
                <li>
                  <span>优秀</span>
                  <b>5.0</b>
                </li>
                <li>
                  <span>良好</span>
                  <b>4.0</b>
                </li>
                <li>
                  <span>中等</span>
                  <b>3.0</b>
                </li>
                <li>
                  <span>及格</span>
                  <b>2.0</b>
                </li>
                <li>
                  <span>不及格</span>
                  <b>0</b>
                </li>
              </ul>
            </div>
            <div className="gpa-rules__block">
              <h3>二级计分制</h3>
              <ul>
                <li>
                  <span>合格</span>
                  <b>3.0</b>
                </li>
                <li>
                  <span>不合格</span>
                  <b>0</b>
                </li>
              </ul>
            </div>
          </div>
          <p className="card__desc">
            补考：经补考及格的课程绩点记 1.5，补考仍不及格记 0。
          </p>
          </section>
        </div>
      </main>

      <AppFooter />
    </div>
  )
}
