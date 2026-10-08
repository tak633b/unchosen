// トップ画面の「AIで人生を広げる」設定。キーはこの端末にだけ保存し、画面には出さない。
import { chat, listModels, parseJson } from '../ai/client';
import { aiSettings, PRESETS, saveAiSettings, type AiSettings, type Provider } from '../ai/settings';
import { $, esc } from './dom';

const FEATURE_LABEL: Record<keyof AiSettings['features'], string> = {
  events: 'その年の出来事・予想外の出来事',
  decisions: 'その場かぎりの決断',
  story: '亡くなったあとの、一生の物語',
  others: '同じ1秒に生まれた人たちの近況',
};

export function aiPanel(): string {
  const s = aiSettings();
  return `
  <details class="panel aipanel" ${s.enabled ? 'open' : ''}>
    <summary><b>AIで人生を広げる</b> <small>β・${s.enabled ? `オン(${esc(s.model || 'モデル未設定')})` : 'オフ'}</small></summary>
    <p class="note">統計で決まる骨格(生死・所得・学歴・結婚・出産)はそのままに、毎年の出来事や思いがけない分かれ道をAIが書き足す。OpenRouter か、手元のLLM(LM Studio・Ollama・mlx など OpenAI 互換)を使う。</p>
    <label class="toggle"><input type="checkbox" id="ai-enabled" ${s.enabled ? 'checked' : ''}> AIを使う</label>
    <div class="aigrid">
      <label class="field">接続先
        <select id="ai-provider">${(Object.keys(PRESETS) as Provider[]).map((k) => `<option value="${k}" ${k === s.provider ? 'selected' : ''}>${esc(PRESETS[k].label)}</option>`).join('')}</select></label>
      <label class="field">URL(…/v1 まで)<input id="ai-base" value="${esc(s.baseUrl)}" autocomplete="off"></label>
      <label class="field">モデル<input id="ai-model" list="ai-models" value="${esc(s.model)}" placeholder="例: google/gemini-2.5-flash" autocomplete="off"><datalist id="ai-models"></datalist></label>
      <label class="field">APIキー${s.apiKey ? ' <small>(保存済み。変えるときだけ入力)</small>' : ' <small>(ローカルLLMなら空でよい)</small>'}
        <input id="ai-key" type="password" placeholder="" autocomplete="off"></label>
    </div>
    <fieldset><legend>つなぎ方</legend>
      <label><input type="radio" name="ai-route" value="server" ${s.route === 'server' ? 'checked' : ''}> このゲームのサーバが中継する(URLはサーバから見た住所。127.0.0.1 はサーバの機械)</label>
      <label><input type="radio" name="ai-route" value="browser" ${s.route === 'browser' ? 'checked' : ''}> ブラウザから直接つなぐ(127.0.0.1 はこの端末。LLM側でCORSの許可が要る)</label>
    </fieldset>
    <fieldset><legend>AIに任せること</legend>
      ${(Object.keys(FEATURE_LABEL) as (keyof AiSettings['features'])[]).map((k) => `<label><input type="checkbox" data-feature="${k}" ${s.features[k] ? 'checked' : ''}> ${FEATURE_LABEL[k]}</label>`).join('')}
    </fieldset>
    <div class="choices"><button data-ai="models">モデル一覧を取得</button><button data-ai="test">接続テスト</button><button data-ai="save" class="primary">保存</button><span id="ai-result" class="note"></span></div>
    <p class="note">APIキーはこの端末のブラウザにだけ保存される。サーバ中継のときも、キーはその場で LLM に渡すだけで記録しない。</p>
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
    out.textContent = s.enabled ? '保存した。次の人生から使われる。' : '保存した(AIはオフ)。';
    return true;
  }
  if (act === 'models') {
    out.textContent = 'モデル一覧を取りに行っている…';
    try {
      const ids = await listModels(s);
      $('#ai-models').innerHTML = ids.map((id) => `<option value="${esc(id)}">`).join('');
      out.textContent = ids.length ? `${ids.length}個のモデルが見つかった。モデル欄で選べる。` : 'つながったが、モデルが1つもなかった。';
    } catch (e) {
      out.textContent = `失敗: ${e instanceof Error ? e.message : String(e)}`;
    }
    return true;
  }
  out.textContent = '問い合わせ中…';
  const t0 = performance.now();
  try {
    const text = await chat([
      { role: 'system', content: '出力は JSON だけ。' },
      { role: 'user', content: '日本語で、ある村の朝の様子を一文で。{"text": "…"} の形で。' },
    ], { maxTokens: 200, settings: s });
    const j = parseJson(text) as { text?: string };
    out.textContent = `つながった(${((performance.now() - t0) / 1000).toFixed(1)}秒): 「${String(j.text ?? '').slice(0, 60)}」`;
  } catch (e) {
    out.textContent = `失敗: ${e instanceof Error ? e.message : String(e)}`;
  }
  return true;
}
