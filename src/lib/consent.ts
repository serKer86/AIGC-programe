/**
 * 免责声明的用户确认状态。
 *
 * 只记录"是否已确认"，不含任何个人信息。
 *
 * 键名带版本号：声明内容有实质变化时把 VERSION 加一，
 * 老用户会重新看到一次开屏声明，避免"同意的是旧条款"。
 * 当前版本：2（v1.5 调整了文案与公网/本机的区分）
 */

const VERSION = 2

export const DISCLAIMER_STORAGE_KEY = `toolbox.disclaimer.v${VERSION}`

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

/** 清掉已确认状态，下次打开会重新弹声明（供「关于」页的调试/重看使用） */
export function resetDisclaimer(): void {
  try {
    localStorage.removeItem(DISCLAIMER_STORAGE_KEY)
    sessionStorage.removeItem(DISCLAIMER_STORAGE_KEY)
  } catch {
    // 清理失败不影响其它功能
  }
}
