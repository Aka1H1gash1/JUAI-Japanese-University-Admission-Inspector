import { createLocalApp } from '../local-server/server.mjs';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';

const workspace = process.env.DESIGN_REVIEW_WORKSPACE;
if (!workspace?.startsWith('/private/tmp/japangrad-design-'))
  throw new Error('请指定独立的设计测试工作区。');
const server = await createLocalApp({
  workspace,
  staticDir: path.resolve('apps/web-antd/dist'),
});
server.listen(0, '127.0.0.1', async () => {
  const base = `http://127.0.0.1:${server.address().port}`;
  await writeFile(
    '/private/tmp/japangrad-design-server.json',
    JSON.stringify({ base, workspace, pid: process.pid }),
  );
  console.log(`Design review: ${base}`);
});
for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, () => server.close());
