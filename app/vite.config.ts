import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// `base: './'`: the cluster serves the bundle under `/{version}/`, so every URL must be relative.
export default defineConfig({
  base: './',
  plugins: [react()],
});
