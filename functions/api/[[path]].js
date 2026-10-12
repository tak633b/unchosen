// Cloudflare Pages Functions: /api/* をすべて追悼館と AI 中継の API へ。中身は server/cf-api.mjs
import { handle } from '../../server/cf-api.mjs';

export const onRequest = ({ request, env }) => handle(request, env);
