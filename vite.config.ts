import { defineConfig } from 'vite';

export default defineConfig({
  // /s/<id> は共有した人生のページ (サーバが作る)。'/s' だけだと /src にも当たるので形で絞る
  server: { proxy: { '/api': 'http://127.0.0.1:8787', '^/s/[A-Za-z0-9]{8}(\\.png)?$': 'http://127.0.0.1:8787' } },
  // .claude/worktrees の下にある別の作業ツリーのテストは拾わない
  // 何百本もの人生を生きるテストが多く、GitHub Actions では手元より数倍かかる。既定の5秒では足りない
  test: { testTimeout: 60_000, setupFiles: ['./vitest.setup.ts'], exclude: ['**/node_modules/**', '**/.git/**', '**/dist/**', '.claude/**', '.wrangler/**'] },
});
