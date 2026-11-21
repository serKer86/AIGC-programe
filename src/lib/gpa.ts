/**
 * 杭电 5 分制绩点换算与本地存储。
 *
 * 换算规则来自《绩点转换表》：
 *   百分制   95～100 → 5.0 ｜ 90～94 → 4.5~4.9 ｜ 80～89 → 3.5~4.4
 *            70～79 → 2.5~3.4 ｜ 60～69 → 1.5~2.4 ｜ 60 以下 → 0
 *   五级制   优秀 5.0 ｜ 良好 4.0 ｜ 中等 3.0 ｜ 及格 2.0 ｜ 不及格 0
 *   二级制   合格 3.0 ｜ 不合格 0
 *   补考     经补考及格的课程绩点为 1.5
 */

export type ScoreMode = 'hundred' | 'five' | 'two'

export interface GpaCourse {
  id: string
  name: string
  /** 学分；留着空则不计入加权，但仍可记录成绩 */
  credit: number | null
  mode: ScoreMode
  /** 百分制存数字字符串，五级/二级存等级名 */
  score: string
  /** 补考及格：绩点固定 1.5 */
  retake: boolean
}

export interface GpaSummary {
  gpa: number | null
  countedCredit: number
  courseCount: number
}

export interface ChaoxingCourseSeed {
  name: string
  credit: number | null
}

export const GPA_STORAGE_KEY = 'toolbox.gpa.v1'
export const RETAKE_POINT = 1.5
export const MAX_POINT = 5

export const MODE_LABELS: Record<ScoreMode, string> = {
  hundred: '百分制',
  five: '五级计分制',
  two: '二级计分制',
}

export const FIVE_LEVELS = ['优秀', '良好', '中等', '及格', '不及格'] as const
export const TWO_LEVELS = ['合格', '不合格'] as const

const FIVE_POINTS: Record<string, number> = {
  优秀: 5,
  良好: 4,
  中等: 3,
  及格: 2,
  不及格: 0,
}

const TWO_POINTS: Record<string, number> = {
  合格: 3,
  不合格: 0,
}

/** 百分制分数 → 绩点；超出 0~100 视为无效 */
export function hundredPoint(score: number): number | null {
  if (!Number.isFinite(score) || score < 0 || score > 100) return null
  if (score >= 95) return MAX_POINT
  if (score >= 90) return floor1(4.5 + (score - 90) * 0.1)
  if (score >= 80) return floor1(3.5 + (score - 80) * 0.1)
  if (score >= 70) return floor1(2.5 + (score - 70) * 0.1)
  if (score >= 60) return floor1(1.5 + (score - 60) * 0.1)
  return 0
}

/** 不考虑补考的原生绩点 */
export function basePoint(course: Pick<GpaCourse, 'mode' | 'score'>): number | null {
  const raw = course.score.trim()
  if (!raw) return null

  if (course.mode === 'hundred') {
    const value = Number(raw)
    return hundredPoint(value)
  }
  if (course.mode === 'five') {
    return Object.prototype.hasOwnProperty.call(FIVE_POINTS, raw)
      ? FIVE_POINTS[raw]
      : null
  }
  if (course.mode === 'two') {
    return Object.prototype.hasOwnProperty.call(TWO_POINTS, raw)
      ? TWO_POINTS[raw]
      : null
  }
  return null
}

/** 计入补考规则后的最终绩点 */
export function coursePoint(course: GpaCourse): number | null {
  const base = basePoint(course)
  if (base === null) return null
  if (!course.retake) return base
  // 补考及格记 1.5；补考仍不及格保持 0
  return base > 0 ? RETAKE_POINT : base
}

export function summarize(courses: GpaCourse[]): GpaSummary {
  let credit = 0
  let weighted = 0
  let count = 0

  for (const course of courses) {
    const point = coursePoint(course)
    const courseCredit = course.credit
    if (point === null || courseCredit === null || !(courseCredit > 0)) continue
    credit += courseCredit
    weighted += courseCredit * point
    count += 1
  }

  return {
    gpa: credit > 0 ? weighted / credit : null,
    countedCredit: credit,
    courseCount: count,
  }
}

export function formatGpa(gpa: number | null): string {
  return gpa === null ? '--' : gpa.toFixed(3)
}

export function formatPoint(point: number | null): string {
  return point === null ? '—' : point.toFixed(1)
}

export function createCourse(
  partial: Partial<Omit<GpaCourse, 'id'>> = {},
): GpaCourse {
  return {
    id: createId(),
    name: partial.name ?? '',
    credit: partial.credit ?? null,
    mode: partial.mode ?? 'hundred',
    score: partial.score ?? '',
    retake: partial.retake ?? false,
  }
}

export function readCourses(): GpaCourse[] {
  try {
    const raw = localStorage.getItem(GPA_STORAGE_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return []
    const list = (parsed as { courses?: unknown }).courses
    if (!Array.isArray(list)) return []

    const courses: GpaCourse[] = []
    for (const item of list) {
      if (typeof item !== 'object' || item === null) continue
      const record = item as Record<string, unknown>

      const creditRaw = record.credit
      const credit =
        typeof creditRaw === 'number' &&
        Number.isFinite(creditRaw) &&
        creditRaw > 0
          ? creditRaw
          : null

      courses.push({
        id:
          typeof record.id === 'string' && record.id ? record.id : createId(),
        name: typeof record.name === 'string' ? record.name : '',
        credit,
        mode: isScoreMode(record.mode) ? record.mode : 'hundred',
        score: typeof record.score === 'string' ? record.score : '',
        retake: record.retake === true,
      })
    }
    return courses
  } catch {
    return []
  }
}

export function saveCourses(courses: GpaCourse[]): boolean {
  try {
    localStorage.setItem(
      GPA_STORAGE_KEY,
      JSON.stringify({ version: 1, courses }),
    )
    return true
  } catch {
    return false
  }
}

/** 把学习通课程合并进现有列表：同名校不重复，已有的分数一律保留 */
export function mergeCourses(
  existing: GpaCourse[],
  incoming: ChaoxingCourseSeed[],
): { courses: GpaCourse[]; added: number } {
  const known = new Set(
    existing.map((course) => course.name.trim()).filter(Boolean),
  )
  const added: GpaCourse[] = []

  for (const item of incoming) {
    const name = item.name.trim()
    if (!name || known.has(name)) continue
    known.add(name)
    added.push(createCourse({ name, credit: item.credit, mode: 'hundred' }))
  }

  return { courses: [...existing, ...added], added: added.length }
}

function isScoreMode(value: unknown): value is ScoreMode {
  return value === 'hundred' || value === 'five' || value === 'two'
}

function floor1(value: number): number {
  return Math.floor(value * 10 + 1e-6) / 10
}

function createId(): string {
  return `gpa-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
}
