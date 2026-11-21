const EMBLEM_SRC = `${import.meta.env.BASE_URL}brand/hdu-emblem.svg`
const EMBLEM_ALT = '杭州电子科技大学校徽'
const SCHOOL_HOME = 'https://www.hdu.edu.cn/'

/** 页脚用的校名标识：校徽 + 校名，随内容流排布 */
export function SchoolMark() {
  return (
    <span className="school-mark">
      <img
        className="school-mark__emblem"
        src={EMBLEM_SRC}
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
 * 右下角校徽角标：只在宽屏出现，低透明度，悬停才完全显示，
 * 保证"角落有杭电的辨识度"又不抢内容。
 */
export function CornerSeal() {
  return (
    <a
      className="school-seal"
      href={SCHOOL_HOME}
      target="_blank"
      rel="noopener noreferrer"
      title="杭州电子科技大学 · 校园工具箱"
      aria-label="杭州电子科技大学官网"
    >
      <img
        className="school-seal__img"
        src={EMBLEM_SRC}
        alt={EMBLEM_ALT}
        width={34}
        height={34}
        loading="lazy"
        decoding="async"
      />
    </a>
  )
}
