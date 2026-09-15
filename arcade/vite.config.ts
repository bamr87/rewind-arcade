import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Relative base so the built site runs from any static host or a plain file path.
export default defineConfig({
  base: './',
  plugins: [react()],
});
