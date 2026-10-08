// トップ画面の「AIで人生を広げる」設定。キーはこの端末にだけ保存し、画面には出さない。
import { chat, listModels, parseJson } from '../ai/client';
import { aiSettings, PRESETS, saveAiSettings, type AiSettings, type Provider } from '../ai/settings';
import { $, esc } from './dom';
import { isEn, L } from '../i18n';

const FEATURE_LABEL: Record<keyof AiSettings['features'], string> = {
  events: L('その年の出来事・予想外の出来事', 'Events of each year, and surprises'),
  decisions: L('その場かぎりの決断', 'One-off decisions'),
  story: L('亡くなったあとの、一生の物語', 'A story of the whole life, after death'),
  others: L('同じ1秒に生まれた人たちの近況', 'News of others born in the same second'),
};

export function aiPanel(): string {
  const s = aiSettings();
  return `
  <details class="panel aipanel" ${s.enabled ? 'open' : ''}>
    <summary><b>${L('AIで人生を広げる', 'Expand lives with AI')}</b> <small>${L('β・', 'Beta, ')}${s.enabled ? L(`オン(${esc(s.model || 'モデル未設定')})`, `on (${esc(s.model || 'no model set')})`) : L('オフ', 'off')}</small></summary>
    <p class="note">${L('統計で決まる骨格(生死・所得・学歴・結婚・出産)はそのままに、毎年の出来事や思いがけない分かれ道をAIが書き足す。OpenRouter か、手元のLLM(LM Studio・Ollama・mlx など OpenAI 互換)を使う。', 'The skeleton set by statistics (life and death, income, schooling, marriage, children) stays as is. AI adds each year’s events and unexpected turns. Uses OpenRouter or a local LLM (LM Studio, Ollama, mlx or any OpenAI-compatible server).')}</p>
    <label class="toggle"><input type="checkbox" id="ai-enabled" ${s.enabled ? 'checked' : ''}> ${L('AIを使う', 'Use AI')}</label>
    <div class="aigrid">
      <label class="field">${L('接続先', 'Provider')}
        <select id="ai-provider">${(Object.keys(PRESETS) as Provider[]).map((k) => `<option value="${k}" ${k === s.provider ? 'selected' : ''}>${esc(PRESETS[k].label)}</option>`).join('')}</select></label>
      <label class="field">${L('URL(…/v1 まで)', 'URL (up to …/v1)')}<input id="ai-base" value="${esc(s.baseUrl)}" autocomplete="off"></label>
      <label class="field">${L('モデル', 'Model')}<input id="ai-model" list="ai-models" value="${esc(s.model)}" placeholder="${L('例', 'e.g.')}: google/gemini-2.5-flash" autocomplete="off"><datalist id="ai-models"></datalist></label>
      <label class="field">${L('APIキー', 'API key')}${s.apiKey ? ` <small>${L('(保存済み。変えるときだけ入力)', '(saved; enter only to change)')}</small>` : ` <small>${L('(ローカルLLMなら空でよい)', '(leave empty for a local LLM)')}</small>`}
        <input id="ai-key" type="password" placeholder="" autocomplete="off"></label>
    </div>
    <fieldset><legend>${L('つなぎ方', 'Connection')}</legend>
      <label><input type="radio" name="ai-route" value="server" ${s.route === 'server' ? 'checked' : ''}> ${L('このゲームのサーバが中継する(URLはサーバから見た住所。127.0.0.1 はサーバの機械)', 'Relay through this game’s server (the URL is as seen from the server; 127.0.0.1 is the server machine)')}</label>
      <label><input type="radio" name="ai-route" value="browser" ${s.route === 'browser' ? 'checked' : ''}> ${L('ブラウザから直接つなぐ(127.0.0.1 はこの端末。LLM側でCORSの許可が要る)', 'Connect directly from the browser (127.0.0.1 is this device; the LLM must allow CORS)')}</label>
    </fieldset>
    <fieldset><legend>${L('AIに任せること', 'What AI writes')}</legend>
      ${(Object.keys(FEATURE_LABEL) as (keyof AiSettings['features'])[]).map((k) => `<label><input type="checkbox" data-feature="${k}" ${s.features[k] ? 'checked' : ''}> ${FEATURE_LABEL[k]}</label>`).join('')}
    </fieldset>
    <div class="choices"><button data-ai="models">${L('モデル一覧を取得', 'List models')}</button><button data-ai="test">${L('接続テスト', 'Test')}</button><button data-ai="save" class="primary">${L('保存', 'Save')}</button><span id="ai-result" class="note"></span></div>
    <p class="note">${L('APIキーはこの端末のブラウザにだけ保存される。サーバ中継のときも、キーはその場で LLM に渡すだけで記録しない。', 'The API key is stored only in this browser. When relayed, the server passes it to the LLM and does not record it.')}</p>
  </details>`;
}

