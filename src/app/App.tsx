import { useEffect, useMemo, useRef, useState } from 'react'
import Joystick from '../components/Joystick'
import ScopeOverlay, {
  type ScopePreviewState,
  type ScopeWindInfo,
} from '../components/ScopeOverlay'
import { GameSummaryPopup } from '../components/GameSummaryPopup'
import CustomGamePopup, { type CustomRewardItem } from '../components/CustomGamePopup'
import {
  ArcheryScene,
  type DifficultyConfig,
  type RewardItem,
  type WindState,
} from '../game/ArcheryScene'
import { loadLuckyBagYaml, mapLuckyBagYamlToRewards } from '../utils/yamlLoader'
import { useMediaQuery } from '../hooks/useMediaQuery'

const SAMPLE_REWARDS: RewardItem[] = [
  { id: 'r1', type: 'reward', title: '대박 행운', message: '오늘은 운이 크게 들어오는 날입니다.', score: 100, weight: 1 },
  { id: 'r2', type: 'reward', title: '재물운 상승', message: '뜻밖의 작은 재물이 들어올 수 있어요.', score: 80, weight: 2 },
  { id: 'r3', type: 'reward', title: '인연운', message: '좋은 만남이나 반가운 연락이 올 수 있어요.', score: 60, weight: 2 },
  { id: 'r4', type: 'reward', title: '건강운', message: '컨디션이 비교적 안정적인 하루입니다.', score: 40, weight: 2 },
  { id: 'r5', type: 'miss', title: '꽝!', message: '다음 기회에 다시 도전해보세요.', score: 0, weight: 3 },
]

/** 과녁 순서·하단 아이콘 열 고정 (ArcheryScene `targetOrder`와 동일) */
const SHOT_SEQUENCE_COLORS = ['red', 'yellow', 'blue', 'green', 'purple'] as const
const BAG_ICON_SIZE_PX = 86
const YAML_GAME_MODULES = import.meta.glob('../../public/data/*.{yaml,yml}', {
  query: '?raw',
  import: 'default',
})

function toPublicDataPath(modulePath: string): string | null {
  const normalized = modulePath.replace(/\\/g, '/')
  const marker = '/public/data/'
  const idx = normalized.indexOf(marker)
  if (idx < 0) return null
  return normalized.slice(idx + '/public'.length)
}

type YamlGameOption = {
  path: string
  name: string
}

type GameMode = 'lucky-fortune' | 'custom-betting'
type DifficultyLevel = 'low' | 'medium' | 'high'

const DIFFICULTY_CONFIG: Record<DifficultyLevel, DifficultyConfig> = {
  low: { aimAutoFireAfterSec: 10, windChangeMinSec: 5, windChangeMaxSec: 10 },
  medium: { aimAutoFireAfterSec: 5, windChangeMinSec: 3, windChangeMaxSec: 7 },
  high: { aimAutoFireAfterSec: 3, windChangeMinSec: 2, windChangeMaxSec: 5 },
}

