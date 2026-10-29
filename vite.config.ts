import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: './',
  plugins: [react()],
  test: { environment: 'node', exclude: ['**/node_modules/**', '**/dist/**', '.claude/**'] },
} as any);
