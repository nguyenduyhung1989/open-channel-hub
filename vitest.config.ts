import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const fromRoot = (path: string) => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@open-channel-hub/contracts': fromRoot('./packages/contracts/src/index.ts'),
      '@open-channel-hub/domain': fromRoot('./packages/domain/src/index.ts'),
      '@open-channel-hub/connector-sdk': fromRoot('./packages/connector-sdk/src/index.ts'),
      '@open-channel-hub/connector-telegram': fromRoot(
        './packages/connector-telegram/src/index.ts'
      ),
      '@open-channel-hub/storage-postgres': fromRoot('./packages/storage-postgres/src/index.ts')
    }
  },
  test: {
    coverage: {
      enabled: true,
      provider: 'v8',
      reporter: ['text', 'html']
    },
    environment: 'node',
    include: ['**/*.test.ts']
  }
});
