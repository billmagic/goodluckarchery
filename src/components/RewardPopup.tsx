import type { ArcheryRewardResult } from '../game/ArcheryScene'

type Props = {
  reward: ArcheryRewardResult | null
  onClose: () => void
}

export function RewardPopup({ reward, onClose }: Props) {
  if (!reward) return null

  const isMiss = reward.type === 'miss'
  const accent = isMiss ? '#ef4444' : '#16a34a'
  const bg = isMiss ? '#fff1f2' : '#f0fdf4'

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 30,
        background: 'rgba(15,23,42,0.42)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
      }}
    >
      <div
        style={{
          width: 'min(420px, 92vw)',
          borderRadius: 24,
          background: '#ffffff',
          boxShadow: '0 24px 64px rgba(15,23,42,0.3)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            padding: '18px 20px',
            background: bg,
            borderBottom: '1px solid rgba(148,163,184,0.16)',
          }}
        >
          <div
            style={{
              display: 'inline-flex',
              minWidth: 88,
              padding: '8px 12px',
              borderRadius: 999,
              background: accent,
              color: '#ffffff',
              fontSize: 13,
              fontWeight: 800,
            }}
          >
            {isMiss ? 'MISS' : 'HIT'}
          </div>

          <h2 style={{ margin: '14px 0 0', fontSize: 28 }}>
            {reward.title}
          </h2>
        </div>

        <div style={{ padding: 20 }}>
          <div
            style={{
              display: 'grid',
              gap: 12,
              marginBottom: 18,
            }}
          >
            <div
              style={{
                padding: 14,
                borderRadius: 16,
                background: '#f8fafc',
                color: '#334155',
                fontSize: 15,
                lineHeight: 1.6,
              }}
            >
              {reward.message}
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: 10,
              }}
            >
              <div
                style={{
                  padding: 14,
                  borderRadius: 16,
                  background: '#f8fafc',
                }}
              >
                <div style={{ fontSize: 12, color: '#64748b' }}>점수</div>
                <div style={{ marginTop: 6, fontSize: 22, fontWeight: 800 }}>
                  {reward.score}
                </div>
              </div>

              <div
                style={{
                  padding: 14,
                  borderRadius: 16,
                  background: '#f8fafc',
                }}
              >
                <div style={{ fontSize: 12, color: '#64748b' }}>복주머니 색</div>
                <div
                  style={{
                    marginTop: 6,
                    fontSize: 16,
                    fontWeight: 800,
                    textTransform: 'capitalize',
                  }}
                >
                  {reward.bagColor}
                </div>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            style={{
              width: '100%',
              height: 48,
              border: 0,
              borderRadius: 14,
              background: accent,
              color: '#ffffff',
              fontSize: 15,
              fontWeight: 800,
              cursor: 'pointer',
            }}
          >
            확인
          </button>
        </div>
      </div>
    </div>
  )
}