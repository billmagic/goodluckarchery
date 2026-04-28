import { useState } from 'react'

export type CustomRewardItem = {
  title: string
  message: string
}

type CustomGamePopupProps = {
  visible: boolean
  onStart: (rewards: CustomRewardItem[]) => void
  onCancel: () => void
}

export default function CustomGamePopup({ visible, onStart, onCancel }: CustomGamePopupProps) {
  const [rewards, setRewards] = useState<CustomRewardItem[]>([
    { title: '', message: '' },
    { title: '', message: '' },
    { title: '', message: '' },
    { title: '', message: '' },
    { title: '', message: '' },
  ])

  const handleRewardChange = (index: number, field: 'title' | 'message', value: string) => {
    const newRewards = [...rewards]
    newRewards[index] = { ...newRewards[index], [field]: value }
    setRewards(newRewards)
  }

  const addReward = () => {
    if (rewards.length < 5) {
      setRewards([...rewards, { title: '', message: '' }])
    }
  }

  const removeReward = (index: number) => {
    if (rewards.length > 1) {
      setRewards(rewards.filter((_, i) => i !== index))
    }
  }

  const isValid = rewards.every(reward => reward.title.trim() && reward.message.trim())

  const handleStart = () => {
    if (isValid) {
      onStart(rewards.filter(r => r.title.trim() && r.message.trim()))
    }
  }

  if (!visible) return null

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 50,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0,0,0,0.5)',
        backdropFilter: 'blur(4px)',
      }}
    >
      <div
        style={{
          background: '#ffffff',
          borderRadius: 16,
          padding: 24,
          maxWidth: 500,
          width: '90%',
          maxHeight: '80vh',
          overflowY: 'auto',
          boxShadow: '0 20px 40px rgba(0,0,0,0.3)',
        }}
      >
        <h2 style={{ margin: 0, marginBottom: 20, color: '#1d4ed8', fontSize: 24, fontWeight: 700 }}>
          복불복 내기 게임 설정
        </h2>

        <div style={{ marginBottom: 20 }}>
          <p style={{ margin: 0, color: '#475569', fontSize: 14 }}>
            1~5개의 결과를 입력하세요. 각 결과는 제목과 메시지를 포함해야 합니다.
          </p>
        </div>

        {rewards.map((reward, index) => (
          <div key={index} style={{ marginBottom: 16, padding: 16, border: '1px solid #e2e8f0', borderRadius: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <span style={{ fontWeight: 600, color: '#374151' }}>결과 {index + 1}</span>
              {rewards.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeReward(index)}
                  style={{
                    padding: '4px 8px',
                    border: '1px solid #ef4444',
                    borderRadius: 4,
                    background: '#fef2f2',
                    color: '#ef4444',
                    cursor: 'pointer',
                    fontSize: 12,
                  }}
                >
                  삭제
                </button>
              )}
            </div>

            <div style={{ marginBottom: 8 }}>
              <label style={{ display: 'block', marginBottom: 4, fontSize: 14, fontWeight: 500, color: '#374151' }}>
                제목
              </label>
              <input
                type="text"
                value={reward.title}
                onChange={(e) => handleRewardChange(index, 'title', e.target.value)}
                placeholder="결과 제목을 입력하세요"
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  border: '1px solid #d1d5db',
                  borderRadius: 6,
                  fontSize: 14,
                }}
              />
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: 4, fontSize: 14, fontWeight: 500, color: '#374151' }}>
                메시지
              </label>
              <textarea
                value={reward.message}
                onChange={(e) => handleRewardChange(index, 'message', e.target.value)}
                placeholder="결과 메시지를 입력하세요"
                rows={2}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  border: '1px solid #d1d5db',
                  borderRadius: 6,
                  fontSize: 14,
                  resize: 'vertical',
                }}
              />
            </div>
          </div>
        ))}

        {rewards.length < 5 && (
          <button
            type="button"
            onClick={addReward}
            style={{
              marginBottom: 20,
              padding: '8px 16px',
              border: '1px solid #2563eb',
              borderRadius: 6,
              background: '#eff6ff',
              color: '#2563eb',
              cursor: 'pointer',
              fontSize: 14,
              fontWeight: 500,
            }}
          >
            결과 추가
          </button>
        )}

        <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
          <button
            type="button"
            onClick={onCancel}
            style={{
              padding: '10px 20px',
              border: '1px solid #d1d5db',
              borderRadius: 8,
              background: '#ffffff',
              color: '#374151',
              cursor: 'pointer',
              fontSize: 14,
              fontWeight: 500,
            }}
          >
            취소
          </button>
          <button
            type="button"
            onClick={handleStart}
            disabled={!isValid}
            style={{
              padding: '10px 20px',
              border: 'none',
              borderRadius: 8,
              background: isValid ? '#2563eb' : '#d1d5db',
              color: '#ffffff',
              cursor: isValid ? 'pointer' : 'not-allowed',
              fontSize: 14,
              fontWeight: 500,
            }}
          >
            게임시작
          </button>
        </div>
      </div>
    </div>
  )
}