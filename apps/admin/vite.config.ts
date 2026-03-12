import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

const adminNodeModules = path.resolve(__dirname, 'node_modules');

export default defineConfig({
  plugins: [react()],
  resolve: {
    dedupe: ['react', 'react-dom'],
    alias: {
      '@': path.resolve(__dirname, './src'),
      react: path.resolve(adminNodeModules, 'react'),
      'react-dom': path.resolve(adminNodeModules, 'react-dom'),
      'react/jsx-runtime': path.resolve(adminNodeModules, 'react/jsx-runtime.js'),
      'react/jsx-dev-runtime': path.resolve(adminNodeModules, 'react/jsx-dev-runtime.js'),
    },
  },
  optimizeDeps: {
    include: ['react', 'react-dom', 'react/jsx-runtime', 'react/jsx-dev-runtime'],
  },
});
