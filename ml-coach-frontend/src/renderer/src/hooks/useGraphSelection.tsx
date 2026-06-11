import { useState } from 'react'
import { useLapData } from '../contexts/LapDataContext'

export function useGraphSelection(svgRef: React.RefObject<SVGSVGElement | null>) {
  const { selection, setSelection, dragSelection, setDragSelection, setHoveredLapPct } = useLapData()
  const [isSelecting, setIsSelecting] = useState(false)
  const [selectStart, setSelectStart] = useState(0)
  const [selectEnd, setSelectEnd] = useState(0)

  function getPctFromMouse(e: React.MouseEvent<SVGSVGElement>): number | null {
    const rect = svgRef.current?.getBoundingClientRect()
    if (!rect) return null
    const x = e.clientX - rect.left
    const width = rect.width
    const localPct = x / width
    if (selection) {
      return selection.startPct + localPct * (selection.endPct - selection.startPct)
    }
    return localPct
  }

  function handleMouseDown(e: React.MouseEvent<SVGSVGElement>) {
    const pct = getPctFromMouse(e)
    if (pct === null) return
    setSelectStart(pct)
    setSelectEnd(pct)
    setIsSelecting(true)
    setDragSelection({ startPct: pct, endPct: pct })
    setHoveredLapPct(pct)
  }

  function trySelectInMove(e: React.MouseEvent<SVGSVGElement>): boolean {
    if (!isSelecting) return false
    const pct = getPctFromMouse(e)
    if (pct === null) return false
    setSelectEnd(pct)
    setDragSelection({
      startPct: Math.min(selectStart, pct),
      endPct: Math.max(selectStart, pct)
    })
    setHoveredLapPct(pct)
    return true
  }

  function handleMouseUp() {
    if (!isSelecting) return
    setIsSelecting(false)
    setDragSelection(null)
    setHoveredLapPct(null)
    const start = Math.min(selectStart, selectEnd)
    const end = Math.max(selectStart, selectEnd)
    if (end - start > 0.01) {
      setSelection({ startPct: start, endPct: end })
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') {
      setSelection(null)
      setDragSelection(null)
      setHoveredLapPct(null)
      setIsSelecting(false)
    }
  }

  function getSelectionRect(): React.ReactNode {
    const sel = dragSelection
    if (!sel) return null
    const svg = svgRef.current
    if (!svg) return null
    const width = svg.clientWidth
    const height = svg.clientHeight

    let start = sel.startPct
    let end = sel.endPct
    if (selection) {
      const range = selection.endPct - selection.startPct
      start = (sel.startPct - selection.startPct) / range
      end = (sel.endPct - selection.startPct) / range
    }

    const min = Math.min(start, end)
    const max = Math.max(start, end)

    return (
      <rect
        x={min * width}
        y={0}
        width={(max - min) * width}
        height={height}
        fill="blue"
        opacity={0.15}
      />
    )
  }

  return {
    isSelecting,
    selectStart,
    selectEnd,
    getPctFromMouse,
    handleMouseDown,
    trySelectInMove,
    handleMouseUp,
    handleKeyDown,
    getSelectionRect,
  }
}