function readForm(): AiSettings {
  const prev = aiSettings();
  const features = { ...prev.features };
  document.querySelectorAll<HTMLInputElement>('[data-feature]').forEach((el) => { features[el.dataset.feature as keyof AiSettings['features']] = el.checked; });
  const key = $<HTMLInputElement>('#ai-key').value.trim();
  return {
    enabled: $<HTMLInputElement>('#ai-enabled').checked,
    provider: $<HTMLSelectElement>('#ai-provider').value as Provider,
    baseUrl: $<HTMLInputElement>('#ai-base').value.trim(),
    model: $<HTMLInputElement>('#ai-model').value.trim(),
    apiKey: key || prev.apiKey,
    route: (document.querySelector<HTMLInputElement>('input[name=ai-route]:checked')?.value ?? 'server') as AiSettings['route'],
    features,
  };
}

export function bindAiPanel(): void {
  const provider = $<HTMLSelectElement>('#ai-provider');
  provider.onchange = () => {
    const p = PRESETS[provider.value as Provider];
    $<HTMLInputElement>('#ai-base').value = p.baseUrl;
    $<HTMLInputElement>('#ai-model').value = p.model;
  };
}

// トップ画面のクリック処理から呼ぶ。AI の操作なら true
export async function handleAiClick(t: HTMLElement): Promise<boolean> {
  const act = t.closest<HTMLElement>('[data-ai]')?.dataset.ai;
  if (!act) return false;
  const out = $('#ai-result');
  const s = readForm();
  if (act === 'save') {
    saveAiSettings(s);
    $<HTMLInputElement>('#ai-key').value = '';
    out.textContent = s.enabled ? L('保存した。次の人生から使われる。', 'Saved. Used from the next life.') : L('保存した(AIはオフ)。', 'Saved (AI is off).');
    return true;
  }
  if (act === 'models') {
    out.textContent = L('モデル一覧を取りに行っている…', 'Fetching models…');
    try {
      const ids = await listModels(s);
      $('#ai-models').innerHTML = ids.map((id) => `<option value="${esc(id)}">`).join('');
      out.textContent = ids.length ? L(`${ids.length}個のモデルが見つかった。モデル欄で選べる。`, `Found ${ids.length} models. Pick one in the Model field.`) : L('つながったが、モデルが1つもなかった。', 'Connected, but there were no models.');
    } catch (e) {
      out.textContent = `${L('失敗', 'Failed')}: ${e instanceof Error ? e.message : String(e)}`;
    }
    return true;
  }
  out.textContent = L('問い合わせ中…', 'Asking…');
  const t0 = performance.now();
  try {
    const text = await chat([
      { role: 'system', content: L('出力は JSON だけ。', 'Output JSON only.') },
      { role: 'user', content: L('日本語で、ある村の朝の様子を一文で。{"text": "…"} の形で。', 'In English, describe a morning in a village in one sentence. Use the form {"text": "…"}.') },
    ], { maxTokens: 200, settings: s });
    const j = parseJson(text) as { text?: string };
    const sec = ((performance.now() - t0) / 1000).toFixed(1);
    const said = String(j.text ?? '').slice(0, isEn ? 120 : 60);
    out.textContent = L(`つながった(${sec}秒): 「${said}」`, `Connected (${sec}s): "${said}"`);
  } catch (e) {
    out.textContent = `${L('失敗', 'Failed')}: ${e instanceof Error ? e.message : String(e)}`;
  }
  return true;
}
