/** `public/` 자산 URL — `vite.config.ts`의 `base`(예: `/goodluckarchery/`) 반영 */
export function publicAsset(path: string): string {
  const base = import.meta.env.BASE_URL.endsWith('/')
    ? import.meta.env.BASE_URL
    : `${import.meta.env.BASE_URL}/`
  const normalized = path.replace(/^\/+/, '')
  return `${base}${normalized}`
}
