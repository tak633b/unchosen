// OpenAI 互換の chat/completions を呼ぶ。サーバ中継か、ブラウザから直接か。
import { aiSettings, type AiSettings } from './settings';

export interface Msg { role: 'system' | 'user' | 'assistant'; content: string }

const TIMEOUT_MS = 60000;

export async function listModels(s: AiSettings): Promise<string[]> {
  if (s.route === 'server') {
    const r = await fetch('/api/ai/models', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ baseUrl: s.baseUrl, apiKey: s.apiKey }) });
    const j = await r.json();
    if (!j.success) throw new Error(j.error ?? `HTTP ${r.status}`);
    return j.data.models as string[];
  }
  const r = await fetch(`${s.baseUrl.replace(/\/$/, '')}/models`, { headers: s.apiKey ? { Authorization: `Bearer ${s.apiKey}` } : {} });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const j = await r.json();
  return (j.data ?? []).map((m: { id: string }) => String(m.id));
}

export async function chat(messages: Msg[], opts: { maxTokens?: number; temperature?: number; settings?: AiSettings } = {}): Promise<string> {
  const s = opts.settings ?? aiSettings();
  const body = { model: s.model, messages, max_tokens: opts.maxTokens ?? 800, temperature: opts.temperature ?? 1 };
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    if (s.route === 'server') {
      const r = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ baseUrl: s.baseUrl, apiKey: s.apiKey, body }),
        signal: ctrl.signal,
      });
      const j = await r.json();
      if (!j.success) throw new Error(j.error ?? `HTTP ${r.status}`);
      return String(j.data.content ?? '');
    }
    const r = await fetch(`${s.baseUrl.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(s.apiKey ? { Authorization: `Bearer ${s.apiKey}` } : {}),
        ...(s.provider === 'openrouter' ? { 'X-Title': 'Unchosen' } : {}),
      },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const j = await r.json();
    return String(j.choices?.[0]?.message?.content ?? '');
  } finally {
    clearTimeout(timer);
  }
}

// 考える型のモデルの <think> を落とし、最初の JSON オブジェクトを取り出す
export function parseJson(text: string): unknown {
  const t = text.replace(/<think>[\s\S]*?<\/think>/g, '').replace(/```(?:json)?/g, '');
  const start = t.indexOf('{');
  if (start < 0) throw new Error('JSON がない');
  let depth = 0, inStr = false, esc = false;
  for (let i = start; i < t.length; i++) {
    const ch = t[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === '\\') esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === '{') depth++;
    else if (ch === '}' && --depth === 0) return JSON.parse(t.slice(start, i + 1));
  }
  throw new Error('JSON が閉じていない');
}
