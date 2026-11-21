import { useEffect, useState } from 'react'
import {
  describeWeather,
  fetchWeather,
  readWeatherCache,
  type WeatherNow,
} from '../lib/weather'

type IconName = ReturnType<typeof describeWeather>['icon']

function WeatherIcon({ name }: { name: IconName }) {
  const common = {
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.7,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
    className: 'weather-chip__icon',
  }

  if (name === 'sun') {
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="4.2" />
        <path d="M12 3.2v1.8M12 19v1.8M3.2 12h1.8M19 12h1.8M5.8 5.8l1.3 1.3M16.9 16.9l1.3 1.3M18.2 5.8l-1.3 1.3M7.1 16.9l-1.3 1.3" />
      </svg>
    )
  }

  if (name === 'sun-cloud') {
    return (
      <svg {...common}>
        <circle cx="8.6" cy="8.4" r="2.6" />
        <path d="M8.6 3.4v1.6M3.6 8.4H5.2M5.1 4.9l1.1 1.1M12.1 4.9l-1.1 1.1" />
        <path d="M8.4 18.5h9.3a3.4 3.4 0 0 0 .3-6.8 4.8 4.8 0 0 0-9.1-1.1 3.6 3.6 0 0 0-.5 7.9z" />
      </svg>
    )
  }

  if (name === 'rain') {
    return (
      <svg {...common}>
        <path d="M7 15.5h9.8a3.4 3.4 0 0 0 .3-6.8 5 5 0 0 0-9.5-1 3.7 3.7 0 0 0-.6 7.8z" />
        <path d="M9.2 18.4l-.9 2.1M12.4 18.4l-.9 2.1M15.6 18.4l-.9 2.1" />
      </svg>
    )
  }

  if (name === 'snow') {
    return (
      <svg {...common}>
        <path d="M7 14.8h9.8a3.4 3.4 0 0 0 .3-6.8 5 5 0 0 0-9.5-1 3.7 3.7 0 0 0-.6 7.8z" />
        <path d="M9 19.6h.01M12 21h.01M15 19.6h.01" strokeWidth="2.4" />
      </svg>
    )
  }

  if (name === 'thunder') {
    return (
      <svg {...common}>
        <path d="M7 14.6h9.8a3.4 3.4 0 0 0 .3-6.8 5 5 0 0 0-9.5-1 3.7 3.7 0 0 0-.6 7.8z" />
        <path d="M12.6 17.2l-1.7 2.9h2.2l-1.4 2.6" />
      </svg>
    )
  }

  if (name === 'fog') {
    return (
      <svg {...common}>
        <path d="M7 13.5h9.8a3.4 3.4 0 0 0 .3-6.8 5 5 0 0 0-9.5-1 3.7 3.7 0 0 0-.6 7.8z" />
        <path d="M6 17.4h12M8.4 20.2h7.2" />
      </svg>
    )
  }

  return (
    <svg {...common}>
      <path d="M6.6 16.8h10.8a3.5 3.5 0 0 0 .3-7 5.2 5.2 0 0 0-9.9-1.1 3.8 3.8 0 0 0-1.2 8.1z" />
    </svg>
  )
}

export function WeatherChip() {
  const [cache] = useState(() => readWeatherCache())
  const [data, setData] = useState<WeatherNow | null>(cache.data)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    // 缓存还新鲜就直接用，只有在过期或没有数据时才打接口
    if (cache.fresh) return

    const controller = new AbortController()
    let alive = true
    fetchWeather(controller.signal)
      .then((next) => {
        if (!alive) return
        setData(next)
        setFailed(false)
      })
      .catch(() => {
        // 拿不到就安静地不显示，不留半截错误提示在首屏
        if (alive) setFailed(true)
      })

    return () => {
      alive = false
      controller.abort()
    }
  }, [cache.fresh])

  if (!data && failed) return null

  const view = data ? describeWeather(data.code) : null
  const label = data
    ? `杭州今天${view?.label ?? ''}，${Math.round(data.temp)} 度，最高 ${Math.round(data.high)} 度，最低 ${Math.round(data.low)} 度，体感 ${Math.round(data.feels)} 度`
    : '正在获取杭州天气'

  return (
    <span
      className="weather-chip"
      role="status"
      aria-label={label}
      title={
        data
          ? `今日 ${Math.round(data.low)}° ~ ${Math.round(data.high)}° · 体感 ${Math.round(data.feels)}° · 湿度 ${Math.round(data.humidity)}%`
          : '正在获取杭州天气'
      }
    >
      {view ? <WeatherIcon name={view.icon} /> : <span className="weather-chip__dot" aria-hidden="true" />}
      <span className="weather-chip__city">杭州</span>
      <b className="weather-chip__temp">{data ? `${Math.round(data.temp)}°` : '--°'}</b>
      {view && <span className="weather-chip__desc">{view.label}</span>}
    </span>
  )
}
