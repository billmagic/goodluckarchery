import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
// GitHub 프로젝트 페이지: https://<user>.github.io/<저장소이름>/
// trailing slash 없이 접속할 때도 ./assets 가 /assets 로 잘못 붙는 문제를 피하려면 base를 저장소 경로로 둡니다.
// 저장소 이름을 바꾸면 아래 값도 같이 바꾸세요.
const repoBase = '/goodluckarchery/'

export default defineConfig({
  base: repoBase,
  plugins: [react()],
})
