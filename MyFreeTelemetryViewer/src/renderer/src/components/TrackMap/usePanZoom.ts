import { useState, useRef, useEffect } from 'react'
import { screenToViewBox, PixelPoint } from './projection'

export function usePanZoom(
  svgRef: React.RefObject<SVGSVGElement | null>,
  containerRef: React.RefObject<HTMLDivElement | null>,
  pixelPoints: PixelPoint[][],
  cornerHighlight: { startPct: number; endPct: number } | null
) {
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [scale, setScale] = useState(1)
  const panRef = useRef(pan)
  const scaleRef = useRef(scale)
  panRef.current = pan
  scaleRef.current = scale

  const dragging = useRef(false)
  const dragStart = useRef({ mouseX: 0, mouseY: 0, panX: 0, panY: 0 })
  const prevViewRef = useRef<{ pan: { x: number; y: number }; scale: number } | null>(null)

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

  useEffect(() => {
    if (cornerHighlight === null) {
      if (prevViewRef.current) {
        setPan(prevViewRef.current.pan)
        setScale(prevViewRef.current.scale)
        prevViewRef.current = null
      }
      return
    }

    if (pixelPoints.length === 0) return

    if (!prevViewRef.current) {
      prevViewRef.current = { pan: { ...panRef.current }, scale: scaleRef.current }
    }

    const { startPct, endPct } = cornerHighlight
    const allPts = pixelPoints.flat().filter(
      (p) => p.lapDistPct >= startPct && p.lapDistPct <= endPct
    )

    if (allPts.length === 0) return

    const xs = allPts.map((p) => p.x)
    const ys = allPts.map((p) => p.y)
    const minX = Math.min(...xs)
    const maxX = Math.max(...xs)
    const minY = Math.min(...ys)
    const maxY = Math.max(...ys)

    const boxW = maxX - minX || 1
    const boxH = maxY - minY || 1
    const padding = 40
    const centerX = (minX + maxX) / 2
    const centerY = (minY + maxY) / 2

    const targetScale = Math.min(
      560 / (boxW + 2 * padding),
      560 / (boxH + 2 * padding)
    )
    const clampedScale = Math.max(0.5, Math.min(targetScale, 50))

    setPan({ x: 400 - centerX * clampedScale, y: 400 - centerY * clampedScale })
    setScale(clampedScale)
  }, [cornerHighlight, pixelPoints])

  return { pan, scale, handlePanMouseDown, dragging }
}
