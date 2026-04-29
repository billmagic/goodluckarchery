// src/utils/yamlLoader.ts
import yaml from 'js-yaml'
import type { RewardItem } from '../game/ArcheryScene'
import { publicAsset } from './publicAsset'

export async function loadLuckyBagYaml(path = '/data/lucky-bags.yaml') {
  const url = publicAsset(path.replace(/^\/+/, ''))
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Failed to load yaml: ${url}`)
  }
  const text = await response.text()
  return yaml.load(text) as Record<string, unknown>
}

export function mapLuckyBagYamlToRewards(
  data: Record<string, unknown> | null | undefined
): RewardItem[] | null {
  if (!data) return null
  // 신규: `bags` / 구버전: `rewards`
  const list = data.bags ?? data.rewards
  if (!Array.isArray(list) || list.length === 0) return null

  return list.map((raw: Record<string, unknown>) => {
    const id = raw.id != null ? String(raw.id) : ''
    const type = raw.type === 'miss' ? 'miss' : 'reward'
    const title = String(raw.title ?? '')
    const message = String(raw.message ?? '')
    const result =
      raw.result != null && String(raw.result).length > 0
        ? String(raw.result)
        : undefined

    return {
      id,
      type,
      title,
      message,
      result,
      score: Number(raw.score) || 0,
      weight: raw.weight != null ? Number(raw.weight) : 1,
      color: raw.color != null ? String(raw.color) : undefined,
      bagColor: raw.color != null ? String(raw.color) : undefined,
    } satisfies RewardItem
  })
}