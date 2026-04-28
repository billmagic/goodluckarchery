import { useEffect, useRef, useState } from 'react'

type JoystickProps = {
  size?: number
  onStart?: () => void
  onChange?: (x: number, y: number) => void
  onEnd?: () => void
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

export default function Joystick({
  size = 140,
  onStart,
  onChange,
  onEnd,
}: JoystickProps) {
  const baseRef = useRef<HTMLDivElement | null>(null)
  const activePointerIdRef = useRef<number | null>(null)
  const startedRef = useRef(false)

  const [knob, setKnob] = useState({ x: 0, y: 0 })

  const radius = size * 0.5
  const knobRadius = size * 0.18
  const moveLimit = radius - knobRadius - 6

  const emitFromClientPoint = (clientX: number, clientY: number) => {
    if (!baseRef.current) return

    const rect = baseRef.current.getBoundingClientRect()
    const cx = rect.left + rect.width / 2
    const cy = rect.top + rect.height / 2

    let dx = clientX - cx
    let dy = clientY - cy

    const dist = Math.sqrt(dx * dx + dy * dy)
    if (dist > moveLimit && dist > 0) {
      const ratio = moveLimit / dist
      dx *= ratio
      dy *= ratio
    }

    setKnob({ x: dx, y: dy })

    const nx = clamp(dx / moveLimit, -1, 1)
    const ny = clamp(dy / moveLimit, -1, 1)

    onChange?.(nx, ny)
  }

  const resetJoystick = () => {
    setKnob({ x: 0, y: 0 })
    onChange?.(0, 0)
  }

  useEffect(() => {
    const handlePointerMove = (e: PointerEvent) => {
      if (activePointerIdRef.current !== e.pointerId) return
      emitFromClientPoint(e.clientX, e.clientY)
    }

    const handlePointerUp = (e: PointerEvent) => {
      if (activePointerIdRef.current !== e.pointerId) return
      try {
        if (baseRef.current?.releasePointerCapture) {
          baseRef.current.releasePointerCapture(e.pointerId)
        }
      } catch {
        // ignore
      }
      activePointerIdRef.current = null
      startedRef.current = false
      onEnd?.()
      resetJoystick()
    }

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)
    window.addEventListener('pointercancel', handlePointerUp)

    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
      window.removeEventListener('pointercancel', handlePointerUp)
    }
  }, [moveLimit, onChange, onEnd])

  return (
    <div
      ref={baseRef}
      onPointerDown={(e) => {
        const target = e.currentTarget
        activePointerIdRef.current = e.pointerId
        try {
          target.setPointerCapture(e.pointerId)
        } catch {
          // 일부 환경에서는 캡처 미지원
        }
        if (!startedRef.current) {
          startedRef.current = true
          onStart?.()
        }
        emitFromClientPoint(e.clientX, e.clientY)
      }}
      style={{
        position: 'relative',
        width: size,
        height: size,
        borderRadius: '50%',
        background: 'rgba(15, 23, 42, 0.32)',
        border: '2px solid rgba(255,255,255,0.16)',
        boxShadow: 'inset 0 8px 20px rgba(255,255,255,0.08), 0 10px 30px rgba(0,0,0,0.18)',
        touchAction: 'none',
        userSelect: 'none',
        WebkitUserSelect: 'none',
        WebkitTapHighlightColor: 'transparent',
        cursor: 'grab',
        backdropFilter: 'blur(6px)',
      }}
    >
      <div
        style={{
          position: 'absolute',
          left: '50%',
          top: '50%',
          width: size * 0.62,
          height: size * 0.62,
          transform: 'translate(-50%, -50%)',
          borderRadius: '50%',
          border: '1px dashed rgba(255,255,255,0.18)',
        }}
      />

      <div
        style={{
          position: 'absolute',
          left: '50%',
          top: '50%',
          width: 2,
          height: size * 0.56,
          transform: 'translate(-50%, -50%)',
          background: 'rgba(255,255,255,0.1)',
        }}
      />

      <div
        style={{
          position: 'absolute',
          left: '50%',
          top: '50%',
          width: size * 0.56,
          height: 2,
          transform: 'translate(-50%, -50%)',
          background: 'rgba(255,255,255,0.1)',
        }}
      />

      <div
        style={{
          position: 'absolute',
          left: `calc(50% + ${knob.x}px)`,
          top: `calc(50% + ${knob.y}px)`,
          width: knobRadius * 2,
          height: knobRadius * 2,
          transform: 'translate(-50%, -50%)',
          borderRadius: '50%',
          background: 'linear-gradient(180deg, rgba(255,255,255,0.95), rgba(203,213,225,0.88))',
          boxShadow: '0 8px 20px rgba(0,0,0,0.25)',
          border: '1px solid rgba(255,255,255,0.6)',
        }}
      />
    </div>
  )
}
