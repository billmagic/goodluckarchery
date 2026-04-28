type Props = {
  value: number
  visible?: boolean
}

export function TimingBar({ value, visible = true }: Props) {
  if (!visible) return null

  const markerLeft = `${value * 100}%`
  const isPerfect = Math.abs(value - 0.5) < 0.08

  return (
    <div
      style={{
        position: 'absolute',
        left: '50%',
        bottom: 165,
        transform: 'translateX(-50%)',
        width: 'min(320px, 82vw)',
        zIndex: 18,
      }}
    >
      <div
        style={{
          marginBottom: 8,
          textAlign: 'center',
          color: '#0f172a',
          fontSize: 13,
          fontWeight: 700,
        }}
      >
        타이밍 바
      </div>

      <div
        style={{
          position: 'relative',
          height: 18,
          borderRadius: 999,
          overflow: 'hidden',
          background:
            'linear-gradient(90deg, #ef4444 0%, #f59e0b 30%, #22c55e 50%, #f59e0b 70%, #ef4444 100%)',
          boxShadow: '0 8px 24px rgba(15,23,42,0.18)',
          border: '2px solid rgba(255,255,255,0.85)',
        }}
      >
        <div
          style={{
            position: 'absolute',
            left: '50%',
            top: 0,
            width: 4,
            height: '100%',
            marginLeft: -2,
            background: 'rgba(255,255,255,0.92)',
          }}
        />
        <div
          style={{
            position: 'absolute',
            top: -4,
            left: markerLeft,
            transform: 'translateX(-50%)',
            width: 10,
            height: 26,
            borderRadius: 999,
            background: isPerfect ? '#ffffff' : '#0f172a',
          }}
        />
      </div>

      <div
        style={{
          marginTop: 8,
          textAlign: 'center',
          fontSize: 12,
          color: '#334155',
          fontWeight: 600,
        }}
      >
        가운데에서 손을 놓으면 정확도가 높아집니다
      </div>
    </div>
  )
}