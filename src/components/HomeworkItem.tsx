import type { HomeworkItem as HomeworkItemData } from '../api/homework'
import { formatHomeworkDate } from '../lib/homework'

const STATUS_TONES = {
  未交: 'warn',
  已交: 'ok',
  待批阅: 'info',
} as const

function deadlineLabel(value: string): string {
  if (!value || Number.isNaN(Date.parse(value))) return '截止时间未知'
  return `截止 ${formatHomeworkDate(value)}`
}

function remainingHours(item: HomeworkItemData): number {
  if (!item.deadline) return Number.POSITIVE_INFINITY
  const deadline = Date.parse(item.deadline)
  if (Number.isNaN(deadline)) return Number.POSITIVE_INFINITY
  return (deadline - Date.now()) / 3_600_000
}

function remainingLabel(hours: number): string {
  if (!Number.isFinite(hours)) return '截止时间未知'
  if (hours <= 0) return '已截止'
  if (hours < 1) return `剩余 ${Math.max(1, Math.round(hours * 60))} 分钟`
  if (hours < 24) return `剩余 ${Math.max(1, Math.floor(hours))} 小时`
  return `剩余 ${Math.ceil(hours / 24)} 天`
}

export function HomeworkItem({ item }: { item: HomeworkItemData }) {
  const hours = remainingHours(item)
  const urgent = Number.isFinite(hours) && hours <= 24

  return (
    <li className={`work-item${urgent ? ' is-urgent' : ''}`}>
      <div className="work-item__head">
        {item.courseName && (
          <span className="work-item__course">{item.courseName}</span>
        )}
        <span className={`tag tag--${STATUS_TONES[item.status]}`}>
          {item.status}
        </span>
        {urgent && <span className="tag tag--error">紧急</span>}
      </div>
      <p className="work-item__title" title={item.title}>
        {item.title}
      </p>
      <div className="work-item__meta">
        <span>{deadlineLabel(item.deadline)}</span>
        <span className={`work-item__remaining${urgent ? ' is-urgent' : ''}`}>
          {remainingLabel(hours)}
        </span>
      </div>
    </li>
  )
}
