import { useState, useRef, useEffect } from 'react'
import { screenToViewBox } from './projection'

export function usePanZoom(
  svgRef: React.RefObject<SVGSVGElement | null>,
  containerRef: React.RefObject<HTMLDivElement | null>
) {
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [scale, setScale] = useState(1)

  const dragging = useRef(false)
  const dragStart = useRef({ mouseX: 0, mouseY: 0, panX: 0, panY: 0 })

  function handlePanMouseDown(e: React.MouseEvent) {
    e.preventDefault()
    dragging.current = true
    dragStart.current = {
      mouseX: e.clientX,
      mouseY: e.clientY,
      panX: pan.x,
      panY: pan.y
    }
  }

  useEffect(() => {
    function handleMouseMove(e: MouseEvent) {
      if (!dragging.current) return
      const svg = svgRef.current
      if (!svg) return
      const rect = svg.getBoundingClientRect()
      const dx = e.clientX - dragStart.current.mouseX
      const dy = e.clientY - dragStart.current.mouseY
      const scaleFactor = Math.min(rect.width, rect.height) / 800
      setPan({
        x: dragStart.current.panX + dx / scaleFactor,
        y: dragStart.current.panY + dy / scaleFactor
      })
    }

    function handleMouseUp() {
      dragging.current = false
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [svgRef])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    function onWheel(e: WheelEvent) {
      e.preventDefault()
      const svg = svgRef.current
      if (!svg) return
      const rect = svg.getBoundingClientRect()
      const mouse = screenToViewBox(e.clientX, e.clientY, rect)
      let newScale = scale - e.deltaY * 0.001 * scale
      newScale = Math.max(0.5, Math.min(newScale, 50))
      const newPanX = mouse.x - ((mouse.x - pan.x) / scale) * newScale
      const newPanY = mouse.y - ((mouse.y - pan.y) / scale) * newScale
      setPan({ x: newPanX, y: newPanY })
      setScale(newScale)
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [scale, pan])

  return { pan, scale, handlePanMouseDown, dragging }
}
