import * as THREE from 'three'
import type { ScopePreviewState } from '../components/ScopeOverlay'
import { publicAsset } from '../utils/publicAsset'

export type RewardItem = {
  id: string
  type: 'reward' | 'miss'
  title: string
  message: string
  /** lucky-bags.yaml `result` — 짧은 요약 문구(선택) */
  result?: string
  score: number
  color?: string
  /** YAML `color`와 복주머니 색 매칭용 */
  bagColor?: string
  weight?: number
}

export type ArcheryRewardResult = RewardItem & {
  bagColor: string
}

export type DifficultyConfig = {
  aimAutoFireAfterSec: number
  windChangeMinSec: number
  windChangeMaxSec: number
}

export type WindState = {
  x: number
  y: number
  speedMps: number
  direction8: string
  arrow: string
  angleDeg: number
}

export type ArcherySceneCallbacks = {
  onScopeVisibleChange?: (visible: boolean) => void
  onWindChange?: (wind: WindState) => void
  onReward?: (reward: ArcheryRewardResult) => void
  onScopePreviewChange?: (preview: ScopePreviewState) => void
}

type BagTarget = {
  id: string
  mesh: THREE.Sprite
  reward: RewardItem
  bagColor: string
  radius: number
}

type FireState = {
  active: boolean
  elapsed: number
  duration: number
  startWorld: THREE.Vector3
  targetWorld: THREE.Vector3
  previousTipWorld: THREE.Vector3
}

type BurstParticle = {
  mesh: THREE.Mesh
  velocity: THREE.Vector3
  life: number
  maxLife: number
  gravity: number
  spin: THREE.Vector3
  fadeStart: number
  startScale: number
  endScale: number
}

type Shockwave = {
  mesh: THREE.Mesh
  life: number
  maxLife: number
  startScale: number
  endScale: number
}

type BagBurstAnimation = {
  bagMesh: THREE.Sprite
  basePosition: THREE.Vector3
  baseScale: THREE.Vector3
  elapsed: number
  duration: number
  burstTime: number
  burstTriggered: boolean
  worldPosition: THREE.Vector3
  bagColor: string
  rewardScore: number
}

/** 타겟 보드 위 왼쪽→오른쪽 고정 순서 */
const BAG_COLOR_ORDER = ['red', 'yellow', 'blue', 'green', 'purple'] as const

/** 스프라이트 tint 기준색 (해당 색보다 흰색에 가깝게 블렌드해 밝게 보이게 함) */
const BAG_SPRITE_CHROMA_HEX: Record<string, number> = {
  red: 0xf87171,
  yellow: 0xfacc15,
  blue: 0x60a5fa,
  green: 0x4ade80,
  purple: 0xc084fc,
}

const BAG_SPRITE_SCALE_X = 0.36
const BAG_SPRITE_SCALE_Y = 0.41

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t
}

function easeInOutQuad(t: number) {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2
}

function weightedPick(items: RewardItem[]): RewardItem {
  const total = items.reduce((sum, item) => sum + (item.weight ?? 1), 0)
  let random = Math.random() * total

  for (const item of items) {
    random -= item.weight ?? 1
    if (random <= 0) return item
  }

  return items[items.length - 1]
}

function isLuckyYamlDrawEligible(r: RewardItem): boolean {
  if (r.type === 'miss') return false
  if (r.title.trim() === '꽝!') return false
  return true
}

function loadImageElement(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error(`이미지 로드 실패: ${url}`))
    img.src = url
  })
}

/** 캔버스 좌표(좌상단 원점) 기준 사각형 → Three UV (v 아래→위) 범위 */
function atlasUvRangeFromCanvasRect(
  cw: number,
  ch: number,
  x: number,
  y: number,
  w: number,
  h: number
): { uMin: number; uMax: number; vMin: number; vMax: number } {
  const uMin = x / cw
  const uMax = (x + w) / cw
  const vMax = 1 - y / ch
  const vMin = 1 - (y + h) / ch
  return { uMin, uMax, vMin, vMax }
}

function applyAtlasUvToPlane(
  geo: THREE.BufferGeometry,
  uMin: number,
  uMax: number,
  vMin: number,
  vMax: number
) {
  const uv = geo.attributes.uv as THREE.BufferAttribute | undefined
  if (!uv) return
  for (let i = 0; i < uv.count; i++) {
    const u = uv.getX(i)
    const v = uv.getY(i)
    uv.setXY(i, uMin + u * (uMax - uMin), vMin + v * (vMax - vMin))
  }
  uv.needsUpdate = true
}

/** 착탄점과 복주머니 중심 거리: 중앙에 가까울수록 높은 점수 */
function accuracyScoreFromHit(
  impactWorld: THREE.Vector3,
  bag: BagTarget,
  maxScore: number,
  minScore: number
): number {
  const center = bag.mesh.getWorldPosition(new THREE.Vector3())
  const dist = impactWorld.distanceTo(center)
  const r = bag.radius
  if (r <= 0) return maxScore
  const t = clamp(dist / r, 0, 1)
  return Math.round(maxScore - t * (maxScore - minScore))
}

export class ArcheryScene {
  private container: HTMLElement
  private rewards: RewardItem[]
  private callbacks: ArcherySceneCallbacks

  private scene: THREE.Scene
  private camera: THREE.PerspectiveCamera
  private renderer: THREE.WebGLRenderer
  private textureLoader = new THREE.TextureLoader()

  private frameId: number | null = null
  private lastFrameTime = 0
  private elapsedTime = 0
  private isDestroyed = false

  private targetRoot = new THREE.Group()
  /** 좌·뒤·우 벽 + 바닥 (스티칭 아틀라스 UV) */
  private roomEnvGroup = new THREE.Group()
  private roomAtlasTexture: THREE.CanvasTexture | null = null
  private bowGroup = new THREE.Group()
  private arrowFlightSprite: THREE.Sprite | null = null
  private arrowStuckSprite: THREE.Sprite | null = null

  private bagTargets: BagTarget[] = []
  private impactObjects: THREE.Object3D[] = []
  private burstParticles: BurstParticle[] = []
  private shockwaves: Shockwave[] = []
  private bagBurstAnimations: BagBurstAnimation[] = []

  /** 맞춰야 하는 순서 (왼쪽부터 빨간색 → … → 보라색), 순환 */
  private targetOrder = [
    'red',
    'yellow',
    'blue',
    'green',
    'purple',
  ] as const
  private currentTargetIndex = 0
  private remainingShots = 5

  private userAim = new THREE.Vector2(0, 0)
  private wind = new THREE.Vector2(0.08, -0.04)
  private windTarget = new THREE.Vector2(0.08, -0.04)
  private nextWindChangeAt = 5.5

  private isAiming = false
  private isResolvingShot = false
  private aimStartTime = 0

  private predictedImpactWorld = new THREE.Vector3()

  private fireState: FireState = {
    active: false,
    elapsed: 0,
    duration: 1.05,
    startWorld: new THREE.Vector3(),
    targetWorld: new THREE.Vector3(),
    previousTipWorld: new THREE.Vector3(),
  }

