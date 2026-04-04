import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      // Allows: import { Button } from '@/components/ui/button'
      '@': path.resolve(__dirname, './src'),
    },
  },
});
