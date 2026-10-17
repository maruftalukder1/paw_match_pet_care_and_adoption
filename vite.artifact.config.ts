import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

// Temporary config (AUTHFIX2 publish): builds the app as ONE classic IIFE
// script (app.js) + one stylesheet (style.css) for the static artifact
// shell, which cannot load ES-module chunks. Dynamic imports (React.lazy
// Admin/Profile) are inlined, matching the previously published bundle.
export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    // Lib mode does not replace this by default; without it React ships
    // its development build (bigger, slower, console warnings).
    define: {
      'process.env.NODE_ENV': '"production"',
    },
    build: {
      outDir: '/tmp/pm-artifact-dist',
      emptyOutDir: true,
      cssCodeSplit: false,
      lib: {
        entry: path.resolve(__dirname, 'src/main.tsx'),
        formats: ['iife'],
        name: 'PawMatchApp',
        fileName: () => 'app.js',
      },
      rollupOptions: {
        output: {
          inlineDynamicImports: true,
        },
      },
    },
  };
});
