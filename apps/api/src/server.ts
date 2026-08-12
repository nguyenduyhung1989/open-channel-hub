import { buildApp } from './app.js';
import { parseEnvironment } from './config/environment.js';

const environment = parseEnvironment(process.env);
const app = await buildApp();

const close = async (): Promise<void> => {
  await app.close();
};

process.once('SIGINT', () => {
  void close();
});
process.once('SIGTERM', () => {
  void close();
});

await app.listen({ host: environment.HOST, port: environment.PORT });
