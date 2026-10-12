# Cloudflare に出す手順

Unchosen を https://unchosen.pages.dev (Cloudflare Pages) に出し、追悼館を D1 で動かす手順です。コマンドはリポジトリの直下で実行します。

| 部分 | 置き場所 |
|---|---|
| ゲーム本体 (静的) | `npm run build` が作る `dist/` |
| API (追悼館・AI の中継) | `functions/api/[[path]].js` → `server/cf-api.mjs`。道と返す形は `server/server.mjs` (Node 版) と同じ |
| 追悼館のデータ | D1 `unchosen-memorial`。表は `migrations/` |
| 出す仕組み | `.github/workflows/cloudflare.yml` (テスト → ビルド → D1 マイグレーション → Pages) |

公開版の AI 中継は OpenRouter と OpenAI (https) だけです。手元・LAN の LLM はブラウザから直接つないでもらいます。送信量の制限は D1 の表 `rate` で数え、IP は `ADMIN_TOKEN` を鍵にした HMAC にしてから使います (IP そのものは残しません)。

## 手元で確かめる

```sh
npm ci
npm test
npm run cf:migrate:local
npm run build
npx wrangler pages dev --port 8788 --binding ADMIN_TOKEN=local-admin-token-0123456789
curl http://127.0.0.1:8788/api/health
```

`npm run cf:dev` はビルド・マイグレーション・起動をまとめて行います。手元の D1 は `.wrangler/` にあり、消してよいものです。

## 1. D1 と Pages を作る (済み)

```sh
npx wrangler login
npx wrangler d1 create unchosen-memorial            # 出た database_id を wrangler.toml へ
npx wrangler pages project create unchosen --production-branch main
```

`wrangler.toml` には作成済みの id (`5312d83c-c94a-404b-8116-c62841582e25`) が入っています。作り直したときだけ書き換えます。

## 2. 管理者の合言葉

```sh
openssl rand -base64 32
npx wrangler pages secret put ADMIN_TOKEN --project-name unchosen
```

16文字未満、または未設定だと管理の道は 404 になります。使い方:

```sh
SITE=https://unchosen.pages.dev
curl -H "Authorization: Bearer $TOKEN" $SITE/api/admin/memorial                     # 新しい順に100件 (非表示も)
curl -X POST -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d '{"hidden":true}' $SITE/api/admin/memorial/123/hide
```

## 3. GitHub の秘密

リポジトリの **Settings → Secrets and variables → Actions → Secrets**:

- `CLOUDFLARE_API_TOKEN`: Custom token。権限は **Account / Cloudflare Pages / Edit** と **Account / D1 / Edit**
- `CLOUDFLARE_ACCOUNT_ID`: `npx wrangler whoami` が出す Account ID

秘密が無いあいだ、Actions はテストとビルドだけをして出しません。

## 4. 出す

`main` に push すると、テスト → ビルド → `wrangler d1 migrations apply unchosen-memorial --remote` → `wrangler pages deploy` の順に進みます。出たら `https://unchosen.pages.dev/api/health` が `{"success":true,"data":{"ok":true}}` を返すことを確かめます。

戻すときは、ダッシュボードの **Workers & Pages → unchosen → Deployments** で前の版を **Rollback** します。
