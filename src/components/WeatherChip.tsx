import { useCallback, useEffect, useRef, useState } from 'react'
import {
  WEATHER_PLACES,
  WEATHER_REFRESH_MS,
  describeWeather,
  fetchWeather,
  findPlace,
  isFresh,
  readPlaceId,
  readWeatherStore,
  savePlaceId,
  saveWeatherEntry,
  type WeatherIconName,
  type WeatherPlaceId,
  type WeatherStore,
} from '../lib/weather'

function WeatherIcon({ name, className }: { name: WeatherIconName; className?: string }) {
  const common = {
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.7,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
    className,
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

function formatTime(at: number): string {
  const date = new Date(at)
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

export function WeatherChip() {
  const [store, setStore] = useState<WeatherStore>(readWeatherStore)
  const [placeId, setPlaceId] = useState<WeatherPlaceId>(readPlaceId)
  const [open, setOpen] = useState(false)
  const [pending, setPending] = useState(false)
  const [failed, setFailed] = useState(false)

  const chipRef = useRef<HTMLButtonElement>(null)
  const popRef = useRef<HTMLDivElement>(null)

  const place = findPlace(placeId)
  const entry = store[placeId]
  const data = entry?.data ?? null

  const load = useCallback(
    async (id: WeatherPlaceId, force: boolean, showPending = false) => {
      if (!force && isFresh(readWeatherStore()[id])) return
      if (showPending) setPending(true)
      try {
        const next = await fetchWeather(findPlace(id))
        setStore(saveWeatherEntry(id, next))
        setFailed(false)
      } catch {
        setFailed(true)
      } finally {
        if (showPending) setPending(false)
      }
    },
    [],
  )

  useEffect(() => {
    // 首次进入 / 切换校区：缓存过期才发请求；state 只在 await 之后写入
    // oxlint-disable-next-line react/set-state-in-effect
    void load(placeId, false)
  }, [placeId, load])

  // 页面长期开着时，每 30 分钟静默刷新一次
  useEffect(() => {
    const timer = window.setInterval(() => {
      void load(placeId, true)
    }, WEATHER_REFRESH_MS)
    return () => window.clearInterval(timer)
  }, [placeId, load])

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null
      if (!target) return
      if (popRef.current?.contains(target) || chipRef.current?.contains(target)) return
      setOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  if (!data && failed) return null

  const view = data ? describeWeather(data.code) : null
  const tomorrowView = data?.tomorrow ? describeWeather(data.tomorrow.code) : null
  const summary = data
    ? `${place.label}今天${view?.label ?? ''}，${Math.round(data.temp)} 度，最高 ${Math.round(data.high)} 度，最低 ${Math.round(data.low)} 度`
    : `正在获取${place.label}天气`

  const choosePlace = (id: WeatherPlaceId) => {
    setPlaceId(id)
    savePlaceId(id)
  }

  return (
    <>
      <button
        type="button"
        ref={chipRef}
        className="weather-chip"
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={summary}
        title={
          data
            ? `${place.label} · 今日 ${Math.round(data.low)}° ~ ${Math.round(data.high)}° · 体感 ${Math.round(data.feels)}°`
            : `正在获取${place.label}天气`
        }
        onClick={() => setOpen((value) => !value)}
      >
        {view ? (
          <WeatherIcon name={view.icon} className="weather-chip__icon" />
        ) : (
          <span className="weather-chip__dot" aria-hidden="true" />
        )}
        <span className="weather-chip__city">{place.short}</span>
        <b className="weather-chip__temp">{data ? `${Math.round(data.temp)}°` : '--°'}</b>
        {view && <span className="weather-chip__desc">{view.label}</span>}
        {data && (
          <span className="weather-chip__range">
            {Math.round(data.low)}°/{Math.round(data.high)}°
          </span>
        )}
      </button>

      {open && (
        <div className="weather-pop" role="dialog" aria-label="天气详情" ref={popRef}>
          <div className="weather-pop__places" role="group" aria-label="选择校区">
            {WEATHER_PLACES.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`weather-place${item.id === placeId ? ' is-active' : ''}`}
                aria-pressed={item.id === placeId}
                onClick={() => choosePlace(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>

          {data && view ? (
            <>
              <div className="weather-pop__now">
                <WeatherIcon name={view.icon} className="weather-pop__icon" />
                <span className="weather-pop__temp">{Math.round(data.temp)}°</span>
                <span className="weather-pop__desc">{view.label}</span>
              </div>

              <dl className="weather-pop__facts">
                <div>
                  <dt>今日</dt>
                  <dd>
                    {Math.round(data.low)}° ~ {Math.round(data.high)}°
                  </dd>
                </div>
                <div>
                  <dt>体感</dt>
                  <dd>{Math.round(data.feels)}°</dd>
                </div>
                <div>
                  <dt>湿度</dt>
                  <dd>{Math.round(data.humidity)}%</dd>
                </div>
                <div>
                  <dt>风速</dt>
                  <dd>{Math.round(data.wind)} km/h</dd>
                </div>
              </dl>

              {data.tomorrow && tomorrowView && (
                <div className="weather-pop__tomorrow">
                  <span className="weather-pop__tomorrow-label">明天</span>
                  <WeatherIcon name={tomorrowView.icon} className="weather-pop__tomorrow-icon" />
                  <span>{tomorrowView.label}</span>
                  <b>
                    {Math.round(data.tomorrow.low)}° / {Math.round(data.tomorrow.high)}°
                  </b>
                </div>
              )}
            </>
          ) : (
            <p className="weather-pop__empty">正在获取{place.label}的天气…</p>
          )}

          <div className="weather-pop__foot">
            <span>{data ? `更新于 ${formatTime(entry?.savedAt ?? data.at)}` : '尚未获取'}</span>
            <button
              type="button"
              className="weather-pop__refresh"
              onClick={() => void load(placeId, true, true)}
              disabled={pending}
            >
              {pending ? '刷新中…' : '刷新'}
            </button>
          </div>
        </div>
      )}
    </>
  )
}
