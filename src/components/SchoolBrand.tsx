export const SCHOOL_EMBLEM_SRC = `${import.meta.env.BASE_URL}brand/hdu-emblem.svg`
const EMBLEM_ALT = '杭州电子科技大学校徽'

/** 页脚用的校名标识：校徽 + 校名，随内容流排布 */
export function SchoolMark() {
  return (
    <span className="school-mark">
      <img
        className="school-mark__emblem"
        src={SCHOOL_EMBLEM_SRC}
        alt={EMBLEM_ALT}
        width={20}
        height={20}
        loading="lazy"
        decoding="async"
      />
      <span className="school-mark__text">杭州电子科技大学</span>
    </span>
  )
}

/**
 * 右下角「关于本网站」入口：校徽 + 文字，点击进入站内关于页。
 * 桌面端常驻，窄屏交给页脚的同名链接，避免遮挡内容。
 */
export function AboutCornerButton() {
  return (
    <a
      className="corner-about"
      href="#/about"
      title="关于本网站"
      aria-label="关于本网站"
    >
      <img
        className="corner-about__emblem"
        src={SCHOOL_EMBLEM_SRC}
        alt={EMBLEM_ALT}
        width={22}
        height={22}
        loading="lazy"
        decoding="async"
      />
      <span className="corner-about__text">关于本网站</span>
    </a>
  )
}
