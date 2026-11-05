import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    fs: { allow: ['..'] }, // allow importing ../shared/damEngine.js
    proxy: { '/socket.io': { target: 'http://localhost:3001', ws: true } },
  },
});
