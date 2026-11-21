/**
 * 运行环境判断。
 *
 * 作业提醒和 GPA 的学习通同步都依赖本机 FastAPI 后端（127.0.0.1:8000），
 * 部署到 GitHub Pages / Vercel 这类静态托管后这些能力不可用，
 * 需要用这个判断在界面上给出明确提示，而不是让用户对着报错猜。
 */

const LOCAL_HOSTNAMES = new Set(['127.0.0.1', 'localhost', '::1', '[::1]'])

export function isLocalHost(): boolean {
  if (typeof window === 'undefined') return true
  return LOCAL_HOSTNAMES.has(window.location.hostname)
}

/** 静态托管（公网）环境下只保留纯前端功能 */
export function isStaticHosting(): boolean {
  return !isLocalHost()
}
