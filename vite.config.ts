import { defineConfig } from 'vite';

export default defineConfig({
  // /s/<id> は共有した人生のページ (サーバが作る)。'/s' だけだと /src にも当たるので形で絞る
  server: { proxy: { '/api': 'http://127.0.0.1:8787', '^/s/[A-Za-z0-9]{8}(\\.png)?$': 'http://127.0.0.1:8787' } },
  // .claude/worktrees の下にある別の作業ツリーのテストは拾わない
  test: { setupFiles: ['./vitest.setup.ts'], exclude: ['**/node_modules/**', '**/.git/**', '**/dist/**', '.claude/**', '.wrangler/**'] },
});
