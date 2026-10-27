import type { HomeworkItem } from '../api/homework'

export function formatHomeworkDate(value: string | null | undefined): string {
  if (!value) return '时间未知'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '时间未知'
  const pad = (part: number) => String(part).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate(),
  )} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export function sortHomework(items: HomeworkItem[]): HomeworkItem[] {
  return [...items].sort((left, right) => {
    const leftTop = left.status === '未交' ? 0 : 1
    const rightTop = right.status === '未交' ? 0 : 1
    if (leftTop !== rightTop) return leftTop - rightTop

    const leftTime = Date.parse(left.deadline)
    const rightTime = Date.parse(right.deadline)
    const leftMissing = Number.isNaN(leftTime)
    const rightMissing = Number.isNaN(rightTime)
    if (leftMissing && rightMissing) return 0
    if (leftMissing) return 1
    if (rightMissing) return -1
    return leftTime - rightTime
  })
}
