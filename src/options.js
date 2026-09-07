const DEFAULTS = {
  apiUrl: "",
  apiKey: "",
  model: "",
  protocol: "chat-completions",
  authMode: "bearer",
  extraHeaders: "{}",
  temperature: 0.2,
  brandVoice: "",
  autoTranslate: true,
  translateLatin: false,
  readTarget: "zh-CN",
  replyTarget: "th",
  tone: "natural"
};

const fields = {
  apiUrl: document.getElementById("apiUrl"),
  apiKey: document.getElementById("apiKey"),
  model: document.getElementById("model"),
  protocol: document.getElementById("protocol"),
  authMode: document.getElementById("authMode"),
  extraHeaders: document.getElementById("extraHeaders"),
  temperature: document.getElementById("temperature"),
  brandVoice: document.getElementById("brandVoice"),
  autoTranslate: document.getElementById("autoTranslate"),
  translateLatin: document.getElementById("translateLatin"),
  replyTarget: document.getElementById("replyTarget"),
  tone: document.getElementById("tone"),
  keyStatus: document.getElementById("keyStatus"),
  status: document.getElementById("status"),
  save: document.getElementById("save"),
  test: document.getElementById("test"),
  clearKey: document.getElementById("clearKey")
};

let hasStoredKey = false;

loadSettings();

fields.save.addEventListener("click", async () => {
  await runAction(fields.save, async () => {
    await saveSettings();
    showStatus("设置已保存", "success");
  });
});

fields.test.addEventListener("click", async () => {
  await runAction(fields.test, async () => {
    await saveSettings();
    showStatus("正在测试 API…", "");
    const response = await chrome.runtime.sendMessage({ type: "POLYCHAT_TEST_API" });
    if (!response?.ok) {
      throw new Error(response?.error || "API 测试失败");
    }
    showStatus(`连接成功：${response.result}`, "success");
  });
});

fields.clearKey.addEventListener("click", async () => {
  await chrome.storage.local.set({ apiKey: "" });
  fields.apiKey.value = "";
  hasStoredKey = false;
  updateKeyStatus();
  showStatus("已清除 API Key", "success");
});

async function loadSettings() {
  const settings = await chrome.storage.local.get(DEFAULTS);
  for (const key of ["apiUrl", "model", "protocol", "authMode", "extraHeaders", "temperature", "brandVoice", "replyTarget", "tone"]) {
    fields[key].value = settings[key];
  }
  fields.autoTranslate.checked = Boolean(settings.autoTranslate);
  fields.translateLatin.checked = Boolean(settings.translateLatin);
  fields.apiKey.value = "";
  hasStoredKey = Boolean(settings.apiKey);
  updateKeyStatus();
}

async function saveSettings() {
  const apiUrl = fields.apiUrl.value.trim();
  const model = fields.model.value.trim();
  if (!apiUrl) throw new Error("请填写 API 地址。");
  if (!model) throw new Error("请填写模型名称。");

  let url;
  try {
    url = new URL(apiUrl);
  } catch {
    throw new Error("API 地址格式不正确。");
  }
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("API 地址仅支持 http 或 https。");
  }

  try {
    const parsed = JSON.parse(fields.extraHeaders.value.trim() || "{}");
    if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") throw new Error();
  } catch {
    throw new Error("额外请求头必须是有效的 JSON 对象。");
  }

  const originPattern = `${url.protocol}//${url.host}/*`;
  const granted = await chrome.permissions.request({ origins: [originPattern] });
  if (!granted) {
    throw new Error("未授予 API 域名访问权限，扩展无法请求该接口。");
  }

  const settings = {
    apiUrl,
    model,
    protocol: fields.protocol.value,
    authMode: fields.authMode.value,
    extraHeaders: fields.extraHeaders.value.trim() || "{}",
    temperature: Number(fields.temperature.value || 0.2),
    brandVoice: fields.brandVoice.value.trim(),
    autoTranslate: fields.autoTranslate.checked,
    translateLatin: fields.translateLatin.checked,
    readTarget: "zh-CN",
    replyTarget: fields.replyTarget.value,
    tone: fields.tone.value
  };

  if (fields.apiKey.value.trim()) {
    settings.apiKey = fields.apiKey.value.trim();
    hasStoredKey = true;
  }

  await chrome.storage.local.set(settings);
  fields.apiKey.value = "";
  updateKeyStatus();
}

async function runAction(button, action) {
  const original = button.textContent;
  button.disabled = true;
  button.textContent = "处理中…";
  try {
    await action();
  } catch (error) {
    showStatus(error.message || String(error), "error");
  } finally {
    button.disabled = false;
    button.textContent = original;
  }
}

function updateKeyStatus() {
  fields.keyStatus.textContent = hasStoredKey ? "已保存密钥" : "未保存密钥";
  fields.keyStatus.classList.toggle("ready", hasStoredKey);
}

function showStatus(message, kind) {
  fields.status.textContent = message;
  fields.status.className = `status ${kind || ""}`.trim();
}
