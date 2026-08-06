import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  resolve: {
    // Alias `@/` harus dikenali di sini juga — tsconfig `paths` hanya dibaca
    // TypeScript dan Next, bukan Vite. Tanpa ini, test yang meng-import
    // komponen gagal dengan "Cannot find package '@/lib/...'".
    alias: {
      '@': fileURLToPath(new URL('.', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['**/__tests__/**/*.test.ts', '**/__tests__/**/*.test.tsx'],
    exclude: ['node_modules', '.next'],
  },
})
