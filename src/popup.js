const autoTranslate = document.getElementById("autoTranslate");
const status = document.getElementById("status");

chrome.storage.local.get({ autoTranslate: true }).then((settings) => {
  autoTranslate.checked = Boolean(settings.autoTranslate);
});

autoTranslate.addEventListener("change", async () => {
  await chrome.storage.local.set({ autoTranslate: autoTranslate.checked });
  showStatus(autoTranslate.checked ? "自动翻译已开启" : "自动翻译已暂停", "success");
});

document.getElementById("settings").addEventListener("click", () => chrome.runtime.openOptionsPage());
document.getElementById("open").addEventListener("click", () => sendToPage("POLYCHAT_OPEN_ASSISTANT", "回复助手已打开"));
document.getElementById("rescan").addEventListener("click", () => sendToPage("POLYCHAT_RESCAN", "已重新扫描页面"));

async function sendToPage(type, successMessage) {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) throw new Error();
    const response = await chrome.tabs.sendMessage(tab.id, { type });
    if (!response?.ok) throw new Error();
    showStatus(successMessage, "success");
  } catch {
    showStatus("请先打开或刷新 Facebook / Messenger 页面", "error");
  }
}

function showStatus(message, kind) {
  status.textContent = message;
  status.className = kind || "";
}
