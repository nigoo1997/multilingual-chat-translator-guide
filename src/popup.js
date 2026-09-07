const autoTranslate = document.getElementById("autoTranslate");
const status = document.getElementById("status");

chrome.storage.local.get({ autoTranslate: true, apiUrl: "", model: "" }).then((settings) => {
  autoTranslate.checked = Boolean(settings.autoTranslate);
  if (!settings.apiUrl || !settings.model) {
    showStatus("尚未配置 API 地址或模型，请先打开 API 设置", "error");
  }
});

autoTranslate.addEventListener("change", async () => {
  await chrome.storage.local.set({ autoTranslate: autoTranslate.checked });
  showStatus(autoTranslate.checked ? "自动翻译已开启" : "自动翻译已暂停", "success");
});

document.getElementById("settings").addEventListener("click", () => chrome.runtime.openOptionsPage());
document.getElementById("open").addEventListener("click", () => sendToPage("POLYCHAT_OPEN_ASSISTANT", "回复助手已打开"));
document.getElementById("rescan").addEventListener("click", () => sendToPage("POLYCHAT_RESCAN", "已优先扫描当前可见消息"));

async function sendToPage(type, successMessage) {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id || !isSupportedPage(tab.url)) throw new Error();

    let response;
    try {
      response = await chrome.tabs.sendMessage(tab.id, { type });
    } catch {
      // Edge occasionally skips declarative content-script injection on an
      // already-open Facebook tab. Inject once on demand, then retry.
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ["src/content.js"]
      });
      response = await chrome.tabs.sendMessage(tab.id, { type });
    }

    if (!response?.ok) throw new Error();
    showStatus(successMessage, "success");
  } catch {
    showStatus("请先打开或刷新 Facebook / Messenger 页面", "error");
  }
}

function isSupportedPage(value = "") {
  try {
    const hostname = new URL(value).hostname;
    return hostname === "facebook.com" || hostname.endsWith(".facebook.com") ||
      hostname === "messenger.com" || hostname.endsWith(".messenger.com");
  } catch {
    return false;
  }
}

function showStatus(message, kind) {
  status.textContent = message;
  status.className = kind || "";
}
