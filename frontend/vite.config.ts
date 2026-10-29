import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// In dev, forward /api to the FastAPI server (uvicorn on :8000).
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: { '/api': process.env.API_URL ?? 'http://localhost:8000' },
  },
})
