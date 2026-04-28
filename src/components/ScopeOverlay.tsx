import { useEffect, useRef, useState } from 'react'

export type ScopeWindInfo = {
  speedMps: number
  direction8: string
  arrow: string
}

export type ScopePreviewBag = {
  id: string
  color: string
  x: number
  y: number
  screenX: number
  screenY: number
  bagIndex: number
  scale?: number
}

export type ScopePreviewState = {
  bags: ScopePreviewBag[]
  /** 다음에 맞춰야 하는 복주머니 색 (순서 게임) */
  expectedNextColor?: string
  predicted: {
    x: number
    y: number
    screenX: number
    screenY: number
  }
  aimCenter?: {
    x: number
    y: number
  }
  aimCenterScreen?: {
    x: number
    y: number
  }
  aimDuration?: number
}

type ScopeOverlayProps = {
  visible: boolean
  aimX: number
  aimY: number
  wind?: ScopeWindInfo
  preview?: ScopePreviewState
  sourceCanvas?: HTMLCanvasElement | null
  selectedBagIndex?: number | null
  difficultyLevel?: 'low' | 'medium' | 'high'
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

type ScopeDangerTiming = { startSec: number; endSec: number }

function getScopeDangerTiming(level: 'low' | 'medium' | 'high'): ScopeDangerTiming {
  if (level === 'high') return { startSec: 1.5, endSec: 3 }
  if (level === 'medium') return { startSec: 2, endSec: 5 }
  return { startSec: 3, endSec: 6 }
}

function getDangerProgress(aimDuration: number, timing: ScopeDangerTiming) {
  if (aimDuration < timing.startSec) return 0
  if (aimDuration >= timing.endSec) return 1
  return clamp((aimDuration - timing.startSec) / (timing.endSec - timing.startSec), 0, 1)
}

function getScopeColor(aimDuration: number, timing: ScopeDangerTiming): string {
  const progress = getDangerProgress(aimDuration, timing)
  if (progress <= 0) return 'rgba(255,255,255,0.92)'
  const green = Math.round(255 * (1 - progress))
  if (progress < 1) return `rgba(255,${green},0,0.92)`
  return 'rgba(255,0,0,0.92)'
}

function getScopeLineColor(aimDuration: number, timing: ScopeDangerTiming): string {
  const progress = getDangerProgress(aimDuration, timing)
  if (progress <= 0) return 'rgba(255,255,255,0.96)'
  const green = Math.round(255 * (1 - progress))
  if (progress < 1) return `rgba(255,${green},0,0.96)`
  return 'rgba(255,0,0,0.96)'
}

function getScopeDotGlowColor(aimDuration: number, timing: ScopeDangerTiming): string {
  const progress = getDangerProgress(aimDuration, timing)
  if (progress <= 0) return 'rgba(255,255,255,0.32)'
  const green = Math.round(255 * (1 - progress))
  if (progress < 1) return `rgba(255,${green},0,0.32)`
  return 'rgba(255,0,0,0.32)'
}

function getScopeDotColor(aimDuration: number, timing: ScopeDangerTiming): string {
  const progress = getDangerProgress(aimDuration, timing)
  if (progress <= 0) return 'rgba(255,255,255,0.95)'
  const green = Math.round(255 * (1 - progress))
  if (progress < 1) return `rgba(255,${green},0,0.95)`
  return 'rgba(255,0,0,0.95)'
}

export default function ScopeOverlay({
  visible,
  aimX,
  aimY,
  wind,
  preview,
  sourceCanvas,
  selectedBagIndex,
  difficultyLevel = 'low',
}: ScopeOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const offsetRef = useRef({ x: 0, y: 0 })
  const animationRef = useRef<number | null>(null)
  const [scopeOffset, setScopeOffset] = useState({ x: 0, y: 0 })

  useEffect(() => {
    if (!visible) return

    const focusX = preview?.aimCenterScreen?.x ?? preview?.predicted.screenX ?? 0
    const focusY = preview?.aimCenterScreen?.y ?? preview?.predicted.screenY ?? 0

    const updatePosition = (time: number) => {
      const screenWidth = window.innerWidth
      const screenHeight = window.innerHeight
      const windFactor = Math.min(1.5, (wind?.speedMps ?? 0) * 0.08)
      
      const timing = getScopeDangerTiming(difficultyLevel)
      const aimDuration = preview?.aimDuration ?? 0
      const baseJitter = 4 + windFactor * 4
      const dangerProgress = getDangerProgress(aimDuration, timing)
      const maxAdditionalJitter =
        difficultyLevel === 'high' ? 13 : difficultyLevel === 'medium' ? 10 : 8
      const additionalJitter = dangerProgress * maxAdditionalJitter
      const totalJitterStrength = baseJitter + additionalJitter
      
      const jitterX = Math.sin(time * 0.011 + aimX * 2.8) * totalJitterStrength
      const jitterY = Math.cos(time * 0.013 + aimY * 2.8) * totalJitterStrength

      const targetX = ((focusX + 1) / 2) * screenWidth - screenWidth / 2 + jitterX
      const targetY = ((1 - focusY) / 2) * screenHeight - screenHeight / 2 + jitterY

      offsetRef.current.x = targetX
      offsetRef.current.y = targetY
      setScopeOffset({ x: targetX, y: targetY })
      animationRef.current = requestAnimationFrame(updatePosition)
    }

    animationRef.current = requestAnimationFrame(updatePosition)

    return () => {
      if (animationRef.current !== null) {
        cancelAnimationFrame(animationRef.current)
        animationRef.current = null
      }
    }
  }, [visible, wind, selectedBagIndex, preview, aimX, aimY, difficultyLevel])

  useEffect(() => {
    if (!visible || !sourceCanvas) return

    const canvas = canvasRef.current
    if (!canvas) return

    const rect = canvas.getBoundingClientRect()
    const dpr = window.devicePixelRatio || 1
    canvas.width = rect.width * dpr
    canvas.height = rect.height * dpr

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

    const focusX = preview?.aimCenterScreen?.x ?? preview?.predicted.screenX ?? 0
    const focusY = preview?.aimCenterScreen?.y ?? preview?.predicted.screenY ?? 0
    const zoom = 2
    const sourceWidth = sourceCanvas.width
    const sourceHeight = sourceCanvas.height
    const srcWidth = rect.width / zoom
    const srcHeight = rect.height / zoom
    const centerX = clamp(((focusX + 1) / 2) * sourceWidth, 0, sourceWidth)
    const centerY = clamp(((1 - focusY) / 2) * sourceHeight, 0, sourceHeight)
    const sx = clamp(centerX - srcWidth / 2, 0, sourceWidth - srcWidth)
    const sy = clamp(centerY - srcHeight / 2, 0, sourceHeight - srcHeight)

    ctx.clearRect(0, 0, rect.width, rect.height)
    ctx.drawImage(sourceCanvas, sx, sy, srcWidth, srcHeight, 0, 0, rect.width, rect.height)

    const gradient = ctx.createRadialGradient(
      rect.width / 2,
      rect.height / 2,
      rect.width * 0.08,
      rect.width / 2,
      rect.height / 2,
      rect.width / 2
    )
    gradient.addColorStop(0, 'rgba(255,255,255,0)')
    gradient.addColorStop(1, 'rgba(0,0,0,0.22)')
    ctx.fillStyle = gradient
    ctx.fillRect(0, 0, rect.width, rect.height)
  }, [visible, sourceCanvas, aimX, aimY, preview, selectedBagIndex])

  if (!visible) return null
  const aimDuration = preview?.aimDuration ?? 0
  const dangerTiming = getScopeDangerTiming(difficultyLevel)

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 20,
        pointerEvents: 'none',
      }}
    >
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'radial-gradient(circle at center, rgba(0,0,0,0.02) 0%, rgba(0,0,0,0.15) 48%, rgba(0,0,0,0.33) 100%)',
        }}
      />

      <div
        style={{
          position: 'absolute',
          left: '50%',
          top: '50%',
          width: 'min(28vmin, 190px)',
          height: 'min(28vmin, 190px)',
          transform: `translate(calc(-50% + ${scopeOffset.x}px), calc(-50% + ${scopeOffset.y}px))`,
          borderRadius: '50%',
          overflow: 'hidden',
          border: `6px solid ${getScopeColor(aimDuration, dangerTiming)}`,
          boxShadow:
            '0 0 0 2px rgba(18,18,18,0.18) inset, 0 14px 32px rgba(0,0,0,0.28), 0 0 30px rgba(255,255,255,0.18) inset',
          background: 'rgba(255,255,255,0.05)',
          backdropFilter: 'blur(2px)',
        }}
      >
        <canvas
          ref={canvasRef}
          style={{
            width: '100%',
            height: '100%',
            display: 'block',
          }}
        />

        <div
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            width: '100%',
            height: '100%',
            pointerEvents: 'none',
          }}
        >
          <div
            style={{
              position: 'absolute',
              left: '50%',
              top: 0,
              width: 2,
              height: '100%',
              transform: 'translateX(-50%)',
              background: `linear-gradient(to bottom, rgba(255,255,255,0), ${getScopeLineColor(aimDuration, dangerTiming)}, rgba(255,255,255,0))`,
            }}
          />
          <div
            style={{
              position: 'absolute',
              top: '50%',
              left: 0,
              width: '100%',
              height: 2,
              transform: 'translateY(-50%)',
              background: `linear-gradient(to right, rgba(255,255,255,0), ${getScopeLineColor(aimDuration, dangerTiming)}, rgba(255,255,255,0))`,
            }}
          />
          <div
            style={{
              position: 'absolute',
              left: '50%',
              top: '50%',
              width: 20,
              height: 20,
              transform: 'translate(-50%, -50%)',
              borderRadius: '50%',
              border: `2px solid ${getScopeDotColor(aimDuration, dangerTiming)}`,
              boxShadow: `0 0 12px ${getScopeDotGlowColor(aimDuration, dangerTiming)}`,
              background: 'rgba(255,255,255,0.08)',
            }}
          />
        </div>
      </div>

      {/* 디버그 정보 표시 */}
      <div
        className="scope-debug-panel"
        style={{
          position: 'absolute',
          bottom: 20,
          left: 20,
          background: 'rgba(0, 0, 0, 0.85)',
          color: '#4ade80',
          padding: '12px 16px',
          borderRadius: '6px',
          fontSize: '12px',
          fontFamily: 'monospace',
          zIndex: 30,
          pointerEvents: 'none',
          border: '1px solid rgba(74, 222, 128, 0.3)',
          maxWidth: '280px',
          lineHeight: 1.6,
        }}
      >
        <div style={{ fontWeight: 'bold', marginBottom: '8px', color: '#60a5fa' }}>
          [디버그 정보]
        </div>
        <div>조준경 중심 (정규화):</div>
        <div>
          X: {(preview?.aimCenter?.x ?? 0).toFixed(3)} | Y:{' '}
          {(preview?.aimCenter?.y ?? 0).toFixed(3)}
        </div>
        <div style={{ marginTop: '8px' }}>예상 착탄점 (정규화):</div>
        <div>
          X: {(preview?.predicted.x ?? 0).toFixed(3)} | Y:{' '}
          {(preview?.predicted.y ?? 0).toFixed(3)}
        </div>
        <div style={{ marginTop: '8px' }}>바람:</div>
        <div>
          X: {(wind?.speedMps ?? 0).toFixed(2)} {wind?.arrow}
        </div>
        <div style={{ marginTop: '8px', color: '#fbbf24' }}>
          조준 시간: {(preview?.aimDuration ?? 0).toFixed(1)}초
        </div>
      </div>
    </div>
  )
}
