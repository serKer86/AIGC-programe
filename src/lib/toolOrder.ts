const ORDER_STORAGE_KEY = 'toolbox.toolOrder.v1'

export function readToolOrder(): string[] {
  try {
    const raw = localStorage.getItem(ORDER_STORAGE_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    const ids: string[] = []
    for (const value of parsed) {
      if (typeof value === 'string' && value && !ids.includes(value)) ids.push(value)
    }
    return ids
  } catch {
    return []
  }
}

export function saveToolOrder(ids: string[]): boolean {
  try {
    localStorage.setItem(ORDER_STORAGE_KEY, JSON.stringify(ids))
    return true
  } catch {
    return false
  }
}

export function applyToolOrder<T extends { id: string }>(tools: T[], order: string[]): T[] {
  if (!order.length) return tools
  const byId = new Map(tools.map((tool) => [tool.id, tool] as const))
  const placed = new Set<string>()
  const sorted: T[] = []
  for (const id of order) {
    const tool = byId.get(id)
    if (!tool || placed.has(id)) continue
    sorted.push(tool)
    placed.add(id)
  }
  for (const tool of tools) {
    if (!placed.has(tool.id)) sorted.push(tool)
  }
  return sorted
}
