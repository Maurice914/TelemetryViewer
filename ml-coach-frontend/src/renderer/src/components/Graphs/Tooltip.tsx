import { useRef, useLayoutEffect } from 'react'

interface TooltipProps {
  clientX: number
  clientY: number
  text: string
  visible: boolean
}

function Tooltip({ clientX, clientY, text, visible }: TooltipProps) {
  const ref = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    if (!visible || !ref.current) return
    const el = ref.current
    const w = el.offsetWidth
    const h = el.offsetHeight
    const pad = 12

    let left = clientX + pad
    let top = clientY - h - pad / 2

    if (left + w > window.innerWidth - pad) {
      left = clientX - w - pad
    }
    if (top < pad) {
      top = clientY + pad
    }

    el.style.left = `${left}px`
    el.style.top = `${top}px`
  }, [clientX, clientY, text, visible])

  if (!visible) return null

  return (
    <div
      ref={ref}
      style={{
        position: 'fixed',
        left: 0,
        top: 0,
        background: 'rgba(0,0,0,0.8)',
        color: '#fff',
        padding: '3px 8px',
        borderRadius: '4px',
        fontSize: '12px',
        fontFamily: 'monospace',
        pointerEvents: 'none',
        whiteSpace: 'nowrap',
        zIndex: 9999,
      }}
    >
      {text}
    </div>
  )
}

export default Tooltip
