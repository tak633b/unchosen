// AI の接続設定。この端末の localStorage にだけ保存する。
import { load, save } from '../ui/dom';

export type Provider = 'openrouter' | 'openai';
export type Route = 'server' | 'browser';

export interface AiSettings {
  enabled: boolean;
  provider: Provider;
  baseUrl: string;  // OpenAI 互換の /v1 まで
  apiKey: string;
  model: string;
  route: Route;     // server = このゲームのサーバが中継 / browser = ブラウザから直接
  features: { events: boolean; decisions: boolean; story: boolean; others: boolean };
}

export const PRESETS: Record<Provider, { baseUrl: string; model: string; label: string }> = {
  openrouter: { baseUrl: 'https://openrouter.ai/api/v1', model: 'google/gemini-2.5-flash', label: 'OpenRouter' },
  openai: { baseUrl: 'http://127.0.0.1:1234/v1', model: '', label: 'ローカルLLM / OpenAI 互換 (LM Studio・Ollama・mlx など)' },
};

const DEFAULTS: AiSettings = {
  enabled: false, provider: 'openrouter', baseUrl: PRESETS.openrouter.baseUrl, apiKey: '', model: PRESETS.openrouter.model,
  route: 'server', features: { events: true, decisions: true, story: true, others: true },
};

const KEY = 'ai';
export const aiSettings = (): AiSettings => {
  const s = load<Partial<AiSettings>>(KEY, {});
  return { ...DEFAULTS, ...s, features: { ...DEFAULTS.features, ...(s.features ?? {}) } };
};
export const saveAiSettings = (s: AiSettings) => save(KEY, s);
export const aiOn = (f?: keyof AiSettings['features']) => {
  const s = aiSettings();
  return s.enabled && !!s.model && (!f || s.features[f]);
};
