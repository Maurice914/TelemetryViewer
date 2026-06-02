import { useState, useRef, useEffect, ReactNode } from 'react'
import styles from './Splitter.module.css'

interface SplitterProps {
  orientation: 'vertical' | 'horizontal'
  children: ReactNode[]
  minSize?: number
  onAdd?: () => void
  initialSizes?: number[]
  onSizesChange?: (sizes: number[]) => void
}

function Splitter({ orientation, children, minSize = 8, onAdd, initialSizes, onSizesChange }: SplitterProps) {
  const [sizes, setSizes] = useState<number[]>(() => {
    if (initialSizes && initialSizes.length === children.length) return initialSizes
    return children.map(() => 100 / children.length)
  })
  const sizesRef = useRef(sizes)
  sizesRef.current = sizes
  const containerRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{
    index: number
    startMouse: number
    startSize: number
    containerSize: number
  } | null>(null)

  useEffect(() => {
    setSizes((prev) => {
      if (prev.length === children.length) return prev
      return children.map(() => 100 / children.length)
    })
  }, [children.length])

  function onDividerMouseDown(e: React.MouseEvent, index: number) {
    e.preventDefault()
    const el = containerRef.current
    if (!el) return
    const vert = orientation === 'vertical'
    dragRef.current = {
      index,
      startMouse: vert ? e.clientX : e.clientY,
      startSize: sizes[index],
      containerSize: vert ? el.clientWidth : el.clientHeight
    }
  }

  useEffect(() => {
    function onMouseMove(e: MouseEvent) {
      const d = dragRef.current
      if (!d) return
      const vert = orientation === 'vertical'
      const current = vert ? e.clientX : e.clientY
      const delta = ((current - d.startMouse) / d.containerSize) * 100
      const newSize = Math.max(minSize, Math.min(d.startSize + delta, 100 - minSize))
      setSizes((prev) => {
        const next = [...prev]
        const change = newSize - prev[d.index]
        next[d.index] = newSize
        next[d.index + 1] = prev[d.index + 1] - change
        return next
      })
    }
    function onMouseUp() {
      dragRef.current = null
      onSizesChange?.(sizesRef.current)
    }
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
  }, [orientation, minSize])

  const dim = orientation === 'vertical' ? 'width' : 'height'
  const cursor = orientation === 'vertical' ? 'col-resize' : 'row-resize'

  const items: ReactNode[] = []
  for (let i = 0; i < children.length; i++) {
    if (i > 0) {
      items.push(
        <div
          key={`div-${i}`}
          className={styles.splitter}
          style={{ [dim]: 2, cursor, flexShrink: 0 }}
          onMouseDown={(e) => onDividerMouseDown(e, i - 1)}
        />
      )
    }
    items.push(
      <div
        key={`child-${i}`}
        style={{ flex: `${sizes[i]} 1 0`, overflow: 'hidden', minHeight: 0, minWidth: 0 }}
      >
        {children[i]}
      </div>
    )
  }
  if (onAdd) {
    items.push(
      <div
        key="add"
        onClick={onAdd}
        style={{
          flexShrink: 0,
          [dim]: 22,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 16,
          fontWeight: 700,
          color: '#999',
          borderTop: orientation !== 'vertical' ? '1px solid #ccc' : undefined,
          borderLeft: orientation === 'vertical' ? '1px solid #ccc' : undefined,
          userSelect: 'none'
        }}
        title="Add pane"
      >
        +
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      style={{
        display: 'flex',
        flexDirection: orientation === 'vertical' ? 'row' : 'column',
        width: '100%',
        height: '100%',
        overflow: 'hidden'
      }}
    >
      {items}
    </div>
  )
}

export default Splitter
