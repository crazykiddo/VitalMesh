import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(({ command }) => {
  const isProduction = command === 'build';

  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // Allow custom hostname through Caddy
      allowedHosts: ['localhost'],
      // Allow any host
      // allowedHosts: 'all',
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: isProduction ? false : process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      // Ignore the JSON database file to prevent reloads when the simulation loop writes to it.
      watch: process.env.DISABLE_HMR === 'true' ? null : {
        ignored: ['**/vitalmesh_db.json'],
      },
    },
  };
});
