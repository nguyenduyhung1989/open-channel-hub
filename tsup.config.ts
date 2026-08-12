import { defineConfig } from 'tsup';

export default defineConfig({
  clean: true,
  dts: false,
  entry: {
    server: 'apps/api/src/server.ts',
    'telegram-bot/set-webhook': 'apps/api/src/telegram-bot/set-webhook.ts'
  },
  format: ['esm'],
  minify: false,
  outDir: 'apps/api/dist',
  platform: 'node',
  sourcemap: true,
  target: 'node24'
});
