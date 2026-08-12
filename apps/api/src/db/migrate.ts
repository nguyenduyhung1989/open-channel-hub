import { createPostgresDatabase } from '@open-channel-hub/storage-postgres';

import { EnvironmentConfigurationError, parseEnvironment } from '../config/environment.js';

const environment = parseEnvironment(process.env);

if (environment.postgres === undefined) {
  throw new EnvironmentConfigurationError();
}

const postgres = await createPostgresDatabase(environment.postgres);

try {
  await postgres.migrate();
} finally {
  await postgres.close();
}
