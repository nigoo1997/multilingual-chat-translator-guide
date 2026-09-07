import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = await readFile(path.join(root, "src/background.js"), "utf8");
const listeners = [];
const context = vm.createContext({
  AbortController,
  URL,
  Map,
  JSON,
  Number,
  String,
  Array,
  Object,
  RegExp,
  Error,
  setTimeout,
  clearTimeout,
  chrome: {
    storage: {
      onChanged: { addListener() {} },
      local: { get: async () => ({}) }
    },
    runtime: {
      onMessage: { addListener(listener) { listeners.push(listener); } }
    }
  }
});

vm.runInContext(source, context, { filename: "background.js" });

assert.equal(listeners.length, 1, "应注册一个后台消息监听器");
assert.equal(
  context.normalizeEndpoint("https://api.example.com/v1", "chat-completions"),
  "https://api.example.com/v1/chat/completions"
);
assert.equal(
  context.normalizeEndpoint("https://api.example.com/v1/", "responses"),
  "https://api.example.com/v1/responses"
);
assert.equal(
  context.normalizeEndpoint("https://api.example.com/custom/chat/completions", "chat-completions"),
  "https://api.example.com/custom/chat/completions"
);
assert.equal(
  context.extractResponseText({ choices: [{ message: { content: "สวัสดีค่ะ" } }] }),
  "สวัสดีค่ะ"
);
assert.equal(
  context.extractResponseText({ output: [{ content: [{ type: "output_text", text: "Hello" }] }] }),
  "Hello"
);
assert.equal(context.cleanModelText("```text\nHello\n```"), "Hello");

const prompt = context.buildPrompt({
  mode: "reply",
  source: "zh-CN",
  target: "th",
  tone: "friendly",
  text: "谢谢你",
  brandVoice: "warm"
});
assert.match(prompt.user, /Thai/);
assert.match(prompt.user, /谢谢你/);
assert.match(prompt.user, /warm/);

console.log("检查通过：API Endpoint、响应解析和翻译提示词。");
