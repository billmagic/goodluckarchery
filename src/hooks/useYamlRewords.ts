// src/hooks/useYamlRewards.ts
import { useEffect, useState } from 'react'
import { loadLuckyBagYaml } from '../utils/yamlLoader'

export function useYamlRewards() {
  const [data, setData] = useState<any>(null)

  useEffect(() => {
    loadLuckyBagYaml().then(setData).catch(console.error)
  }, [])

  return data
}