import { z } from 'zod';

const environmentSchema = z.object({
  HOST: z.string().min(1).default('127.0.0.1'),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000)
});

export type AppEnvironment = z.infer<typeof environmentSchema>;

export class EnvironmentConfigurationError extends Error {
  public constructor() {
    super('Invalid application environment. Check the documented environment variables.');
    this.name = 'EnvironmentConfigurationError';
  }
}

export const parseEnvironment = (environment: NodeJS.ProcessEnv): AppEnvironment => {
  const result = environmentSchema.safeParse(environment);

  if (!result.success) {
    throw new EnvironmentConfigurationError();
  }

  return result.data;
};