export default function App() {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const sceneRef = useRef<ArcheryScene | null>(null)
  const discoveredYamlPaths = useMemo(
    () =>
      Object.keys(YAML_GAME_MODULES)
        .map(toPublicDataPath)
        .filter((v): v is string => v !== null)
        .sort(),
    []
  )
  const [yamlGames, setYamlGames] = useState<YamlGameOption[]>([])
  const [selectedYamlPath, setSelectedYamlPath] = useState<string>('')
  const [selectedYamlData, setSelectedYamlData] = useState<Record<string, unknown> | null>(null)
  const yamlGameName =
    selectedYamlData &&
    typeof selectedYamlData === 'object' &&
    'name' in selectedYamlData &&
    typeof (selectedYamlData as { name?: unknown }).name === 'string'
      ? (selectedYamlData as { name: string }).name
      : ''

  const [gameMode, setGameMode] = useState<GameMode>('lucky-fortune')
  const [customPopupVisible, setCustomPopupVisible] = useState(false)
  const [customRewards, setCustomRewards] = useState<CustomRewardItem[]>([])

  const rewards = useMemo(() => {
    if (gameMode === 'custom-betting' && customRewards.length > 0) {
      // customRewards를 랜덤하게 섞어서 복주머니 색상과 매핑
      const shuffledRewards = [...customRewards].sort(() => Math.random() - 0.5)
      const bagColors = [...SHOT_SEQUENCE_COLORS]

      return shuffledRewards.map((reward, index) => ({
        id: `custom-${index}`,
        type: index === shuffledRewards.length - 1 ? 'miss' : 'reward',
        title: reward.title,
        message: reward.message,
        score: index === shuffledRewards.length - 1 ? 0 : Math.max(100 - index * 20, 20),
        weight: 1,
        bagColor: bagColors[index],
      })) as RewardItem[]
    }
    const fromYaml = mapLuckyBagYamlToRewards(selectedYamlData)
    if (fromYaml && fromYaml.length > 0) return fromYaml
    return SAMPLE_REWARDS
  }, [gameMode, customRewards, selectedYamlData])

  const [aim, setAim] = useState({ x: 0, y: 0 })
  const [scopeVisible, setScopeVisible] = useState(false)
  const [windInfo, setWindInfo] = useState<ScopeWindInfo | undefined>(undefined)
  const [scopePreview, setScopePreview] = useState<ScopePreviewState>({
    bags: [],
    expectedNextColor: 'red',
    predicted: { x: 0, y: 0, screenX: 0, screenY: 0 },
    aimCenter: { x: 0, y: 0 },
  })
  const [scopeCanvas, setScopeCanvas] = useState<HTMLCanvasElement | null>(null)
  const [results, setResults] = useState<
    Array<{
      attempt: number
      title: string
      result?: string
      type: 'reward' | 'miss'
      score: number
      message: string
    }>
  >([])
  const [summaryVisible, setSummaryVisible] = useState(false)
  const [summaryDismissed, setSummaryDismissed] = useState(false)
  const [newGameAvailable, setNewGameAvailable] = useState(false)
  const [selectedBagIndex, setSelectedBagIndex] = useState<number | null>(null)
  const [difficultyLevel, setDifficultyLevel] = useState<DifficultyLevel>('low')
  const isGameSelectionLocked = results.length > 0 && results.length < 5
  const isNarrow = useMediaQuery('(max-width: 768px)')
  const [viewportWidth, setViewportWidth] = useState(
    () => (typeof window !== 'undefined' ? window.innerWidth : 1024)
  )

  useEffect(() => {
    const onResize = () => setViewportWidth(window.innerWidth)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  const joystickSize =
    viewportWidth <= 768 ? Math.min(130, Math.round(viewportWidth * 0.36)) : 132

  useEffect(() => {
    let isMounted = true
    const loadCatalog = async () => {
      const entries = await Promise.all(
        discoveredYamlPaths.map(async (path) => {
          try {
            const data = await loadLuckyBagYaml(path)
            const name =
              typeof data.name === 'string' && data.name.length > 0
                ? data.name
                : path.replace('/data/', '').replace(/\.(yaml|yml)$/i, '')
            return { path, name }
          } catch {
            return null
          }
        })
      )

      if (!isMounted) return
      const valid: YamlGameOption[] = entries.filter(
        (v): v is NonNullable<(typeof entries)[number]> => v !== null
      )
      setYamlGames(valid)
      if (valid.length > 0 && !valid.some((v) => v.path === selectedYamlPath)) {
        setSelectedYamlPath(valid[0].path)
      }
    }
    void loadCatalog()
    return () => {
      isMounted = false
    }
  }, [discoveredYamlPaths, selectedYamlPath])

  useEffect(() => {
    if (!selectedYamlPath) return
    let isMounted = true
    const loadSelectedYaml = async () => {
      try {
        const data = await loadLuckyBagYaml(selectedYamlPath)
        if (!isMounted) return
        setSelectedYamlData(data)
      } catch {
        if (!isMounted) return
        setSelectedYamlData(null)
      }
    }
    void loadSelectedYaml()
    return () => {
      isMounted = false
    }
  }, [selectedYamlPath])

  useEffect(() => {
    if (!containerRef.current) return

    const scene = new ArcheryScene(containerRef.current, rewards, {
      onScopeVisibleChange: (visible) => setScopeVisible(visible),
      onWindChange: (wind: WindState) => {
        setWindInfo({
          speedMps: wind.speedMps,
          direction8: wind.direction8,
          arrow: wind.arrow,
        })
      },
      onScopePreviewChange: (preview) => {
        setScopePreview(preview)
      },
      onReward: (reward) => {
        setResults((prev) => [
          ...prev,
          {
            attempt: prev.length + 1,
            title: reward.title,
            result: reward.result,
            type: reward.type,
            score: reward.score,
            message: reward.message,
          },
        ])
      },
    })
    scene.setDifficulty(DIFFICULTY_CONFIG[difficultyLevel])

    sceneRef.current = scene
    setScopeCanvas(scene.getRenderCanvas())

    const handleResize = () => {
      scene.resize()
    }

    window.addEventListener('resize', handleResize)

    return () => {
      window.removeEventListener('resize', handleResize)
      scene.destroy()
      sceneRef.current = null
    }
  }, [rewards])

  useEffect(() => {
    sceneRef.current?.setDifficulty(DIFFICULTY_CONFIG[difficultyLevel])
  }, [difficultyLevel])

  useEffect(() => {
    sceneRef.current?.setAimOffset(aim.x, aim.y)
  }, [aim])

  useEffect(() => {
    if (results.length === 5 && !summaryVisible && !summaryDismissed) {
      setSummaryVisible(true)
    }
  }, [results, summaryVisible, summaryDismissed])

  useEffect(() => {
    if (scopePreview.bags.length === 0) return
    if (results.length >= 5) return

    const expected = scopePreview.expectedNextColor
    const idx = expected
      ? scopePreview.bags.findIndex((b) => b.color === expected)
      : 0
    const resolvedIdx = idx >= 0 ? idx : 0
    const selected = scopePreview.bags[resolvedIdx]

    if (selected && selectedBagIndex !== resolvedIdx) {
      setSelectedBagIndex(resolvedIdx)
      sceneRef.current?.setSelectedBagById(selected.id)
    }
  }, [results, scopePreview.bags, scopePreview.expectedNextColor, selectedBagIndex])

  const handleJoystickStart = () => {
    if (scopePreview.bags.length > 0) {
      const expected = scopePreview.expectedNextColor
      const idx = expected
        ? scopePreview.bags.findIndex((b) => b.color === expected)
        : 0
      const resolvedIdx = idx >= 0 ? idx : 0
      const selected = scopePreview.bags[resolvedIdx]
      if (selected) {
        setSelectedBagIndex(resolvedIdx)
        sceneRef.current?.setSelectedBagById(selected.id)
        setAim({ x: 0, y: 0 })
        sceneRef.current?.setAimOffset(0, 0)
      }
    }
    sceneRef.current?.startAim()
  }

  const handleJoystickChange = (x: number, y: number) => {
    setAim({ x, y })
    sceneRef.current?.setAimOffset(x, y)
  }

  const handleJoystickEnd = () => {
    sceneRef.current?.releaseArrow()
  }

  const handleRestart = () => {
    sceneRef.current?.resetGame()
    setResults([])
    setSummaryVisible(false)
    setSummaryDismissed(false)
    setNewGameAvailable(false)
    setSelectedBagIndex(0)
    setAim({ x: 0, y: 0 })
    sceneRef.current?.setAimOffset(0, 0)
  }

  const handleExit = () => {
    setSummaryVisible(false)
    setSummaryDismissed(true)
    setNewGameAvailable(true)
  }

  const handleYamlGameSelect = (path: string) => {
    setSelectedYamlPath(path)
    setGameMode('lucky-fortune')
    setCustomRewards([])
  }

  const handleGameModeSelect = (mode: GameMode) => {
    if (mode === 'custom-betting') {
      setCustomPopupVisible(true)
      return
    }
    setGameMode('lucky-fortune')
  }

  const handleCustomGameStart = (rewards: CustomRewardItem[]) => {
    setCustomRewards(rewards)
    setGameMode('custom-betting')
    setCustomPopupVisible(false)
  }

  const handleCustomGameCancel = () => {
    setCustomPopupVisible(false)
  }

  const handleBagSelectByColor = (color: string) => {
    const idx = scopePreview.bags.findIndex((b) => b.color === color)
    if (idx < 0) return
    const selected = scopePreview.bags[idx]
    if (!selected) return
    setSelectedBagIndex(idx)
    sceneRef.current?.setSelectedBagById(selected.id)
    setAim({ x: 0, y: 0 })
    sceneRef.current?.setAimOffset(0, 0)
  }

  return (
    <div
      className="game-app-root"
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        minHeight: '100dvh',
        background: '#dbeafe',
        overflow: 'hidden',
      }}
    >
      {/* 게임 모드 선택 UI */}
      <div
        style={{
          position: 'absolute',
          top: isNarrow ? 52 : 20,
          left: isNarrow ? 10 : 20,
          zIndex: 35,
          background: 'rgba(255,255,255,0.95)',
          borderRadius: 12,
          padding: isNarrow ? 12 : 16,
          maxHeight: isNarrow ? '36vh' : undefined,
          overflowY: isNarrow ? 'auto' : undefined,
          WebkitOverflowScrolling: isNarrow ? 'touch' : undefined,
          maxWidth: isNarrow ? 'min(calc(100vw - 20px), 280px)' : undefined,
          boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
          backdropFilter: 'blur(8px)',
        }}
      >
        <div
          style={{
            fontSize: 16,
            fontWeight: 700,
            color: '#1d4ed8',
            marginBottom: 12,
            textAlign: 'center',
          }}
        >
          게임 선택
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {yamlGames.map((game) => {
            const isSelected = gameMode === 'lucky-fortune' && selectedYamlPath === game.path
            return (
              <button
                key={game.path}
                type="button"
                onClick={() => handleYamlGameSelect(game.path)}
                disabled={isGameSelectionLocked}
                style={{
                  padding: '10px 16px',
                  border: isSelected ? '2px solid #2563eb' : '1px solid #d1d5db',
                  borderRadius: 8,
                  background: isSelected ? '#eff6ff' : '#ffffff',
                  color: isSelected ? '#2563eb' : '#374151',
                  cursor: isGameSelectionLocked ? 'not-allowed' : 'pointer',
                  opacity: isGameSelectionLocked ? 0.5 : 1,
                  fontSize: 14,
                  fontWeight: 500,
                  outline: 'none',
                  textAlign: 'left',
                }}
              >
                {game.name}
              </button>
            )
          })}

          <button
            type="button"
            onClick={() => handleGameModeSelect('custom-betting')}
            disabled={isGameSelectionLocked}
            style={{
              marginTop: 4,
              padding: '10px 16px',
              border: gameMode === 'custom-betting' ? '2px solid #2563eb' : '1px solid #d1d5db',
              borderRadius: 8,
              background: gameMode === 'custom-betting' ? '#eff6ff' : '#ffffff',
              color: gameMode === 'custom-betting' ? '#2563eb' : '#374151',
              cursor: isGameSelectionLocked ? 'not-allowed' : 'pointer',
              opacity: isGameSelectionLocked ? 0.5 : 1,
              fontSize: 14,
              fontWeight: 700,
              outline: 'none',
            }}
          >
            복불복 내기 게임
          </button>
        </div>
      </div>

      <div
        ref={containerRef}
        style={{
          position: 'absolute',
          inset: 0,
          touchAction: 'none',
        }}
      />

      <div
        style={{
          position: 'absolute',
          top: isNarrow ? 10 : 24,
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 35,
          textAlign: 'center',
          color: '#1d4ed8',
          fontSize: 'clamp(22px, 5.5vw, 52px)',
          fontWeight: 800,
          letterSpacing: '0.02em',
          textShadow: '0 2px 12px rgba(30,64,175,0.16)',
          display: 'flex',
          alignItems: 'center',
          gap: isNarrow ? 8 : 12,
          flexWrap: 'wrap',
          justifyContent: 'center',
          width: isNarrow ? 'min(96vw, 520px)' : undefined,
          padding: isNarrow ? '0 8px' : undefined,
        }}
      >
        <span>행운 양궁</span>
        {yamlGameName && (
          <span
            style={{
              fontSize: 'clamp(16px, 1.8vw, 24px)',
              fontWeight: 700,
              color: '#0f766e',
              background: 'rgba(255,255,255,0.72)',
              border: '1px solid rgba(15,118,110,0.2)',
              borderRadius: 999,
              padding: '6px 12px',
            }}
          >
            {yamlGameName}
          </span>
        )}
      </div>

      {/* 1~5차 결과판 (남은 풍선 수와 무관하게 항상 5칸 유지) */}
      <div
        style={{
          position: 'absolute',
          top: isNarrow ? 200 : 96,
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 35,
          display: 'grid',
          gridTemplateColumns: isNarrow
            ? 'repeat(5, minmax(56px, 1fr))'
            : 'repeat(5, minmax(100px, 1fr))',
          gap: isNarrow ? 6 : 18,
          width: isNarrow ? 'min(98vw, 760px)' : 'min(94vw, 760px)',
          padding: isNarrow ? '0 6px' : '0 14px',
          overflowX: isNarrow ? 'auto' : undefined,
          WebkitOverflowScrolling: isNarrow ? 'touch' : undefined,
        }}
      >
        {Array.from({ length: 5 }, (_, slotIndex) => {
          const isNextShot = results.length === slotIndex && results.length < 5
          const row = results[slotIndex]
          const displayPts =
            row != null
              ? row.title.trim() === '꽝!'
                ? 0
                : row.score
              : null
          return (
            <div
              key={`shot-result-slot-${slotIndex}`}
              style={{
                position: 'relative',
                minHeight: isNarrow ? 72 : 100,
                padding: isNarrow ? '8px 6px 10px' : '10px 14px 12px',
                borderRadius: 18,
                border: isNextShot ? '2px solid #2563eb' : '1px solid rgba(148,163,184,0.35)',
                background: isNextShot ? 'rgba(59,130,246,0.12)' : '#ffffff',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                boxShadow: isNextShot ? '0 12px 20px rgba(37,99,235,0.14)' : '0 4px 14px rgba(15,23,42,0.08)',
              }}
            >
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: '50%',
                  display: 'grid',
                  placeItems: 'center',
                  background: isNextShot ? '#2563eb' : '#e2e8f0',
                  color: isNextShot ? '#ffffff' : '#475569',
                  fontSize: 15,
                  fontWeight: 800,
                }}
              >
                {slotIndex + 1}
              </div>
              {row ? (
                <>
                  <div
                    style={{
                      width: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 8,
                      flexWrap: 'wrap',
                      fontSize: 13,
                      fontWeight: 700,
                    }}
                  >
                    <span style={{ color: '#0f172a', textAlign: 'center' }}>
                      {row.title}
                    </span>
                    <span
                      style={{
                        color:
                          displayPts === 0 ? '#dc2626' : '#22c55e',
                        fontWeight: 800,
                      }}
                    >
                      {displayPts}점
                    </span>
                  </div>
                  <div
                    style={{
                      width: '100%',
                      fontSize: 11,
                      color: '#475569',
                      textAlign: 'center',
                      lineHeight: 1.4,
                    }}
                  >
                    {row.message}
                  </div>
                </>
              ) : (
                <div
                  style={{
                    width: '100%',
                    textAlign: 'center',
                    fontSize: 12,
                    fontWeight: 700,
                    color: '#94a3b8',
                  }}
                >
                  대기
                </div>
              )}
            </div>
          )
        })}
      </div>

      <div
        style={{
          position: 'absolute',
          ...(isNarrow
            ? {
                top: 118,
                left: '50%',
                transform: 'translateX(-50%)',
                minWidth: 'min(92vw, 200px)',
              }
            : {
                top: 'calc(50% - 10vmin)',
                left: `calc(50% + 20vmin + ${BAG_ICON_SIZE_PX}px)`,
                transform: 'translate(-60px, calc(-100% - 40px))',
                minWidth: 150,
              }),
          zIndex: 35,
          padding: '12px 14px',
          borderRadius: 18,
          background: '#dcfce7',
          border: '1px solid rgba(59,130,246,0.16)',
          boxShadow: '0 14px 40px rgba(30,64,175,0.12)',
          color: '#0f172a',
          backdropFilter: 'blur(12px)',
        }}
      >
        <div style={{ fontSize: 12, fontWeight: 700, color: '#2563eb', marginBottom: 6 }}>
          바람 정보
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: '50%',
              display: 'grid',
              placeItems: 'center',
              background: '#eff6ff',
              color: '#1d4ed8',
              fontSize: 22,
            }}
          >
            {windInfo?.arrow ?? '→'}
          </div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700 }}>{windInfo?.direction8 ?? '동'}</div>
            <div style={{ fontSize: 13, color: '#475569' }}>
              {(windInfo?.speedMps ?? 0).toFixed(1)} m/s
            </div>
          </div>
        </div>
      </div>

      <ScopeOverlay
        visible={scopeVisible}
        aimX={aim.x}
        aimY={aim.y}
        wind={windInfo}
        preview={scopePreview}
        sourceCanvas={scopeCanvas}
        selectedBagIndex={selectedBagIndex}
        difficultyLevel={difficultyLevel}
      />

      <div
        style={{
          position: 'absolute',
          ...(isNarrow
            ? {
                left: 10,
                right: 10,
                top: 'auto',
                bottom: joystickSize + 36,
                transform: 'none',
                minWidth: 0,
              }
            : {
                right: 24,
                top: '50%',
                transform: 'translateY(-50%)',
                minWidth: 196,
              }),
          zIndex: 40,
          padding: '12px 14px',
          borderRadius: 16,
          background: 'rgba(255,255,255,0.9)',
          border: '1px solid rgba(15,23,42,0.12)',
          boxShadow: '0 10px 24px rgba(15,23,42,0.12)',
          color: '#0f172a',
        }}
      >
        <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 8 }}>게임 난이도</div>
        <div style={{ display: 'grid', gap: 8, fontSize: 14 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
            <input
              type="radio"
              name="difficulty-level"
              checked={difficultyLevel === 'high'}
              onChange={() => setDifficultyLevel('high')}
            />
            <span>상 (3초 / 2~5초)</span>
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
            <input
              type="radio"
              name="difficulty-level"
              checked={difficultyLevel === 'medium'}
              onChange={() => setDifficultyLevel('medium')}
            />
            <span>중 (5초 / 3~7초)</span>
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
            <input
              type="radio"
              name="difficulty-level"
              checked={difficultyLevel === 'low'}
              onChange={() => setDifficultyLevel('low')}
            />
            <span>하 (10초 / 5~10초)</span>
          </label>
        </div>
      </div>

      {/* 타겟 아래 복주머니 아이콘 (색상 순서 고정 5칸, 맞춘 풍선은 빈칸) */}
      <div
        style={{
          position: 'absolute',
          bottom: isNarrow ? joystickSize + 44 : 132,
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 35,
          display: 'flex',
          gap: isNarrow ? 6 : 18,
          justifyContent: 'center',
          width: 'min(94vw, 760px)',
          padding: '0 14px',
          overflowX: isNarrow ? 'auto' : undefined,
          WebkitOverflowScrolling: isNarrow ? 'touch' : undefined,
        }}
      >
        {SHOT_SEQUENCE_COLORS.map((color) => {
          const bag = scopePreview.bags.find((b) => b.color === color)
          const isNextTarget = scopePreview.expectedNextColor === color
          return (
            <button
              key={`bag-icon-${color}`}
              type="button"
              disabled={!bag}
              onClick={() => handleBagSelectByColor(color)}
              style={{
                width: isNarrow ? 'clamp(52px, 15vw, 72px)' : 86,
                height: isNarrow ? 'clamp(52px, 15vw, 72px)' : 86,
                borderRadius: 18,
                border: isNextTarget ? '2px solid #2563eb' : '1px solid rgba(148,163,184,0.35)',
                background: isNextTarget ? 'rgba(59,130,246,0.12)' : '#f8fafc',
                cursor: bag ? 'pointer' : 'default',
                opacity: bag ? 1 : 0.38,
                display: 'grid',
                placeItems: 'center',
                boxShadow: isNextTarget ? '0 10px 22px rgba(37,99,235,0.14)' : '0 4px 16px rgba(15,23,42,0.08)',
                outline: 'none',
              }}
            >
              {bag ? (
                <img
                  src={`/images/${color}.png`}
                  alt={`${color} bag`}
                  style={{
                    width: isNarrow ? 'clamp(36px, 10vw, 52px)' : 58,
                    height: isNarrow ? 'clamp(36px, 10vw, 52px)' : 58,
                    objectFit: 'contain',
                  }}
                />
              ) : (
                <span style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8' }}>—</span>
              )}
            </button>
          )
        })}
      </div>

      <div
        style={{
          position: 'absolute',
          right: 'max(12px, env(safe-area-inset-right, 0px))',
          bottom: 'max(12px, env(safe-area-inset-bottom, 0px))',
          zIndex: 40,
        }}
      >
        <Joystick
          size={joystickSize}
          onStart={handleJoystickStart}
          onChange={handleJoystickChange}
          onEnd={handleJoystickEnd}
        />
      </div>

      {newGameAvailable && (
        <button
          type="button"
          onClick={handleRestart}
          style={{
            position: 'absolute',
            right: 'max(12px, env(safe-area-inset-right, 0px))',
            bottom: 'max(168px, calc(env(safe-area-inset-bottom, 0px) + 156px))',
            zIndex: 40,
            padding: '14px 18px',
            borderRadius: 16,
            border: 'none',
            background: '#2563eb',
            color: '#ffffff',
            fontWeight: 700,
            cursor: 'pointer',
            boxShadow: '0 12px 28px rgba(37,99,235,0.22)',
          }}
        >
          새 게임
        </button>
      )}

      <GameSummaryPopup
        visible={summaryVisible}
        results={results}
        totalScore={results.reduce((sum, item) => sum + item.score, 0)}
        onRestart={handleRestart}
        onExit={handleExit}
      />

      <CustomGamePopup
        visible={customPopupVisible}
        onStart={handleCustomGameStart}
        onCancel={handleCustomGameCancel}
      />
    </div>
  )
}