  // 타겟을 복주머니 한 개 높이(BAG_SPRITE_SCALE_Y)만큼 상단 이동
  private boardCenter = new THREE.Vector3(0, 2.2 + BAG_SPRITE_SCALE_Y, -7)
  private arrowRestTipPosition = new THREE.Vector3(1.15, 0.3, 2.55)
  private bowRestPosition = new THREE.Vector3(0.72, 0.26, 2.45)
  private tempVec3 = new THREE.Vector3()
  private bagTintNeutral = new THREE.Color(1, 1, 1)
  private bagTintChroma = new THREE.Color()
  private bagTintBright = new THREE.Color()
  private bagTintDim = new THREE.Color()

  private resultDelayTimer: number | null = null
  private arrowHideTimer: number | null = null

  private bowPullAudio = new Audio(publicAsset('sounds/bow_pull.mp3'))
  private arrowShotAudio = new Audio(publicAsset('sounds/arrow_shot.mp3'))
  private hitTargetAudio = new Audio(publicAsset('sounds/hit_target.mp3'))
  private hitBagAudio = new Audio(publicAsset('sounds/hit_bag.mp3'))

  private screenShakeTime = 0
  private screenShakeDuration = 0
  private screenShakeStrength = 0
  private lastCameraShakeOffset = new THREE.Vector3(0, 0, 0)

  private arrowTexture: THREE.Texture | null = null
  private bagTextures: Record<string, THREE.Texture | null> = {
    red: null,
    blue: null,
    green: null,
    yellow: null,
    purple: null,
  }

  private readonly AIM_RANGE_X = 1.55
  private readonly AIM_RANGE_Y = 1.55
  private readonly AIM_MAX_RADIUS = 1.52
  /** 복주머니 중심 기준 점수 (YAML score 무시, 거리만 반영) */
  private readonly ACCURACY_SCORE_MAX = 100
  private readonly ACCURACY_SCORE_MIN = 10
  private readonly BOARD_PREVIEW_RADIUS = 1.55
  private readonly BOARD_HIT_RADIUS = 1.55
  private readonly WIND_SPEED_SCALE = 10

  // m/s 기준 보정량: 1 m/s당 보드 좌표 이동량
  private readonly WIND_DRIFT_PER_MPS_X = 0.18
  private readonly WIND_DRIFT_PER_MPS_Y = 0.13
  /** 난이도에 따라 동적으로 바뀌는 조준 자동발사 제한(초) */
  private aimAutoFireAfterSec = 10
  /** 난이도에 따라 동적으로 바뀌는 바람 변경 간격(초) */
  private windChangeIntervalMinSec = 5
  private windChangeIntervalMaxSec = 10

  // 복원 단계이므로 랜덤 산포는 일단 제거
  private readonly SPREAD_X = 0.0
  private readonly SPREAD_Y = 0.0

  private readonly ARROW_TIP_U = 0.04
  private readonly ARROW_TIP_V = 0.06

  private readonly ARROW_SPRITE_WIDTH = 2.3
  private readonly ARROW_SPRITE_HEIGHT = 1.65
  private readonly ARROW_HIT_SCALE_RATIO = 0.25
  private readonly ARROW_IMAGE_TIP_DIRECTION = (3 * Math.PI) / 4

  constructor(
    container: HTMLElement,
    rewards: RewardItem[],
    callbacks?: ArcherySceneCallbacks
  ) {
    this.container = container
    this.rewards = rewards
    this.callbacks = callbacks ?? {}

    this.scene = new THREE.Scene()
    this.scene.background = new THREE.Color(0xeaf3ff)

    this.camera = new THREE.PerspectiveCamera(
      50,
      this.container.clientWidth / this.container.clientHeight,
      0.1,
      100
    )
    this.camera.position.set(0, 1.8, 4.8)

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.setSize(this.container.clientWidth, this.container.clientHeight)
    this.container.appendChild(this.renderer.domElement)

    this.loadTextures()
    this.prepareAudio()
    this.buildScene()
    this.createRoundBags()
    this.updatePredictedImpact()
    this.callbacks.onWindChange?.(this.getWindInfo())
    this.bindEvents()

    this.frameId = requestAnimationFrame(this.animate)
  }

  public setAimOffset(x: number, y: number) {
    this.userAim.set(clamp(x, -1, 1), clamp(y, -1, 1))
    this.updatePredictedImpact()
    this.emitScopePreview()
  }

  public startAim() {
    if (this.fireState.active) return
    if (this.isResolvingShot) return
    if (this.remainingShots <= 0) return
    if (this.bagTargets.length === 0) return

    this.isAiming = true
    this.aimStartTime = this.elapsedTime
    this.updatePredictedImpact()
    this.emitScopePreview()
    this.callbacks.onScopeVisibleChange?.(true)
    this.playSound(this.bowPullAudio)
  }

  public releaseArrow() {
    if (this.fireState.active) return
    if (this.isResolvingShot) return
    if (!this.isAiming) return
    if (this.remainingShots <= 0) return

    this.isAiming = false
    this.aimStartTime = 0
    this.callbacks.onScopeVisibleChange?.(false)

    // Ensure predicted impact is updated right before firing (reflects latest wind state)
    this.updatePredictedImpact()

    this.remainingShots -= 1
    const impactTarget = this.predictedImpactWorld.clone()

    this.fireState.startWorld.copy(this.arrowRestTipPosition)
    this.fireState.targetWorld.copy(impactTarget)
    this.fireState.previousTipWorld.copy(this.arrowRestTipPosition)
    this.fireState.elapsed = 0
    this.fireState.duration = 1.05
    this.fireState.active = true

    if (this.arrowFlightSprite) {
      this.arrowFlightSprite.visible = true
      const dir = impactTarget.clone().sub(this.arrowRestTipPosition).normalize()
      const tipAngle = Math.atan2(dir.y, dir.x)

      this.placeArrowSpriteByTip(
        this.arrowFlightSprite,
        this.arrowRestTipPosition,
        tipAngle,
        this.ARROW_SPRITE_WIDTH,
        this.ARROW_SPRITE_HEIGHT
      )
    }

    this.playSound(this.arrowShotAudio)
  }

  public setDifficulty(config: DifficultyConfig) {
    const aimSec = clamp(config.aimAutoFireAfterSec, 1, 60)
    const minSec = clamp(config.windChangeMinSec, 0.5, 60)
    const maxSec = clamp(config.windChangeMaxSec, minSec, 60)

    this.aimAutoFireAfterSec = aimSec
    this.windChangeIntervalMinSec = minSec
    this.windChangeIntervalMaxSec = maxSec
  }

  public resize() {
    if (this.isDestroyed) return

    const width = this.container.clientWidth
    const height = this.container.clientHeight

    this.camera.aspect = width / height
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(width, height)
  }

  public getRenderCanvas(): HTMLCanvasElement {
    return this.renderer.domElement
  }

  public resetGame() {
    this.remainingShots = 5
    this.currentTargetIndex = 0
    this.isAiming = false
    this.aimStartTime = 0
    this.isResolvingShot = false
    this.clearImpactObjects()
    this.clearBurstEffects()
    this.resetArrow()
    this.createRoundBags()
    this.updatePredictedImpact()
    this.emitScopePreview()
  }

  public setCurrentTargetIndex(index: number) {
    this.currentTargetIndex = clamp(index, 0, this.targetOrder.length - 1)
    this.updatePredictedImpact()
    this.emitScopePreview()
  }

