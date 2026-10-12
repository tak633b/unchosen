// Cloudflare Pages Functions: /s/<id> (共有した人生のページ) と /s/<id>.png (その OGP 画像)。中身は server/cf-api.mjs
import { handle } from '../../server/cf-api.mjs';

export const onRequest = ({ request, env }) => handle(request, env);
