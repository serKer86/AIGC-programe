/**
 * 首页天气：固定取杭州（下沙校区附近）坐标，用 Open-Meteo 的免密钥接口。
 *
 * 隐私：请求只带固定经纬度和日期，不包含任何用户标识，也不需要定位权限；
 * 结果在本地缓存 15 分钟，避免每次进首页都打接口。
 */

export interface WeatherNow {
  /** 摄氏度 */
  temp: number
  /** 体感温度 */
  feels: number
  /** WMO weather code */
  code: number
  humidity: number
  /** 今日最高 / 最低 */
  high: number
  low: number
  /** 数据时间戳（毫秒） */
  at: number
}

type WeatherIconName =
  | 'sun'
  | 'sun-cloud'
  | 'cloud'
  | 'fog'
  | 'rain'
  | 'snow'
  | 'thunder'

export const WEATHER_CACHE_KEY = 'toolbox.weather.v1'
const CACHE_TTL = 15 * 60 * 1000
const HANGZHOU = { latitude: 30.3205, longitude: 120.3523 }

const CODE_LABELS: { test: (code: number) => boolean; label: string; icon: WeatherIconName }[] = [
  { test: (c) => c === 0, label: '晴', icon: 'sun' },
  { test: (c) => c === 1, label: '晴间多云', icon: 'sun-cloud' },
  { test: (c) => c === 2, label: '多云', icon: 'sun-cloud' },
  { test: (c) => c === 3, label: '阴', icon: 'cloud' },
  { test: (c) => c === 45 || c === 48, label: '雾', icon: 'fog' },
  { test: (c) => c >= 51 && c <= 57, label: '毛毛雨', icon: 'rain' },
  { test: (c) => (c >= 61 && c <= 67) || (c >= 80 && c <= 82), label: '雨', icon: 'rain' },
  { test: (c) => (c >= 71 && c <= 77) || (c >= 85 && c <= 86), label: '雪', icon: 'snow' },
  { test: (c) => c >= 95, label: '雷阵雨', icon: 'thunder' },
]

export function describeWeather(code: number): { label: string; icon: WeatherIconName } {
  const hit = CODE_LABELS.find((entry) => entry.test(code))
  return hit ? { label: hit.label, icon: hit.icon } : { label: '多云', icon: 'cloud' }
}

function isWeatherNow(value: unknown): value is WeatherNow {
  if (typeof value !== 'object' || value === null) return false
  const item = value as Record<string, unknown>
  return (
    typeof item.temp === 'number' &&
    typeof item.feels === 'number' &&
    typeof item.code === 'number' &&
    typeof item.humidity === 'number' &&
    typeof item.high === 'number' &&
    typeof item.low === 'number' &&
    typeof item.at === 'number'
  )
}

/** 读缓存；返回数据本身与是否仍然新鲜 */
export function readWeatherCache(): { data: WeatherNow | null; fresh: boolean } {
  try {
    const raw = localStorage.getItem(WEATHER_CACHE_KEY)
    if (!raw) return { data: null, fresh: false }
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return { data: null, fresh: false }
    const record = parsed as { data?: unknown; savedAt?: unknown }
    if (!isWeatherNow(record.data) || typeof record.savedAt !== 'number') {
      return { data: null, fresh: false }
    }
    return { data: record.data, fresh: Date.now() - record.savedAt < CACHE_TTL }
  } catch {
    return { data: null, fresh: false }
  }
}

function saveWeather(data: WeatherNow): void {
  try {
    localStorage.setItem(WEATHER_CACHE_KEY, JSON.stringify({ savedAt: Date.now(), data }))
  } catch {
    // 存不下也不影响显示
  }
}

interface RawResponse {
  current?: {
    temperature_2m?: number
    apparent_temperature?: number
    weather_code?: number
    relative_humidity_2m?: number
  }
  daily?: {
    temperature_2m_max?: number[]
    temperature_2m_min?: number[]
  }
}

export async function fetchWeather(signal?: AbortSignal): Promise<WeatherNow> {
  const url = new URL('https://api.open-meteo.com/v1/forecast')
  url.searchParams.set('latitude', String(HANGZHOU.latitude))
  url.searchParams.set('longitude', String(HANGZHOU.longitude))
  url.searchParams.set(
    'current',
    'temperature_2m,weather_code,apparent_temperature,relative_humidity_2m',
  )
  url.searchParams.set('daily', 'temperature_2m_max,temperature_2m_min')
  url.searchParams.set('timezone', 'Asia/Shanghai')
  url.searchParams.set('forecast_days', '1')

  const controller = new AbortController()
  const timer = window.setTimeout(() => controller.abort(), 8000)
  const abortFromCaller = () => controller.abort()
  signal?.addEventListener('abort', abortFromCaller, { once: true })

  try {
    const response = await fetch(url.toString(), { signal: controller.signal })
    if (!response.ok) throw new Error(`天气接口返回 ${response.status}`)
    const raw = (await response.json()) as RawResponse
    const current = raw.current
    if (!current || typeof current.temperature_2m !== 'number') {
      throw new Error('天气数据不完整')
    }
    const data: WeatherNow = {
      temp: current.temperature_2m,
      feels: current.apparent_temperature ?? current.temperature_2m,
      code: current.weather_code ?? 0,
      humidity: current.relative_humidity_2m ?? 0,
      high: raw.daily?.temperature_2m_max?.[0] ?? current.temperature_2m,
      low: raw.daily?.temperature_2m_min?.[0] ?? current.temperature_2m,
      at: Date.now(),
    }
    saveWeather(data)
    return data
  } finally {
    window.clearTimeout(timer)
    signal?.removeEventListener('abort', abortFromCaller)
  }
}