  public setSelectedBagById(id: string) {
    const bagIndex = this.bagTargets.findIndex((bag) => bag.id === id)
    if (bagIndex < 0) return
    this.updatePredictedImpact()
    this.emitScopePreview()
  }

  public destroy() {
    this.isDestroyed = true

    if (this.frameId !== null) {
      cancelAnimationFrame(this.frameId)
      this.frameId = null
    }

    if (this.resultDelayTimer !== null) {
      clearTimeout(this.resultDelayTimer)
      this.resultDelayTimer = null
    }

    if (this.arrowHideTimer !== null) {
      clearTimeout(this.arrowHideTimer)
      this.arrowHideTimer = null
    }

    this.clearImpactObjects()
    this.clearBurstEffects()

    window.removeEventListener('resize', this.handleResize)

    this.disposeRoomEnvChildren()
    if (this.roomAtlasTexture) {
      this.roomAtlasTexture.dispose()
      this.roomAtlasTexture = null
    }
    this.scene.remove(this.roomEnvGroup)

    this.renderer.dispose()

    if (this.renderer.domElement.parentElement === this.container) {
      this.container.removeChild(this.renderer.domElement)
    }
  }

  private loadTextures() {
    this.arrowTexture = this.textureLoader.load(publicAsset('images/arrow.png'))
    this.arrowTexture.colorSpace = THREE.SRGBColorSpace

    for (const color of BAG_COLOR_ORDER) {
      const tex = this.textureLoader.load(publicAsset(`images/${color}.png`))
      tex.colorSpace = THREE.SRGBColorSpace
      this.bagTextures[color] = tex
    }
  }

  private prepareAudio() {
    const audios = [
      this.bowPullAudio,
      this.arrowShotAudio,
      this.hitTargetAudio,
      this.hitBagAudio,
    ]

    audios.forEach((audio) => {
      audio.preload = 'auto'
      audio.volume = 0.8
    })

    this.hitBagAudio.volume = 0.95
  }

  private playSound(audio: HTMLAudioElement) {
    try {
      audio.currentTime = 0
      void audio.play()
    } catch {
      // ignore
    }
  }

  private buildScene() {
    const ambient = new THREE.AmbientLight(0xffffff, 1.2)
    this.scene.add(ambient)

    const dir = new THREE.DirectionalLight(0xffffff, 1.05)
    dir.position.set(3, 5, 4)
    this.scene.add(dir)

    this.scene.add(this.roomEnvGroup)
    void this.buildStitchedRoomEnvironment()

    this.targetRoot.position.copy(this.boardCenter)

    const boardBack = new THREE.Mesh(
      new THREE.CylinderGeometry(1.8, 1.8, 0.18, 64),
      new THREE.MeshStandardMaterial({ color: 0xffffff })
    )
    boardBack.rotation.x = Math.PI / 2
    this.targetRoot.add(boardBack)

    const targetTexture = this.textureLoader.load(publicAsset('images/target.jpg'))
    targetTexture.colorSpace = THREE.SRGBColorSpace

    const targetFace = new THREE.Mesh(
      new THREE.CircleGeometry(1.55, 96),
      new THREE.MeshBasicMaterial({
        map: targetTexture,
        transparent: false,
      })
    )
    targetFace.position.z = 0.15
    this.targetRoot.add(targetFace)

    this.scene.add(this.targetRoot)

    this.buildBow()
    this.buildArrowSprites()
  }

