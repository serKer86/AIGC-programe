import { useId, useState } from 'react'
import type { HomeworkItem as HomeworkItemData } from '../api/homework'
import { HomeworkItem } from './HomeworkItem'

export function HomeworkCourseGroup({
  items,
}: {
  items: HomeworkItemData[]
}) {
  const [expanded, setExpanded] = useState(false)
  const panelId = useId()
  const visibleItems = expanded ? items : items.slice(0, 1)
  const hiddenCount = items.length - 1

  return (
    <li className={`work-group${expanded ? ' is-expanded' : ''}`}>
      <ul className="work-group__items" id={panelId}>
        {visibleItems.map((item, index) => (
          <HomeworkItem
            key={`${item.title}-${item.deadline}-${index}`}
            item={item}
          />
        ))}
      </ul>
      <div className="work-group__foot">
        {hiddenCount > 0 && (
          <button
            type="button"
            className="work-group__toggle"
            aria-expanded={expanded}
            aria-controls={panelId}
            onClick={() => setExpanded((value) => !value)}
          >
            {expanded ? '收起' : `展开全部 ${items.length} 项`}
            <span
              className={`work-group__caret${expanded ? ' is-open' : ''}`}
              aria-hidden="true"
            />
          </button>
        )}
      </div>
    </li>
  )
}
