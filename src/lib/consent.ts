/**
 * 免责声明的用户确认状态。
 *
 * 只记录"是否已确认"，不含任何个人信息：
 *   localStorage  accepted —— 下次访问不再提示
 *   sessionStorage deferred —— 本次会话不再打扰，下次打开仍会提示
 */

export const DISCLAIMER_STORAGE_KEY = 'toolbox.disclaimer.v1'

export function hasAcceptedDisclaimer(): boolean {
  try {
    if (localStorage.getItem(DISCLAIMER_STORAGE_KEY) === 'accepted') return true
    return sessionStorage.getItem(DISCLAIMER_STORAGE_KEY) === 'deferred'
  } catch {
    // 无痕模式下读取会抛错，按"未确认"处理即可
    return false
  }
}

export function acceptDisclaimer(): void {
  try {
    localStorage.setItem(DISCLAIMER_STORAGE_KEY, 'accepted')
  } catch {
    // 存不下也不影响使用，只是下次还会提示
  }
}

export function deferDisclaimer(): void {
  try {
    sessionStorage.setItem(DISCLAIMER_STORAGE_KEY, 'deferred')
  } catch {
    // 同上
  }
}
