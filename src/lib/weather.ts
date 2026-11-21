/**
 * 首页天气：两个固定校区坐标，用 Open-Meteo 的免密钥接口。
 *
 * 隐私：请求只带固定经纬度和日期，不包含任何用户标识，也不需要定位权限；
 * 结果按校区缓存在本地，15 分钟内不重复请求。
 */

export type WeatherPlaceId = 'xiasha' | 'shaoxing'

export interface WeatherPlace {
  id: WeatherPlaceId
  label: string
  short: string
  latitude: number
  longitude: number
}

export const WEATHER_PLACES: WeatherPlace[] = [
  {
    id: 'xiasha',
    label: '下沙校区',
    short: '下沙',
    latitude: 30.3205,
    longitude: 120.3523,
  },
  {
    id: 'shaoxing',
    label: '绍兴校区',
    short: '绍兴',
    latitude: 30.0092,
    longitude: 120.6642,
  },
]

export function findPlace(id: string): WeatherPlace {
  return WEATHER_PLACES.find((place) => place.id === id) ?? WEATHER_PLACES[0]
}

export interface WeatherDay {
  high: number
  low: number
  code: number
}

export interface WeatherNow {
  temp: number
  feels: number
  code: number
  humidity: number
  /** km/h */
  wind: number
  high: number
  low: number
  tomorrow: WeatherDay | null
  /** 数据时间戳（毫秒） */
  at: number
}

export interface WeatherCacheEntry {
  savedAt: number
  data: WeatherNow
}

export type WeatherStore = Partial<Record<WeatherPlaceId, WeatherCacheEntry>>

export const WEATHER_STORE_KEY = 'toolbox.weather.v2'
export const WEATHER_PLACE_KEY = 'toolbox.weather.place.v1'
export const WEATHER_TTL = 15 * 60 * 1000
/** 页面一直开着时的自动刷新间隔 */
export const WEATHER_REFRESH_MS = 30 * 60 * 1000

export type WeatherIconName =
  | 'sun'
  | 'sun-cloud'
  | 'cloud'
  | 'fog'
  | 'rain'
  | 'snow'
  | 'thunder'

const CODE_LABELS: {
  test: (code: number) => boolean
  label: string
  icon: WeatherIconName
}[] = [
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

export function readWeatherStore(): WeatherStore {
  try {
    const raw = localStorage.getItem(WEATHER_STORE_KEY)
    if (!raw) return {}
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return {}
    const store: WeatherStore = {}
    for (const place of WEATHER_PLACES) {
      const entry = (parsed as Record<string, unknown>)[place.id]
      if (typeof entry !== 'object' || entry === null) continue
      const record = entry as { savedAt?: unknown; data?: unknown }
      if (typeof record.savedAt !== 'number' || !isWeatherNow(record.data)) continue
      store[place.id] = { savedAt: record.savedAt, data: record.data }
    }
    return store
  } catch {
    return {}
  }
}

export function saveWeatherEntry(placeId: WeatherPlaceId, data: WeatherNow): WeatherStore {
  const store = readWeatherStore()
  const next: WeatherStore = { ...store, [placeId]: { savedAt: Date.now(), data } }
  try {
    localStorage.setItem(WEATHER_STORE_KEY, JSON.stringify(next))
  } catch {
    // 存不下也不影响显示
  }
  return next
}

export function isFresh(entry: WeatherCacheEntry | undefined): boolean {
  return !!entry && Date.now() - entry.savedAt < WEATHER_TTL
}

export function readPlaceId(): WeatherPlaceId {
  try {
    const raw = localStorage.getItem(WEATHER_PLACE_KEY)
    if (raw === 'shaoxing' || raw === 'xiasha') return raw
  } catch {
    // 读不到就用默认校区
  }
  return 'xiasha'
}

export function savePlaceId(id: WeatherPlaceId): void {
  try {
    localStorage.setItem(WEATHER_PLACE_KEY, id)
  } catch {
    // 同上
  }
}

interface RawResponse {
  current?: {
    temperature_2m?: number
    apparent_temperature?: number
    weather_code?: number
    relative_humidity_2m?: number
    wind_speed_10m?: number
  }
  daily?: {
    temperature_2m_max?: number[]
    temperature_2m_min?: number[]
    weather_code?: number[]
  }
}

export async function fetchWeather(
  place: WeatherPlace,
  signal?: AbortSignal,
): Promise<WeatherNow> {
  const url = new URL('https://api.open-meteo.com/v1/forecast')
  url.searchParams.set('latitude', String(place.latitude))
  url.searchParams.set('longitude', String(place.longitude))
  url.searchParams.set(
    'current',
    'temperature_2m,weather_code,apparent_temperature,relative_humidity_2m,wind_speed_10m',
  )
  url.searchParams.set('daily', 'temperature_2m_max,temperature_2m_min,weather_code')
  url.searchParams.set('timezone', 'Asia/Shanghai')
  url.searchParams.set('forecast_days', '2')

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

    const highs = raw.daily?.temperature_2m_max ?? []
    const lows = raw.daily?.temperature_2m_min ?? []
    const codes = raw.daily?.weather_code ?? []
    const tomorrow: WeatherDay | null =
      typeof highs[1] === 'number' && typeof lows[1] === 'number'
        ? { high: highs[1], low: lows[1], code: codes[1] ?? 2 }
        : null

    return {
      temp: current.temperature_2m,
      feels: current.apparent_temperature ?? current.temperature_2m,
      code: current.weather_code ?? 0,
      humidity: current.relative_humidity_2m ?? 0,
      wind: current.wind_speed_10m ?? 0,
      high: highs[0] ?? current.temperature_2m,
      low: lows[0] ?? current.temperature_2m,
      tomorrow,
      at: Date.now(),
    }
  } finally {
    window.clearTimeout(timer)
    signal?.removeEventListener('abort', abortFromCaller)
  }
}
