type AttemptResult = {
  attempt: number
  title: string
  result?: string
  type: 'reward' | 'miss'
  score: number
  message: string
}

type Props = {
  visible: boolean
  results: AttemptResult[]
  onRestart: () => void
  onExit: () => void
}

export function GameSummaryPopup({
  visible,
  results,
  onRestart,
  onExit,
}: Props) {
  if (!visible) return null

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 40,
        background: 'rgba(15,23,42,0.55)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
      }}
    >
      <div
        style={{
          width: 'min(520px, 94vw)',
          maxHeight: '88vh',
          display: 'flex',
          flexDirection: 'column',
          borderRadius: 24,
          background: '#ffffff',
          boxShadow: '0 28px 70px rgba(15,23,42,0.35)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            flexShrink: 0,
            padding: '20px 22px',
            background: 'linear-gradient(180deg, #eff6ff 0%, #ffffff 100%)',
            borderBottom: '1px solid rgba(148,163,184,0.18)',
          }}
        >
          <div
            style={{
              fontSize: 14,
              fontWeight: 800,
              color: '#2563eb',
            }}
          >
            게임 결과
          </div>
        </div>

        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: 20,
          }}
        >
          <div style={{ display: 'grid', gap: 10 }}>
            {results.map((item) => (
              <div
                key={item.attempt}
                style={{
                  borderRadius: 16,
                  padding: 14,
                  background: item.type === 'miss' ? '#fff1f2' : '#f0fdf4',
                  border:
                    item.type === 'miss'
                      ? '1px solid rgba(239,68,68,0.18)'
                      : '1px solid rgba(34,197,94,0.18)',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    gap: 10,
                    alignItems: 'center',
                  }}
                >
                  <div>
                    <div
                      style={{
                        fontSize: 12,
                        fontWeight: 700,
                        color: '#64748b',
                      }}
                    >
                      {item.attempt}회차
                    </div>
                    <div
                      style={{
                        marginTop: 4,
                        fontSize: 18,
                        fontWeight: 800,
                        color: '#0f172a',
                      }}
                    >
                      {item.title}
                    </div>
                  </div>

                  <div
                    style={{
                      fontSize: 18,
                      fontWeight: 800,
                      color: item.type === 'miss' ? '#dc2626' : '#16a34a',
                    }}
                  >
                    {item.score}점
                  </div>
                </div>

                <div
                  style={{
                    marginTop: 10,
                    fontSize: 14,
                    lineHeight: 1.6,
                    color: '#475569',
                  }}
                >
                  {item.message}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div
          style={{
            flexShrink: 0,
            padding: 16,
            borderTop: '1px solid rgba(148,163,184,0.18)',
            background: '#ffffff',
          }}
        >
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 12,
            }}
          >
            <button
              type="button"
              onClick={onExit}
              style={{
                height: 52,
                borderRadius: 14,
                border: '1px solid #cbd5e1',
                background: '#ffffff',
                fontSize: 15,
                fontWeight: 800,
                cursor: 'pointer',
              }}
            >
              종료
            </button>

            <button
              type="button"
              onClick={onRestart}
              style={{
                height: 52,
                borderRadius: 14,
                border: 0,
                background: '#2563eb',
                color: '#ffffff',
                fontSize: 15,
                fontWeight: 800,
                cursor: 'pointer',
              }}
            >
              다시 게임
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}