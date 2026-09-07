(() => {
  if (window.top !== window || document.getElementById("polychat-extension-root")) {
    return;
  }

  const LANGUAGES = [
    ["th", "泰语 · ไทย"],
    ["vi", "越南语 · Tiếng Việt"],
    ["id", "印尼语 · Bahasa Indonesia"],
    ["ms", "马来语 · Bahasa Melayu"],
    ["fil", "菲律宾语 · Filipino"],
    ["km", "高棉语 · ភាសាខ្មែរ"],
    ["my", "缅甸语 · မြန်မာစာ"],
    ["lo", "老挝语 · ລາວ"],
    ["ja", "日语 · 日本語"],
    ["ko", "韩语 · 한국어"],
    ["en", "英语 · English"]
  ];

  const DEFAULTS = {
    autoTranslate: true,
    translateLatin: false,
    readTarget: "zh-CN",
    replyTarget: "th",
    tone: "natural",
    panelOpen: true
  };

  const state = {
    settings: { ...DEFAULTS },
    queue: [],
    queued: new WeakSet(),
    processed: new WeakMap(),
    active: 0,
    blockedByConfig: false,
    lastComposer: null,
    scanTimer: null
  };

  const root = document.createElement("div");
  root.id = "polychat-extension-root";
  document.documentElement.appendChild(root);
  const shadow = root.attachShadow({ mode: "open" });
  shadow.innerHTML = renderUI();

  const ui = {
    panel: shadow.getElementById("panel"),
    launcher: shadow.getElementById("launcher"),
    close: shadow.getElementById("close"),
    settings: shadow.getElementById("settings"),
    autoTranslate: shadow.getElementById("autoTranslate"),
    target: shadow.getElementById("target"),
    tone: shadow.getElementById("tone"),
    input: shadow.getElementById("input"),
    output: shadow.getElementById("output"),
    generate: shadow.getElementById("generate"),
    clear: shadow.getElementById("clear"),
    copy: shadow.getElementById("copy"),
    insert: shadow.getElementById("insert"),
    status: shadow.getElementById("status")
  };

  init();

  async function init() {
    state.settings = await chrome.storage.local.get(DEFAULTS);
    syncUI();
    wireUI();
    watchComposers();
    watchPage();
    if (state.settings.autoTranslate) {
      scheduleScan(document);
    }
  }

  function wireUI() {
    ui.launcher.addEventListener("click", () => setPanelOpen(true));
    ui.close.addEventListener("click", () => setPanelOpen(false));
    ui.settings.addEventListener("click", () => chrome.runtime.openOptionsPage());

    ui.autoTranslate.addEventListener("change", async () => {
      state.settings.autoTranslate = ui.autoTranslate.checked;
      state.blockedByConfig = false;
      await chrome.storage.local.set({ autoTranslate: ui.autoTranslate.checked });
      setStatus(ui.autoTranslate.checked ? "自动翻译已开启" : "自动翻译已暂停", "neutral");
      if (ui.autoTranslate.checked) {
        scheduleScan(document);
      }
    });

    ui.target.addEventListener("change", async () => {
      state.settings.replyTarget = ui.target.value;
      await chrome.storage.local.set({ replyTarget: ui.target.value });
    });

    ui.tone.addEventListener("change", async () => {
      state.settings.tone = ui.tone.value;
      await chrome.storage.local.set({ tone: ui.tone.value });
    });

    ui.generate.addEventListener("click", generateReply);
    ui.clear.addEventListener("click", () => {
      ui.input.value = "";
      ui.output.value = "";
      setStatus("已清空", "neutral");
      ui.input.focus();
    });
    ui.copy.addEventListener("click", copyReply);
    ui.insert.addEventListener("click", insertReply);
  }

  function syncUI() {
    ui.autoTranslate.checked = Boolean(state.settings.autoTranslate);
    ui.target.value = state.settings.replyTarget || "th";
    ui.tone.value = state.settings.tone || "natural";
    ui.panel.hidden = !state.settings.panelOpen;
    ui.launcher.hidden = Boolean(state.settings.panelOpen);
  }

  async function setPanelOpen(open) {
    state.settings.panelOpen = open;
    ui.panel.hidden = !open;
    ui.launcher.hidden = open;
    await chrome.storage.local.set({ panelOpen: open });
    if (open) {
      ui.input.focus();
    }
  }

  async function generateReply() {
    const text = ui.input.value.trim();
    if (!text) {
      setStatus("请先输入中文草稿", "error");
      ui.input.focus();
      return;
    }

    setBusy(true);
    setStatus("正在润色并翻译…", "loading");
    try {
      const response = await chrome.runtime.sendMessage({
        type: "POLYCHAT_TRANSLATE",
        payload: {
          mode: "reply",
          source: "zh-CN",
          target: ui.target.value,
          tone: ui.tone.value,
          text
        }
      });
      if (!response?.ok) {
        throw new Error(response?.error || "翻译失败");
      }
      ui.output.value = response.result;
      setStatus("翻译完成，发送前请检查语气", "success");
    } catch (error) {
      setStatus(error.message || String(error), "error");
    } finally {
      setBusy(false);
    }
  }

  async function copyReply() {
    const text = ui.output.value.trim();
    if (!text) {
      setStatus("还没有可复制的译文", "error");
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const helper = document.createElement("textarea");
      helper.value = text;
      helper.style.position = "fixed";
      helper.style.opacity = "0";
      document.body.appendChild(helper);
      helper.select();
      document.execCommand("copy");
      helper.remove();
    }
    setStatus("已复制，不会自动发送", "success");
  }

  function insertReply() {
    const text = ui.output.value.trim();
    if (!text) {
      setStatus("还没有可填入的译文", "error");
      return;
    }

    const composer = state.lastComposer;
    if (!composer?.isConnected) {
      setStatus("请先点击一次聊天输入框，再点“填入聊天框”", "error");
      return;
    }

    composer.focus();
    if (composer instanceof HTMLInputElement || composer instanceof HTMLTextAreaElement) {
      const prototype = composer instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
      setter?.call(composer, text);
      composer.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: text }));
    } else {
      const selection = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(composer);
      selection.removeAllRanges();
      selection.addRange(range);
      document.execCommand("insertText", false, text);
      composer.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: text }));
    }
    setStatus("已填入聊天框，请检查后手动发送", "success");
  }

  function watchComposers() {
    document.addEventListener("focusin", (event) => {
      const element = event.target;
      if (!(element instanceof HTMLElement) || element === root) {
        return;
      }
      if (
        element.isContentEditable ||
        element instanceof HTMLTextAreaElement ||
        (element instanceof HTMLInputElement && ["text", "search"].includes(element.type))
      ) {
        state.lastComposer = element;
      }
    }, true);
  }

  function watchPage() {
    const observer = new MutationObserver((mutations) => {
      if (!state.settings.autoTranslate || state.blockedByConfig) {
        return;
      }
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node instanceof Element && node !== root && !root.contains(node)) {
            scheduleScan(node);
          }
        }
      }
    });
    observer.observe(document.body || document.documentElement, { childList: true, subtree: true });

    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "local") {
        return;
      }
      for (const [key, change] of Object.entries(changes)) {
        state.settings[key] = change.newValue;
      }
      state.blockedByConfig = false;
      syncUI();
      if (state.settings.autoTranslate) {
        scheduleScan(document);
      }
    });

    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (message?.type === "POLYCHAT_OPEN_ASSISTANT") {
        setPanelOpen(true);
        sendResponse({ ok: true });
      } else if (message?.type === "POLYCHAT_RESCAN") {
        state.blockedByConfig = false;
        scheduleScan(document);
        sendResponse({ ok: true });
      }
    });
  }

  function scheduleScan(scope) {
    clearTimeout(state.scanTimer);
    state.scanTimer = setTimeout(() => scan(scope), 350);
  }

  function scan(scope) {
    if (!state.settings.autoTranslate || state.blockedByConfig) {
      return;
    }
    const candidates = [];
    if (scope instanceof Element && scope.matches("[dir='auto'], [lang]")) {
      candidates.push(scope);
    }
    if (scope.querySelectorAll) {
      candidates.push(...scope.querySelectorAll("[dir='auto'], [lang]"));
    }
    for (const element of candidates) {
      if (isCandidate(element)) {
        enqueue(element);
      }
    }
    drainQueue();
  }

  function isCandidate(element) {
    if (!(element instanceof HTMLElement) || root.contains(element)) {
      return false;
    }
    if (element.closest("input, textarea, select, [contenteditable='true'], button, [role='button'], nav, header, [role='navigation']")) {
      return false;
    }
    if (!element.closest("[role='article'], [role='dialog'], [role='main'], [data-pagelet*='FeedUnit']")) {
      return false;
    }
    if ([...element.children].some((child) => child.innerText?.trim())) {
      return false;
    }

    const text = normalizedText(element.innerText || element.textContent || "");
    if (text.length < 2 || text.length > 1200 || /^(https?:\/\/|www\.)/i.test(text)) {
      return false;
    }
    if (!/[\p{L}\p{N}]/u.test(text)) {
      return false;
    }

    const detected = detectScript(text);
    if (!detected || detected === "zh-CN") {
      return false;
    }
    if (detected === "latin" && !state.settings.translateLatin) {
      return false;
    }

    const signature = `${state.settings.readTarget}|${text}`;
    return state.processed.get(element) !== signature && !state.queued.has(element);
  }

  function enqueue(element) {
    const text = normalizedText(element.innerText || element.textContent || "");
    state.queued.add(element);
    state.queue.push({ element, text, signature: `${state.settings.readTarget}|${text}` });
  }

  function drainQueue() {
    while (state.active < 2 && state.queue.length) {
      const job = state.queue.shift();
      state.active += 1;
      translateElement(job)
        .catch(() => {})
        .finally(() => {
          state.active -= 1;
          state.queued.delete(job.element);
          setTimeout(drainQueue, 120);
        });
    }
  }

  async function translateElement(job) {
    if (!job.element.isConnected || normalizedText(job.element.innerText || job.element.textContent || "") !== job.text) {
      return;
    }
    state.processed.set(job.element, job.signature);

    const response = await chrome.runtime.sendMessage({
      type: "POLYCHAT_TRANSLATE",
      payload: {
        mode: "read",
        source: "auto",
        target: state.settings.readTarget,
        text: job.text
      }
    });

    if (!response?.ok) {
      if (/尚未配置|API 地址|模型名称/.test(response?.error || "")) {
        state.blockedByConfig = true;
        setStatus("请先在设置中配置 API", "error");
      }
      return;
    }
    if (!job.element.isConnected || normalizedText(job.element.innerText || job.element.textContent || "") !== job.text) {
      return;
    }

    let translation = job.element.nextElementSibling;
    if (!translation?.classList.contains("polychat-inline-translation")) {
      translation = document.createElement("div");
      translation.className = "polychat-inline-translation";
      translation.setAttribute("data-polychat-translation", "true");
      translation.style.cssText = [
        "margin-top:4px",
        "padding-left:8px",
        "border-left:2px solid #ec4899",
        "color:#8b3a62",
        "font-size:0.92em",
        "line-height:1.45",
        "white-space:pre-wrap"
      ].join(";");
      job.element.insertAdjacentElement("afterend", translation);
    }
    translation.textContent = response.result;
  }

  function detectScript(text) {
    if (/[\u0E00-\u0E7F]/u.test(text)) return "th";
    if (/[\u0E80-\u0EFF]/u.test(text)) return "lo";
    if (/[\u1780-\u17FF]/u.test(text)) return "km";
    if (/[\u1000-\u109F\uAA60-\uAA7F]/u.test(text)) return "my";
    if (/[\u3040-\u30FF]/u.test(text)) return "ja";
    if (/[\u1100-\u11FF\uAC00-\uD7AF]/u.test(text)) return "ko";
    if (/[ăâđêôơưĂÂĐÊÔƠƯáàảãạấầẩẫậắằẳẵặéèẻẽẹếềểễệíìỉĩịóòỏõọốồổỗộớờởỡợúùủũụứừửữựýỳỷỹỵ]/iu.test(text)) return "vi";
    if (/\p{Script=Han}/u.test(text)) return "zh-CN";
    if (/\p{Script=Latin}/u.test(text)) return "latin";
    return "";
  }

  function normalizedText(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function setBusy(busy) {
    ui.generate.disabled = busy;
    ui.generate.textContent = busy ? "处理中…" : "润色并翻译";
  }

  function setStatus(message, kind) {
    ui.status.textContent = message;
    ui.status.dataset.kind = kind;
  }

  function renderUI() {
    const languageOptions = LANGUAGES
      .map(([value, label]) => `<option value="${value}">${label}</option>`)
      .join("");
    return `
      <style>
        :host { all: initial; }
        *, *::before, *::after { box-sizing: border-box; }
        button, select, textarea { font: inherit; }
        #launcher {
          position: fixed; right: 20px; bottom: 92px; z-index: 2147483646;
          width: 48px; height: 48px; border: 0; border-radius: 16px;
          color: white; background: linear-gradient(135deg, #ec4899, #8b5cf6);
          box-shadow: 0 12px 30px rgba(76, 29, 149, .28); cursor: pointer;
          font: 700 18px/1 system-ui, sans-serif;
        }
        #panel {
          position: fixed; right: 20px; top: 82px; z-index: 2147483646;
          width: min(370px, calc(100vw - 32px)); max-height: calc(100vh - 104px);
          color: #201824; background: rgba(255,255,255,.98); border: 1px solid #eadde6;
          border-radius: 20px; box-shadow: 0 20px 60px rgba(44, 24, 40, .24);
          overflow: auto; font: 14px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        }
        #panel[hidden], #launcher[hidden] { display: none !important; }
        .header {
          position: sticky; top: 0; display: flex; align-items: center; gap: 10px;
          padding: 14px 16px; background: linear-gradient(135deg, #fff1f7, #f4f0ff);
          border-bottom: 1px solid #eadde6; z-index: 1;
        }
        .logo {
          display: grid; place-items: center; width: 34px; height: 34px; border-radius: 12px;
          color: #fff; background: linear-gradient(135deg, #ec4899, #8b5cf6); font-weight: 800;
        }
        .title { flex: 1; }
        .title strong { display: block; font-size: 15px; }
        .title span { color: #7b6c77; font-size: 12px; }
        .icon-btn { border: 0; background: transparent; color: #685a65; cursor: pointer; padding: 6px; border-radius: 8px; }
        .icon-btn:hover { background: rgba(139,92,246,.1); }
        .body { padding: 15px; }
        .row { display: flex; gap: 10px; margin-bottom: 12px; }
        .field { flex: 1; min-width: 0; }
        label { display: block; margin-bottom: 5px; color: #6f606a; font-size: 12px; font-weight: 650; }
        select, textarea {
          width: 100%; border: 1px solid #ded2da; border-radius: 12px; color: #251d23;
          background: #fff; outline: none; transition: border-color .15s, box-shadow .15s;
        }
        select { height: 40px; padding: 0 10px; }
        textarea { min-height: 98px; padding: 11px 12px; resize: vertical; line-height: 1.55; }
        textarea:focus, select:focus { border-color: #d94689; box-shadow: 0 0 0 3px rgba(236,72,153,.12); }
        #output { min-height: 112px; background: #fff9fc; }
        .switch-line { display: flex; align-items: center; justify-content: space-between; margin-bottom: 13px; }
        .switch-line span { font-weight: 650; }
        .switch-line input { width: 18px; height: 18px; accent-color: #db3e86; }
        .actions { display: flex; gap: 8px; margin: 9px 0 14px; }
        .button {
          flex: 1; min-height: 40px; border: 1px solid #d9ccd5; border-radius: 12px;
          background: #fff; color: #4a3c46; font-weight: 700; cursor: pointer;
        }
        .button.primary { border: 0; color: #fff; background: linear-gradient(135deg, #e93f88, #9b56df); }
        .button:disabled { opacity: .6; cursor: wait; }
        #status { min-height: 21px; padding-top: 2px; color: #766771; font-size: 12px; }
        #status[data-kind="error"] { color: #c12e4b; }
        #status[data-kind="success"] { color: #16805b; }
        #status[data-kind="loading"] { color: #8a4fbd; }
        .footnote { margin: 8px 0 0; color: #887a84; font-size: 11px; }
        @media (max-width: 600px) {
          #panel { right: 8px; top: 66px; width: calc(100vw - 16px); max-height: calc(100vh - 74px); }
          #launcher { right: 12px; bottom: 76px; }
        }
      </style>
      <button id="launcher" title="打开 PolyChat">译</button>
      <section id="panel" aria-label="PolyChat 多语言翻译助手">
        <header class="header">
          <div class="logo">译</div>
          <div class="title"><strong>PolyChat</strong><span>中文草稿 → 自然外语</span></div>
          <button class="icon-btn" id="settings" title="API 设置">⚙</button>
          <button class="icon-btn" id="close" title="收起">✕</button>
        </header>
        <div class="body">
          <div class="switch-line">
            <span>页面自动双语翻译</span>
            <input id="autoTranslate" type="checkbox" />
          </div>
          <div class="row">
            <div class="field">
              <label for="target">回复语言</label>
              <select id="target">${languageOptions}</select>
            </div>
            <div class="field">
              <label for="tone">语气</label>
              <select id="tone">
                <option value="natural">自然口语</option>
                <option value="friendly">亲切友好</option>
                <option value="polite">礼貌尊重</option>
                <option value="professional">专业简洁</option>
              </select>
            </div>
          </div>
          <label for="input">中文草稿</label>
          <textarea id="input" placeholder="在这里输入中文，不会自动发送…"></textarea>
          <div class="actions">
            <button class="button" id="clear">清空</button>
            <button class="button primary" id="generate">润色并翻译</button>
          </div>
          <label for="output">翻译结果</label>
          <textarea id="output" readonly placeholder="译文会显示在这里"></textarea>
          <div class="actions">
            <button class="button" id="copy">复制译文</button>
            <button class="button primary" id="insert">填入聊天框</button>
          </div>
          <div id="status" data-kind="neutral">准备就绪</div>
          <p class="footnote">“填入聊天框”只写入草稿，不会点击发送。</p>
        </div>
      </section>
    `;
  }
})();
