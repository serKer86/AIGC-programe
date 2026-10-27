export interface HomeworkHealth {
  status: string
  service: string
}

export interface ChaoxingStatus {
  bound: boolean
}

export type BindErrorCode =
  | 'INVALID_CREDENTIALS'
  | 'NEED_CAPTCHA'
  | 'NETWORK_ERROR'

export interface BindResult {
  ok: boolean
  code?: BindErrorCode
  message?: string
}

export type HomeworkStatus = '未交' | '已交' | '待批阅'

export interface HomeworkItem {
  courseName: string
  title: string
  deadline: string
  status: HomeworkStatus
}

export type FetchHomeworkErrorCode =
  | 'SESSION_EXPIRED'
  | 'PARSE_EMPTY'
  | 'INVALID_URL'
  | 'NETWORK_ERROR'

export interface FetchHomeworkResult {
  ok: boolean
  code?: FetchHomeworkErrorCode
  message?: string
  items?: HomeworkItem[]
  fetchedAt?: string
  sourceUrl?: string
}

export interface FailedCourse {
  courseName: string
  message: string
}

export interface FetchAllHomeworkResult extends FetchHomeworkResult {
  courseCount?: number
  failedCourses?: FailedCourse[]
}

export interface LastHomework {
  items: HomeworkItem[]
  fetchedAt: string | null
  sourceUrl: string | null
  courseCount: number | null
  failedCourses: FailedCourse[]
}

export const ALL_COURSES_SOURCE = 'all://courses'

const REQUEST_TIMEOUT_MS = 15_000
const FETCH_ALL_TIMEOUT_MS = 120_000

export class ApiTimeoutError extends Error {
  constructor() {
    super('请求超时')
    this.name = 'ApiTimeoutError'
  }
}

async function request(
  input: string,
  init: RequestInit = {},
  signal?: AbortSignal,
  timeoutMs = REQUEST_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController()
  let timedOut = false
  const timer = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, timeoutMs)

  const abortFromCaller = () => controller.abort()
  if (signal) {
    if (signal.aborted) controller.abort()
    else signal.addEventListener('abort', abortFromCaller, { once: true })
  }

  try {
    return await fetch(input, { ...init, signal: controller.signal })
  } catch (error) {
    if (timedOut) throw new ApiTimeoutError()
    throw error
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', abortFromCaller)
  }
}

async function readJson<T>(response: Response): Promise<T> {
  return (await response.json()) as T
}

export async function checkHealth(
  signal?: AbortSignal,
): Promise<HomeworkHealth> {
  const response = await request('/api/health', { cache: 'no-store' }, signal)
  if (!response.ok) {
    throw new Error(`本地后端返回 ${response.status}`)
  }

  const data = await readJson<Partial<HomeworkHealth>>(response)
  if (data.status !== 'ok') {
    throw new Error('本地后端状态异常')
  }

  return {
    status: data.status,
    service: data.service ?? 'homework-reminder',
  }
}

export async function fetchChaoxingStatus(
  signal?: AbortSignal,
): Promise<ChaoxingStatus> {
  const response = await request(
    '/api/chaoxing/status',
    { cache: 'no-store' },
    signal,
  )
  if (!response.ok) {
    throw new Error(`本地后端返回 ${response.status}`)
  }

  const data = await readJson<Partial<ChaoxingStatus>>(response)
  return { bound: data.bound === true }
}

export async function bindChaoxing(
  phone: string,
  password: string,
  signal?: AbortSignal,
): Promise<BindResult> {
  const response = await request(
    '/api/chaoxing/bind',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone, password }),
    },
    signal,
  )
  if (!response.ok) {
    throw new Error(`本地后端返回 ${response.status}`)
  }

  return readJson<BindResult>(response)
}

export async function unbindChaoxing(signal?: AbortSignal): Promise<void> {
  const response = await request(
    '/api/chaoxing/unbind',
    { method: 'POST' },
    signal,
  )
  if (!response.ok) {
    throw new Error(`本地后端返回 ${response.status}`)
  }

  const data = await readJson<{ ok?: boolean }>(response)
  if (data.ok !== true) {
    throw new Error('本地凭证删除失败')
  }
}

export async function fetchHomeworkList(
  workListUrl: string,
  signal?: AbortSignal,
): Promise<FetchHomeworkResult> {
  const response = await request(
    '/api/homework/fetch',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workListUrl }),
    },
    signal,
  )
  if (!response.ok) {
    throw new Error(`本地后端返回 ${response.status}`)
  }

  return readJson<FetchHomeworkResult>(response)
}

export async function fetchAllHomework(
  signal?: AbortSignal,
): Promise<FetchAllHomeworkResult> {
  const response = await request(
    '/api/homework/fetch-all',
    { method: 'POST' },
    signal,
    FETCH_ALL_TIMEOUT_MS,
  )
  if (!response.ok) {
    throw new Error(`本地后端返回 ${response.status}`)
  }

  return readJson<FetchAllHomeworkResult>(response)
}

export async function fetchLastHomework(
  signal?: AbortSignal,
): Promise<LastHomework> {
  const response = await request(
    '/api/homework/last',
    { cache: 'no-store' },
    signal,
  )
  if (!response.ok) {
    throw new Error(`本地后端返回 ${response.status}`)
  }

  const data = await readJson<Partial<LastHomework>>(response)
  return {
    items: Array.isArray(data.items) ? data.items : [],
    fetchedAt: typeof data.fetchedAt === 'string' ? data.fetchedAt : null,
    sourceUrl: typeof data.sourceUrl === 'string' ? data.sourceUrl : null,
    courseCount:
      typeof data.courseCount === 'number' ? data.courseCount : null,
    failedCourses: Array.isArray(data.failedCourses)
      ? data.failedCourses
      : [],
  }
}
