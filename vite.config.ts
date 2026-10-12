import { defineConfig } from 'vite';

export default defineConfig({
  server: { proxy: { '/api': 'http://127.0.0.1:8787' } },
  // .claude/worktrees の下にある別の作業ツリーのテストは拾わない
  test: { setupFiles: ['./vitest.setup.ts'], exclude: ['**/node_modules/**', '**/.git/**', '**/dist/**', '.claude/**', '.wrangler/**'] },
});
