import path from 'node:path';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  resolve: {
    dedupe: ['react', 'react-dom'],
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    proxy: {
      '/api/tools': process.env.VITE_TOOLS_API_TARGET
        || `http://127.0.0.1:${process.env.TOOLS_API_PORT || '8765'}`,
    },
  },
});
