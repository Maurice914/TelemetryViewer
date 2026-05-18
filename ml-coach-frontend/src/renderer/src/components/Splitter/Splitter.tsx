import React, { useState, useRef, useEffect, ReactNode } from 'react'
import styles from './Splitter.module.css'

interface SplitterProps {
  orientation: 'vertical' | 'horizontal'
  initialSize?: number
  minSize?: number
  maxSize?: number
  firstChild: ReactNode
  secondChild: ReactNode
}

function Splitter({
  orientation,
  initialSize = 50,
  minSize = 10,
  maxSize = 90,
  firstChild,
  secondChild
}: SplitterProps): React.JSX.Element {
  const [size, setSize] = useState(initialSize)
  const containerRef = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)
  const dragStart = useRef({
    mousePos: 0,
    initialSize: 0,
    containerSize: 0
  })

  const isVerticalRef = useRef(orientation === 'vertical')
  isVerticalRef.current = orientation === 'vertical'

  function handleMouseDown(e: React.MouseEvent) {
    e.preventDefault()
    dragging.current = true
    const container = containerRef.current
    if (!container) return

    const vert = isVerticalRef.current
    const containerSize = vert ? container.clientWidth : container.clientHeight
    dragStart.current = {
      mousePos: vert ? e.clientX : e.clientY,
      initialSize: size,
      containerSize
    }
  }

  function handleMouseMove(e: MouseEvent) {
    if (!dragging.current) return
    const vert = isVerticalRef.current

    const currentMousePos = vert ? e.clientX : e.clientY
    const delta = currentMousePos - dragStart.current.mousePos
    const deltaPercent = (delta / dragStart.current.containerSize) * 100
    let newSize = dragStart.current.initialSize + deltaPercent
    newSize = Math.max(minSize, Math.min(newSize, maxSize))
    setSize(newSize)
  }

  function handleMouseUp() {
    dragging.current = false
  }

  useEffect(() => {
    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [handleMouseMove, handleMouseUp])

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
        <div style={{ flex: `${size} 1 0`, overflow: 'hidden' }}>{firstChild}</div>
        <div
          className={styles.splitter}
          style={{
            [orientation === 'vertical' ? 'width' : 'height']: '2px',
            cursor: orientation === 'vertical' ? 'col-resize' : 'row-resize',
            flexShrink: 0
          }}
        onMouseDown={handleMouseDown}
        draggable={false}
        onDragStart={(e) => e.preventDefault()}
      />
      <div style={{ flex: `${100 - size} 1 0`, overflow: 'hidden' }}>{secondChild}</div>
    </div>
  )
}

export default Splitter
