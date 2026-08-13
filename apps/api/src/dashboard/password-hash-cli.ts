import { hashDashboardPassword } from './password-hash.js';

const chunks: Buffer[] = [];

for await (const chunk of process.stdin) {
  chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
}

const password = Buffer.concat(chunks);
const hash = await hashDashboardPassword(password);

process.stdout.write(`${hash}\n`);