  private disposeRoomEnvChildren() {
    const children = [...this.roomEnvGroup.children]
    for (const child of children) {
      this.roomEnvGroup.remove(child)
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose()
        const mats = Array.isArray(child.material)
          ? child.material
          : [child.material]
        for (const m of mats) {
          const mat = m as THREE.MeshStandardMaterial | THREE.MeshBasicMaterial
          mat.map = null
          mat.dispose()
        }
      }
    }
  }

  /** 좌·뒤·우·바닥 PNG를 한 장으로 스티칭한 뒤, 면마다 UV로 잘라 연결 */
  private async buildStitchedRoomEnvironment() {
    const addFallbackSeparateTextures = () => {
      if (this.isDestroyed) return
      this.disposeRoomEnvChildren()
      if (this.roomAtlasTexture) {
        this.roomAtlasTexture.dispose()
        this.roomAtlasTexture = null
      }

      const srgbMap = (url: string) => {
        const map = this.textureLoader.load(url)
        map.colorSpace = THREE.SRGBColorSpace
        return map
      }

      const floor = new THREE.Mesh(
        new THREE.PlaneGeometry(20, 20),
        new THREE.MeshStandardMaterial({
          map: srgbMap('images/floor.png'),
          roughness: 0.92,
          metalness: 0,
        })
      )
      floor.rotation.x = -Math.PI / 2
      floor.position.set(0, -3, -2)

      const backWall = new THREE.Mesh(
        new THREE.PlaneGeometry(20, 12),
        new THREE.MeshBasicMaterial({ map: srgbMap('images/wall.png') })
      )
      backWall.position.set(0, 3, -12)

      const leftWall = new THREE.Mesh(
        new THREE.PlaneGeometry(20, 12),
        new THREE.MeshBasicMaterial({ map: srgbMap('images/leftwall.png') })
      )
      leftWall.position.set(-10, 3, -2)
      leftWall.rotation.y = Math.PI / 2

      const rightWall = new THREE.Mesh(
        new THREE.PlaneGeometry(20, 12),
        new THREE.MeshBasicMaterial({ map: srgbMap('images/rightwall.png') })
      )
      rightWall.position.set(10, 3, -2)
      rightWall.rotation.y = -Math.PI / 2

      this.roomEnvGroup.add(floor, backWall, leftWall, rightWall)
    }

    try {
      const [leftImg, backImg, rightImg, floorImg] = await Promise.all([
        loadImageElement(publicAsset('images/leftwall.png')),
        loadImageElement(publicAsset('images/wall.png')),
        loadImageElement(publicAsset('images/rightwall.png')),
        loadImageElement(publicAsset('images/floor.png')),
      ])
      if (this.isDestroyed) return

      this.disposeRoomEnvChildren()
      if (this.roomAtlasTexture) {
        this.roomAtlasTexture.dispose()
        this.roomAtlasTexture = null
      }

      const lw = leftImg.naturalWidth
      const lh = leftImg.naturalHeight
      const bw = backImg.naturalWidth
      const bh = backImg.naturalHeight
      const rw = rightImg.naturalWidth
      const rh = rightImg.naturalHeight
      const fh = floorImg.naturalHeight

      const wallRowH = Math.max(lh, bh, rh)
      const cw = lw + bw + rw
      const ch = wallRowH + fh

      const canvas = document.createElement('canvas')
      canvas.width = cw
      canvas.height = ch
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        addFallbackSeparateTextures()
        return
      }
      ctx.imageSmoothingEnabled = true

      ctx.drawImage(leftImg, 0, wallRowH - lh)
      ctx.drawImage(backImg, lw, wallRowH - bh)
      ctx.drawImage(rightImg, lw + bw, wallRowH - rh)
      ctx.drawImage(floorImg, 0, wallRowH, cw, fh)

      const atlas = new THREE.CanvasTexture(canvas)
      atlas.colorSpace = THREE.SRGBColorSpace
      atlas.wrapS = THREE.ClampToEdgeWrapping
      atlas.wrapT = THREE.ClampToEdgeWrapping
      atlas.needsUpdate = true
      this.roomAtlasTexture = atlas

      const leftRect = { x: 0, y: wallRowH - lh, w: lw, h: lh }
      const backRect = { x: lw, y: wallRowH - bh, w: bw, h: bh }
      const rightRect = { x: lw + bw, y: wallRowH - rh, w: rw, h: rh }
      const floorRect = { x: 0, y: wallRowH, w: cw, h: fh }

      const leftUv = atlasUvRangeFromCanvasRect(
        cw,
        ch,
        leftRect.x,
        leftRect.y,
        leftRect.w,
        leftRect.h
      )
      const backUv = atlasUvRangeFromCanvasRect(
        cw,
        ch,
        backRect.x,
        backRect.y,
        backRect.w,
        backRect.h
      )
      const rightUv = atlasUvRangeFromCanvasRect(
        cw,
        ch,
        rightRect.x,
        rightRect.y,
        rightRect.w,
        rightRect.h
      )
      const floorUv = atlasUvRangeFromCanvasRect(
        cw,
        ch,
        floorRect.x,
        floorRect.y,
        floorRect.w,
        floorRect.h
      )

      const leftGeo = new THREE.PlaneGeometry(20, 12)
      applyAtlasUvToPlane(
        leftGeo,
        leftUv.uMin,
        leftUv.uMax,
        leftUv.vMin,
        leftUv.vMax
      )
      const leftWall = new THREE.Mesh(
        leftGeo,
        new THREE.MeshBasicMaterial({ map: atlas })
      )
      leftWall.position.set(-10, 3, -2)
      leftWall.rotation.y = Math.PI / 2

      const backGeo = new THREE.PlaneGeometry(20, 12)
      applyAtlasUvToPlane(
        backGeo,
        backUv.uMin,
        backUv.uMax,
        backUv.vMin,
        backUv.vMax
      )
      const backWall = new THREE.Mesh(
        backGeo,
        new THREE.MeshBasicMaterial({ map: atlas })
      )
      backWall.position.set(0, 3, -12)

      const rightGeo = new THREE.PlaneGeometry(20, 12)
      applyAtlasUvToPlane(
        rightGeo,
        rightUv.uMin,
        rightUv.uMax,
        rightUv.vMin,
        rightUv.vMax
      )
      const rightWall = new THREE.Mesh(
        rightGeo,
        new THREE.MeshBasicMaterial({ map: atlas })
      )
      rightWall.position.set(10, 3, -2)
      rightWall.rotation.y = -Math.PI / 2

      const floorGeo = new THREE.PlaneGeometry(20, 20)
      applyAtlasUvToPlane(
        floorGeo,
        floorUv.uMin,
        floorUv.uMax,
        floorUv.vMin,
        floorUv.vMax
      )
      const floor = new THREE.Mesh(
        floorGeo,
        new THREE.MeshStandardMaterial({
          map: atlas,
          roughness: 0.92,
          metalness: 0,
        })
      )
      floor.rotation.x = -Math.PI / 2
      floor.position.set(0, -3, -2)

      this.roomEnvGroup.add(floor, backWall, leftWall, rightWall)
    } catch {
      addFallbackSeparateTextures()
    }
  }

  private buildBow() {
    const bowArc = new THREE.Mesh(
      new THREE.TorusGeometry(0.62, 0.04, 12, 80, Math.PI),
      new THREE.MeshStandardMaterial({ color: 0x7c4a1d })
    )
    bowArc.rotation.y = Math.PI / 2
    this.bowGroup.add(bowArc)

    const bowString = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, 0.6, 0),
        new THREE.Vector3(0.22, 0, 0),
        new THREE.Vector3(0, -0.6, 0),
      ]),
      new THREE.LineBasicMaterial({ color: 0xf8fafc })
    )
    this.bowGroup.add(bowString)

    this.bowGroup.position.copy(this.bowRestPosition)
    this.scene.add(this.bowGroup)
  }

  private buildArrowSprites() {
    if (!this.arrowTexture) return

    const flightMaterial = new THREE.SpriteMaterial({
      map: this.arrowTexture,
      transparent: true,
      depthWrite: false,
    })

    this.arrowFlightSprite = new THREE.Sprite(flightMaterial)
    this.arrowFlightSprite.scale.set(this.ARROW_SPRITE_WIDTH, this.ARROW_SPRITE_HEIGHT, 1)
    this.scene.add(this.arrowFlightSprite)

    const stuckMaterial = new THREE.SpriteMaterial({
      map: this.arrowTexture,
      transparent: true,
      depthWrite: false,
    })

    this.arrowStuckSprite = new THREE.Sprite(stuckMaterial)
    this.arrowStuckSprite.visible = false
    this.arrowStuckSprite.scale.set(
      this.ARROW_SPRITE_WIDTH * this.ARROW_HIT_SCALE_RATIO,
      this.ARROW_SPRITE_HEIGHT * this.ARROW_HIT_SCALE_RATIO,
      1
    )
    this.scene.add(this.arrowStuckSprite)

    this.placeArrowSpriteByTip(
      this.arrowFlightSprite,
      this.arrowRestTipPosition,
      -this.ARROW_IMAGE_TIP_DIRECTION,
      this.ARROW_SPRITE_WIDTH,
      this.ARROW_SPRITE_HEIGHT
    )
  }

  private createBagSprite(color: string) {
    const tex = this.bagTextures[color]
    const material = new THREE.SpriteMaterial({
      map: tex ?? undefined,
      transparent: true,
      depthWrite: false,
    })
    const sprite = new THREE.Sprite(material)
    sprite.scale.set(BAG_SPRITE_SCALE_X, BAG_SPRITE_SCALE_Y, 1)
    return sprite
  }

  /**
   * 다음에 맞출 복주머니 강조: 스프라이트는 텍스처×color 곱셈이라
   * (1,1,1)↔살짝 파스텔만 바꾸면 거의 안 보임 → 어두운 틴트 ↔ 크로마 기준 밝은 틴트로 대비를 크게 잡음.
   */
  private updateBagTargetHighlight() {
    this.normalizeExpectedTargetIndex()
    const expected = this.targetOrder[this.currentTargetIndex]
    const pulse = 0.5 + 0.5 * Math.sin(this.elapsedTime * 5.2)

    for (const bag of this.bagTargets) {
      const mat = bag.mesh.material as THREE.SpriteMaterial
      if (bag.bagColor !== expected) {
        mat.color.copy(this.bagTintNeutral)
        bag.mesh.scale.set(BAG_SPRITE_SCALE_X, BAG_SPRITE_SCALE_Y, 1)
        continue
      }

      const hex = BAG_SPRITE_CHROMA_HEX[bag.bagColor] ?? 0xffffff
      this.bagTintChroma.setHex(hex)
      // 밝은 쪽: 컬러를 흰색과 ~22%만 섞어 채도 유지 + 월등히 밝아 보이게
      this.bagTintBright.copy(this.bagTintChroma).lerp(this.bagTintNeutral, 0.22)
      // 어두운 쪽: 전체를 살짝 눌러 깜박임 대비
      this.bagTintDim.setRGB(0.74, 0.74, 0.74)
      mat.color.copy(this.bagTintDim).lerp(this.bagTintBright, pulse)

      const scalePulse = 1 + 0.3 * pulse
      bag.mesh.scale.set(
        BAG_SPRITE_SCALE_X * scalePulse,
        BAG_SPRITE_SCALE_Y * scalePulse,
        1
      )
    }
  }

  private createRoundBags() {
    this.bagTargets.forEach((bag) => {
      this.targetRoot.remove(bag.mesh)
      const mat = bag.mesh.material as THREE.SpriteMaterial
      mat.dispose()
    })
    this.bagTargets = []

    const usedPositions: THREE.Vector3[] = []
    const minSeparation = 0.52
    const randomRadiusMin = 0.2
    const randomRadiusMax = 1.12

    for (let i = 0; i < 5; i += 1) {
      const bagColor = BAG_COLOR_ORDER[i]

      let reward = this.rewards.find((r) => r.bagColor === bagColor)
      if (!reward) {
        reward = weightedPick(this.rewards)
      }

      let x = 0
      let y = 0
      let tries = 0
      while (tries < 120) {
        const angle = Math.random() * Math.PI * 2
        const radius =
          randomRadiusMin + Math.random() * (randomRadiusMax - randomRadiusMin)
        x = Math.cos(angle) * radius
        y = Math.sin(angle) * radius

        const tooClose = usedPositions.some(
          (p) => p.distanceTo(new THREE.Vector3(x, y, 0)) < minSeparation
        )

        if (!tooClose) break
        tries += 1
      }

      usedPositions.push(new THREE.Vector3(x, y, 0))

      const bagSprite = this.createBagSprite(bagColor)
      bagSprite.position.set(x, y, 0.42)
      this.targetRoot.add(bagSprite)

      this.bagTargets.push({
        id: `bag_${bagColor}_${i}`,
        mesh: bagSprite,
        reward,
        bagColor,
        radius: 0.22,
      })
    }

    this.currentTargetIndex = 0
    this.updatePredictedImpact()
    this.emitScopePreview()
  }

  private getWindInfo(): WindState {
    const speed = Math.sqrt(this.wind.x * this.wind.x + this.wind.y * this.wind.y)
    const speedMps = Number((speed * this.WIND_SPEED_SCALE).toFixed(1))

    const angleRad = Math.atan2(this.wind.y, this.wind.x)
    const angleDeg = (THREE.MathUtils.radToDeg(angleRad) + 360) % 360

    const sectors = [
      { name: '동', arrow: '→' },
      { name: '북동', arrow: '↗' },
      { name: '북', arrow: '↑' },
      { name: '북서', arrow: '↖' },
      { name: '서', arrow: '←' },
      { name: '남서', arrow: '↙' },
      { name: '남', arrow: '↓' },
      { name: '남동', arrow: '↘' },
    ]

    const sectorIndex = Math.round(angleDeg / 45) % 8
    const sector = sectors[sectorIndex]

    return {
      x: this.wind.x,
      y: this.wind.y,
      speedMps,
      direction8: sector.name,
      arrow: sector.arrow,
      angleDeg,
    }
  }

  private getAimBaseWorld() {
    const offset = new THREE.Vector2(
      this.userAim.x * this.AIM_RANGE_X,
      -this.userAim.y * this.AIM_RANGE_Y
    )

    if (offset.length() > this.AIM_MAX_RADIUS) {
      offset.setLength(this.AIM_MAX_RADIUS)
    }

    return new THREE.Vector3(
      this.boardCenter.x + offset.x,
      this.boardCenter.y + offset.y,
      this.boardCenter.z + 0.35
    )
  }

  private getWindDriftVector() {
    const windMpsX = this.wind.x * this.WIND_SPEED_SCALE
    const windMpsY = this.wind.y * this.WIND_SPEED_SCALE

    return new THREE.Vector3(
      windMpsX * this.WIND_DRIFT_PER_MPS_X,
      windMpsY * this.WIND_DRIFT_PER_MPS_Y,
      0
    )
  }

  private calculatePredictedImpactWorld() {
    const base = this.getAimBaseWorld()
    const drift = this.getWindDriftVector()
    const spread = new THREE.Vector3(this.SPREAD_X, this.SPREAD_Y, 0)

    const offset = new THREE.Vector2(
      base.x - this.boardCenter.x + drift.x + spread.x,
      base.y - this.boardCenter.y + drift.y + spread.y
    )

    if (offset.length() > this.BOARD_HIT_RADIUS) {
      offset.setLength(this.BOARD_HIT_RADIUS)
    }

    return new THREE.Vector3(
      this.boardCenter.x + offset.x,
      this.boardCenter.y + offset.y,
      this.boardCenter.z + 0.35
    )
  }

  private updatePredictedImpact() {
    this.predictedImpactWorld.copy(this.calculatePredictedImpactWorld())
  }

  private getPredictedImpactNormalized() {
    return {
      x: clamp(
        (this.predictedImpactWorld.x - this.boardCenter.x) / this.BOARD_PREVIEW_RADIUS,
        -1,
        1
      ),
      y: clamp(
        (this.predictedImpactWorld.y - this.boardCenter.y) / this.BOARD_PREVIEW_RADIUS,
        -1,
        1
      ),
    }
  }

  private emitScopePreview() {
    this.normalizeExpectedTargetIndex()
    const predicted = this.getPredictedImpactNormalized()
    const aimDuration = this.isAiming ? this.elapsedTime - this.aimStartTime : 0
    const predictedScreenPos = this.predictedImpactWorld.clone().project(this.camera)
    const aimCenterWorld = this.getAimBaseWorld()
    const aimCenterScreenPos = aimCenterWorld.clone().project(this.camera)
    const aimCenterNormalized = {
      x: clamp(
        (aimCenterWorld.x - this.boardCenter.x) / this.BOARD_PREVIEW_RADIUS,
        -1,
        1
      ),
      y: clamp(
        (aimCenterWorld.y - this.boardCenter.y) / this.BOARD_PREVIEW_RADIUS,
        -1,
        1
      ),
    }

    const expectedNextColor = this.targetOrder[this.currentTargetIndex]

    const preview: ScopePreviewState = {
      bags: this.bagTargets
        .map((bag, index) => {
          const worldPos = bag.mesh.getWorldPosition(new THREE.Vector3())
          const projected = worldPos.project(this.camera)

          return {
            id: bag.id,
            color: bag.bagColor,
            x: clamp(bag.mesh.position.x / this.BOARD_PREVIEW_RADIUS, -1, 1),
            y: clamp(bag.mesh.position.y / this.BOARD_PREVIEW_RADIUS, -1, 1),
            screenX: clamp(projected.x, -1, 1),
            screenY: clamp(projected.y, -1, 1),
            bagIndex: index,
            scale: bag.bagColor === expectedNextColor ? 1.5 : 1,
          }
        })
        .sort((a, b) => a.x - b.x),
      expectedNextColor,
      predicted: {
        ...predicted,
        screenX: clamp(predictedScreenPos.x, -1, 1),
        screenY: clamp(predictedScreenPos.y, -1, 1),
      },
      aimCenter: aimCenterNormalized,
      aimCenterScreen: {
        x: clamp(aimCenterScreenPos.x, -1, 1),
        y: clamp(aimCenterScreenPos.y, -1, 1),
      },
      aimDuration,
    }

    this.callbacks.onScopePreviewChange?.(preview)
  }

  /** 복주머니를 맞춘 뒤 순서를 한 칸 진행 (5번째 다음은 다시 1번째 색) */
  private advanceSequenceAfterBagHit() {
    this.currentTargetIndex =
      (this.currentTargetIndex + 1) % this.targetOrder.length
  }

  /** 이미 맞춰 없어진 색이면 순서를 건너뛰어 남아 있는 다음 목표 색으로 맞춤 */
  private normalizeExpectedTargetIndex() {
    if (this.bagTargets.length === 0) return
    let guard = 0
    while (guard < this.targetOrder.length) {
      const expected = this.targetOrder[this.currentTargetIndex]
      if (this.bagTargets.some((b) => b.bagColor === expected)) return
      this.currentTargetIndex =
        (this.currentTargetIndex + 1) % this.targetOrder.length
      guard += 1
    }
  }

  private disposeBagMesh(bag: BagTarget) {
    if (bag.mesh.parent) {
      this.targetRoot.remove(bag.mesh)
    }
    const mat = bag.mesh.material as THREE.SpriteMaterial
    mat.dispose()
  }

  private placeArrowSpriteByTip(
    sprite: THREE.Sprite,
    tipWorld: THREE.Vector3,
    tipAngle: number,
    spriteWidth: number,
    spriteHeight: number
  ) {
    const tipLocalX = (this.ARROW_TIP_U - 0.5) * spriteWidth
    const tipLocalY = (0.5 - this.ARROW_TIP_V) * spriteHeight

    const spriteRotation = tipAngle - this.ARROW_IMAGE_TIP_DIRECTION

    const cos = Math.cos(spriteRotation)
    const sin = Math.sin(spriteRotation)

    const rotatedTipX = tipLocalX * cos - tipLocalY * sin
    const rotatedTipY = tipLocalX * sin + tipLocalY * cos

    sprite.position.set(
      tipWorld.x - rotatedTipX,
      tipWorld.y - rotatedTipY,
      tipWorld.z
    )
    sprite.scale.set(spriteWidth, spriteHeight, 1)
    ;(sprite.material as THREE.SpriteMaterial).rotation = spriteRotation
  }

  private getArrowTipAtProgress(progress: number) {
    const eased = easeInOutQuad(clamp(progress, 0, 1))
    const position = new THREE.Vector3().lerpVectors(
      this.fireState.startWorld,
      this.fireState.targetWorld,
      eased
    )

    position.y += Math.sin(Math.PI * eased) * 0.25
    return position
  }

  private getArrowFlightScaleRatio(progress: number) {
    const eased = easeInOutQuad(clamp(progress, 0, 1))
    return lerp(1, this.ARROW_HIT_SCALE_RATIO, eased)
  }

  private updateWind(time: number) {
    if (time >= this.nextWindChangeAt) {
      const noWindChance = 0.2
      if (Math.random() < noWindChance) {
        this.windTarget.set(0, 0)
      } else {
        const angle = Math.random() * Math.PI * 2
        const strength = 0.04 + Math.random() * 0.46
        this.windTarget.set(Math.cos(angle) * strength, Math.sin(angle) * strength)
      }
      const windIntervalSec =
        this.windChangeIntervalMinSec +
        Math.random() *
          (this.windChangeIntervalMaxSec - this.windChangeIntervalMinSec)
      this.nextWindChangeAt = time + windIntervalSec
    }

    this.wind.lerp(this.windTarget, 0.03)

    this.updatePredictedImpact()
    this.callbacks.onWindChange?.(this.getWindInfo())

    if (this.isAiming && !this.fireState.active) {
      this.emitScopePreview()
    }
  }

  private updateBowAndArrow() {
    if (this.fireState.active) return
    if (this.isResolvingShot) return
    if (!this.arrowFlightSprite) return

    const aimTip = this.getAimBaseWorld()
    this.arrowFlightSprite.visible = true

    const dir = aimTip.clone().sub(this.arrowRestTipPosition).normalize()
    const tipAngle = Math.atan2(dir.y, dir.x)

    this.placeArrowSpriteByTip(
      this.arrowFlightSprite,
      this.arrowRestTipPosition,
      tipAngle,
      this.ARROW_SPRITE_WIDTH,
      this.ARROW_SPRITE_HEIGHT
    )

    if (this.isAiming) {
      this.arrowFlightSprite.position.z += 0.08
    }

    this.bowGroup.position.copy(this.bowRestPosition)
    this.bowGroup.lookAt(aimTip)
    this.bowGroup.rotateY(Math.PI * 0.03)
  }

  private updateFire(delta: number) {
    if (!this.fireState.active || !this.arrowFlightSprite) return

    this.fireState.elapsed += delta
    const rawProgress = clamp(this.fireState.elapsed / this.fireState.duration, 0, 1)

    const currentTip = this.getArrowTipAtProgress(rawProgress)
    const previousTip = this.fireState.previousTipWorld.clone()

    const dir2D = currentTip.clone().sub(previousTip)
    if (dir2D.lengthSq() < 0.000001) {
      dir2D.copy(this.fireState.targetWorld).sub(this.fireState.startWorld)
    }

    const tipAngle = Math.atan2(dir2D.y, dir2D.x)
    const scaleRatio = this.getArrowFlightScaleRatio(rawProgress)

    this.placeArrowSpriteByTip(
      this.arrowFlightSprite,
      currentTip,
      tipAngle,
      this.ARROW_SPRITE_WIDTH * scaleRatio,
      this.ARROW_SPRITE_HEIGHT * scaleRatio
    )

    this.fireState.previousTipWorld.copy(currentTip)

    if (rawProgress >= 1) {
      this.handleArrowImpact(this.fireState.targetWorld.clone(), tipAngle)
    }
  }

  private updateBurstEffects(delta: number) {
    if (this.bagBurstAnimations.length > 0) {
      const remain: BagBurstAnimation[] = []

      for (const anim of this.bagBurstAnimations) {
        anim.elapsed += delta
        const t = Math.min(anim.elapsed / anim.duration, 1)

        const shakePower = (1 - t) * 0.055
        const shakeX = Math.sin(anim.elapsed * 70) * shakePower
        const shakeY = Math.cos(anim.elapsed * 84) * shakePower
        const scaleBoost = 1 + Math.sin(t * Math.PI) * 0.24 + t * 0.18

        anim.bagMesh.position.set(
          anim.basePosition.x + shakeX,
          anim.basePosition.y + shakeY,
          anim.basePosition.z
        )
        anim.bagMesh.scale.set(
          anim.baseScale.x * scaleBoost,
          anim.baseScale.y * scaleBoost,
          anim.baseScale.z
        )

        if (!anim.burstTriggered && anim.elapsed >= anim.burstTime) {
          anim.burstTriggered = true
          this.spawnFireworkBurst(anim.worldPosition, anim.bagColor, anim.rewardScore)
          this.spawnShockwave(anim.worldPosition)
          this.startScreenShake(0.2, 0.045)
        }

        if (anim.elapsed < anim.duration) {
          remain.push(anim)
        } else {
          anim.bagMesh.position.copy(anim.basePosition)
          anim.bagMesh.scale.copy(anim.baseScale)
        }
      }

      this.bagBurstAnimations = remain
    }

    if (this.burstParticles.length > 0) {
      const remainParticles: BurstParticle[] = []

      for (const particle of this.burstParticles) {
        particle.life += delta
        particle.velocity.y += particle.gravity * delta
        particle.mesh.position.addScaledVector(particle.velocity, delta)

        particle.mesh.rotation.x += particle.spin.x * delta
        particle.mesh.rotation.y += particle.spin.y * delta
        particle.mesh.rotation.z += particle.spin.z * delta

        const progress = particle.life / particle.maxLife
        const material = particle.mesh.material as THREE.MeshBasicMaterial

        if (progress >= particle.fadeStart) {
          const fadeProgress = (progress - particle.fadeStart) / (1 - particle.fadeStart)
          material.opacity = Math.max(0, 1 - fadeProgress)
        }

        const scale = lerp(particle.startScale, particle.endScale, Math.min(1, progress))
        particle.mesh.scale.setScalar(Math.max(0.02, scale))

        if (particle.life < particle.maxLife) {
          remainParticles.push(particle)
        } else if (particle.mesh.parent) {
          particle.mesh.parent.remove(particle.mesh)
        }
      }

      this.burstParticles = remainParticles
    }

    if (this.shockwaves.length > 0) {
      const remainShockwaves: Shockwave[] = []

      for (const wave of this.shockwaves) {
        wave.life += delta
        const progress = clamp(wave.life / wave.maxLife, 0, 1)
        const scale = lerp(wave.startScale, wave.endScale, progress)
        wave.mesh.scale.set(scale, scale, 1)

        const material = wave.mesh.material as THREE.MeshBasicMaterial
        material.opacity = Math.max(0, 0.85 * (1 - progress))

        if (wave.life < wave.maxLife) {
          remainShockwaves.push(wave)
        } else if (wave.mesh.parent) {
          wave.mesh.parent.remove(wave.mesh)
        }
      }

      this.shockwaves = remainShockwaves
    }
  }

  private updateScreenShake(delta: number) {
    if (this.screenShakeTime <= 0) return

    this.camera.position.sub(this.lastCameraShakeOffset)
    this.lastCameraShakeOffset.set(0, 0, 0)

    this.screenShakeTime -= delta
    const progress = clamp(this.screenShakeTime / this.screenShakeDuration, 0, 1)
    const strength = this.screenShakeStrength * progress

    const offsetX = (Math.random() - 0.5) * strength
    const offsetY = (Math.random() - 0.5) * strength * 0.7
    const offsetZ = (Math.random() - 0.5) * strength * 0.25

    this.lastCameraShakeOffset.set(offsetX, offsetY, offsetZ)
    this.camera.position.add(this.lastCameraShakeOffset)

    if (this.screenShakeTime <= 0) {
      this.camera.position.sub(this.lastCameraShakeOffset)
      this.lastCameraShakeOffset.set(0, 0, 0)
    }
  }

  private startScreenShake(duration: number, strength: number) {
    this.screenShakeDuration = duration
    this.screenShakeTime = duration
    this.screenShakeStrength = strength
  }

  private queueBagBurst(bag: BagTarget, rewardScore: number) {
    this.bagBurstAnimations.push({
      bagMesh: bag.mesh,
      basePosition: bag.mesh.position.clone(),
      baseScale: bag.mesh.scale.clone(),
      elapsed: 0,
      duration: 0.42,
      burstTime: 0.12,
      burstTriggered: false,
      worldPosition: bag.mesh.getWorldPosition(new THREE.Vector3()),
      bagColor: bag.bagColor,
      rewardScore,
    })
  }

  private spawnFireworkBurst(worldPosition: THREE.Vector3, bagColor: string, rewardScore: number) {
    const colorMap: Record<string, number> = {
      red: 0xef4444,
      blue: 0x3b82f6,
      green: 0x22c55e,
      yellow: 0xfacc15,
      purple: 0xa855f7,
      gray: 0x94a3b8,
    }

    const mainColor = colorMap[bagColor] ?? 0xffffff
    const goldColor = 0xf59e0b
    const count = rewardScore >= 100 ? 56 : rewardScore >= 80 ? 44 : 32

    for (let i = 0; i < count; i += 1) {
      const angle = Math.random() * Math.PI * 2
      const upward = (Math.random() - 0.2) * 0.9
      const speed = 0.9 + Math.random() * 1.35

      const color = i % 4 === 0 ? goldColor : mainColor
      const size = 0.045 + Math.random() * 0.035

      const particle = new THREE.Mesh(
        new THREE.SphereGeometry(size, 8, 8),
        new THREE.MeshBasicMaterial({
          color,
          transparent: true,
          opacity: 1,
        })
      )

      particle.position.copy(worldPosition)
      particle.position.z += 0.25 + Math.random() * 0.12
      this.scene.add(particle)

      this.burstParticles.push({
        mesh: particle,
        velocity: new THREE.Vector3(
          Math.cos(angle) * speed,
          Math.sin(angle) * speed + upward,
          (Math.random() - 0.5) * 0.35
        ),
        life: 0,
        maxLife: 1.4 + Math.random() * 0.45,
        gravity: -1.4,
        spin: new THREE.Vector3(
          Math.random() * 6,
          Math.random() * 6,
          Math.random() * 6
        ),
        fadeStart: 0.45,
        startScale: 1,
        endScale: 0.18,
      })
    }
  }

  private spawnShockwave(worldPosition: THREE.Vector3) {
    const wave = new THREE.Mesh(
      new THREE.RingGeometry(0.08, 0.14, 32),
      new THREE.MeshBasicMaterial({
        color: 0xffd700,
        transparent: true,
        opacity: 0.85,
        side: THREE.DoubleSide,
      })
    )

    wave.position.copy(worldPosition)
    wave.position.z += 0.2
    wave.lookAt(this.camera.position)
    this.scene.add(wave)

    this.shockwaves.push({
      mesh: wave,
      life: 0,
      maxLife: 0.45,
      startScale: 1,
      endScale: 4.8,
    })
  }

  private handleArrowImpact(impactTipPosition: THREE.Vector3, tipAngle: number) {
    if (this.isResolvingShot || !this.arrowFlightSprite) return

    this.isResolvingShot = true
    this.fireState.active = false
    // 착탄 프레임에서 비행 화살을 즉시 숨겨, 박힌 화살과 겹쳐 보이는 현상 제거
    this.arrowFlightSprite.visible = false
    this.playSound(this.hitTargetAudio)

    this.createImpactVisuals(impactTipPosition.clone(), tipAngle)

    let hitBag: BagTarget | null = null
    let minDistance = Number.POSITIVE_INFINITY

    for (const bag of this.bagTargets) {
      const worldPos = bag.mesh.getWorldPosition(this.tempVec3.clone())
      const distance = impactTipPosition.distanceTo(worldPos)

      if (distance <= bag.radius && distance < minDistance) {
        hitBag = bag
        minDistance = distance
      }
    }

    let result: ArcheryRewardResult

    if (hitBag) {
      this.playSound(this.hitBagAudio)

      const expectedColor = this.targetOrder[this.currentTargetIndex]
      const isCorrectSequenceHit = hitBag.bagColor === expectedColor

      if (isCorrectSequenceHit) {
        const pool = this.rewards.filter(isLuckyYamlDrawEligible)
        const picked =
          pool.length > 0 ? weightedPick(pool) : hitBag.reward
        result = {
          ...picked,
          bagColor: hitBag.bagColor,
        }
      } else {
        const template = this.rewards.find((r) => r.title === '행운 폭발!')
        result = {
          id: template?.id ?? 'wrong_balloon_burst',
          type: 'reward',
          title: '행운 폭발!',
          message:
            template?.message ??
            '기대하지 않았던 즐거운 일이 생길 수 있어요.',
          score: 0,
          bagColor: hitBag.bagColor,
        }
      }

      result.score = accuracyScoreFromHit(
        impactTipPosition,
        hitBag,
        this.ACCURACY_SCORE_MAX,
        this.ACCURACY_SCORE_MIN
      )

      this.queueBagBurst(hitBag, result.score)

      const removed = hitBag
      const idx = this.bagTargets.indexOf(removed)
      if (idx >= 0) {
        this.bagTargets.splice(idx, 1)
      }
      this.advanceSequenceAfterBagHit()
      this.emitScopePreview()

      window.setTimeout(() => {
        if (this.isDestroyed) return
        this.disposeBagMesh(removed)
      }, 480)
    } else {
      result = {
        id: 'default_miss',
        type: 'miss',
        title: '꽝!',
        message: '다음기회에',
        score: 0,
        bagColor: 'gray',
      }
    }

    if (this.arrowHideTimer !== null) {
      clearTimeout(this.arrowHideTimer)
      this.arrowHideTimer = null
    }

    if (this.resultDelayTimer !== null) {
      clearTimeout(this.resultDelayTimer)
    }

    this.resultDelayTimer = window.setTimeout(() => {
      if (this.isDestroyed) return

      this.callbacks.onReward?.(result)

      this.clearImpactObjects()
      this.resetArrow()
      this.isResolvingShot = false
      this.resultDelayTimer = null
    }, 1000)
  }

  private createImpactVisuals(impactTipPosition: THREE.Vector3, tipAngle: number) {
    this.clearImpactObjects()

    const localImpact = this.targetRoot.worldToLocal(impactTipPosition.clone())

    const holeOuter = new THREE.Mesh(
      new THREE.CircleGeometry(0.1, 24),
      new THREE.MeshBasicMaterial({
        color: 0x1f2937,
        transparent: true,
        opacity: 0.45,
      })
    )
    holeOuter.position.set(localImpact.x, localImpact.y, 0.17)
    this.targetRoot.add(holeOuter)
    this.impactObjects.push(holeOuter)

    const holeInner = new THREE.Mesh(
      new THREE.CircleGeometry(0.06, 24),
      new THREE.MeshBasicMaterial({ color: 0x020617 })
    )
    holeInner.position.set(localImpact.x, localImpact.y, 0.171)
    this.targetRoot.add(holeInner)
    this.impactObjects.push(holeInner)

    if (this.arrowStuckSprite) {
      this.arrowStuckSprite.visible = true

      const stuckTip = impactTipPosition.clone().add(
        new THREE.Vector3(
          Math.cos(tipAngle) * -0.08,
          Math.sin(tipAngle) * -0.08,
          0
        )
      )

      this.placeArrowSpriteByTip(
        this.arrowStuckSprite,
        stuckTip,
        tipAngle,
        this.ARROW_SPRITE_WIDTH * this.ARROW_HIT_SCALE_RATIO,
        this.ARROW_SPRITE_HEIGHT * this.ARROW_HIT_SCALE_RATIO
      )

      this.impactObjects.push(this.arrowStuckSprite)
    }
  }

  private clearImpactObjects() {
    this.impactObjects.forEach((obj) => {
      if (obj.parent && obj !== this.arrowStuckSprite) {
        obj.parent.remove(obj)
      }
    })
    this.impactObjects = []

    if (this.arrowStuckSprite) {
      this.arrowStuckSprite.visible = false
    }
  }

  private clearBurstEffects() {
    this.burstParticles.forEach((particle) => {
      if (particle.mesh.parent) {
        particle.mesh.parent.remove(particle.mesh)
      }
    })
    this.burstParticles = []

    this.shockwaves.forEach((wave) => {
      if (wave.mesh.parent) {
        wave.mesh.parent.remove(wave.mesh)
      }
    })
    this.shockwaves = []

    this.bagBurstAnimations = []
  }

  private resetArrow() {
    this.fireState.active = false
    this.fireState.elapsed = 0
    this.fireState.previousTipWorld.copy(this.arrowRestTipPosition)

    if (this.arrowFlightSprite) {
      this.arrowFlightSprite.visible = true
      this.placeArrowSpriteByTip(
        this.arrowFlightSprite,
        this.arrowRestTipPosition,
        -this.ARROW_IMAGE_TIP_DIRECTION,
        this.ARROW_SPRITE_WIDTH,
        this.ARROW_SPRITE_HEIGHT
      )
    }

    if (this.arrowStuckSprite) {
      this.arrowStuckSprite.visible = false
    }
  }

  private animate = (timestamp: number) => {
    if (this.isDestroyed) return

    if (this.lastFrameTime === 0) {
      this.lastFrameTime = timestamp
    }

    const delta = Math.min((timestamp - this.lastFrameTime) / 1000, 0.05)
    this.lastFrameTime = timestamp
    this.elapsedTime += delta

    this.updateWind(this.elapsedTime)
    this.updateBowAndArrow()
    this.updateFire(delta)
    this.updateBurstEffects(delta)

    // Update predicted impact every frame while aiming to reflect wind changes
    if (this.isAiming && !this.fireState.active) {
      this.updatePredictedImpact()
      this.emitScopePreview()
    }

    // Auto-fire if aiming too long
    if (
      this.isAiming &&
      !this.fireState.active &&
      this.elapsedTime - this.aimStartTime > this.aimAutoFireAfterSec
    ) {
      this.releaseArrow()
    }

    const cameraTargetX = this.userAim.x * 0.12
    const cameraTargetY = 1.8 + this.userAim.y * 0.08

    this.camera.position.x = lerp(this.camera.position.x, cameraTargetX, 0.05)
    this.camera.position.y = lerp(this.camera.position.y, cameraTargetY, 0.05)
    this.camera.position.z = lerp(this.camera.position.z, 4.8, 0.08)

    this.updateScreenShake(delta)

    this.camera.lookAt(0, 1.8, -7)

    this.bagTargets.forEach((bag) => {
      bag.mesh.quaternion.copy(this.camera.quaternion)
    })

    this.updateBagTargetHighlight()

    this.renderer.render(this.scene, this.camera)
    this.frameId = requestAnimationFrame(this.animate)
  }

  private handleResize = () => {
    this.resize()
  }

  private bindEvents() {
    window.addEventListener('resize', this.handleResize)
  }
}