export const USAGE_STORAGE_KEY = 'toolbox.usage.v1'

export type UsageMap = Record<string, number>

const ROUTE_TO_TOOL: Record<string, string> = {
  '/kazhengtong': 'kazhengtong',
  '/homework': 'homework',
  '/compress': 'compress',
  '/links': 'links',
}

export function toolIdForRoute(route: string): string | undefined {
  return ROUTE_TO_TOOL[route]
}

export function readUsage(): UsageMap {
  try {
    const raw = localStorage.getItem(USAGE_STORAGE_KEY)
    if (!raw) return {}
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {}
    const usage: UsageMap = {}
    for (const [toolId, value] of Object.entries(parsed)) {
      if (typeof value !== 'number' || !Number.isFinite(value) || value < 1) continue
      usage[toolId] = Math.floor(value)
    }
    return usage
  } catch {
    return {}
  }
}

export function recordToolOpen(toolId: string): void {
  const usage = readUsage()
  usage[toolId] = (usage[toolId] ?? 0) + 1
  try {
    localStorage.setItem(USAGE_STORAGE_KEY, JSON.stringify(usage))
  } catch {
    // 无痕模式下写入会抛错，使用次数只在当前页面保留
  }
}

export function clearUsage(): void {
  try {
    localStorage.removeItem(USAGE_STORAGE_KEY)
  } catch {
    // 统计只影响排序，清不掉也不影响功能
  }
}

export function rankToolIds(usage: UsageMap, limit: number): string[] {
  return Object.entries(usage)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([toolId]) => toolId)
}
