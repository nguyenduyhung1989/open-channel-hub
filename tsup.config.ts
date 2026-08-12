import { defineConfig } from 'tsup';

export default defineConfig({
  clean: true,
  dts: false,
  entry: ['apps/api/src/server.ts'],
  format: ['esm'],
  minify: false,
  outDir: 'apps/api/dist',
  platform: 'node',
  sourcemap: true,
  target: 'node24'
});
