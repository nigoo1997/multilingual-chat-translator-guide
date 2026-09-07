# Google Chrome 安装指南

## 安装开发版

1. 下载或克隆本仓库。
2. 在 Chrome 地址栏输入 `chrome://extensions`。
3. 打开右上角的「开发者模式」。
4. 点击「加载已解压的扩展程序」。
5. 选择包含 `manifest.json` 的仓库根目录。
6. 在扩展列表中确认「PolyChat 多语言聊天翻译助手」已经启用。
7. 点击 Chrome 工具栏的拼图图标，把 PolyChat 固定到工具栏。

更新代码后，在 `chrome://extensions` 中点击扩展卡片上的重新加载按钮。

## 配置 API

1. 点击 PolyChat 图标。
2. 点击「API 设置」。
3. 填写 API 地址、协议、模型和 API Key。
4. 点击「保存并测试」。
5. Chrome 询问 API 域名访问权限时，确认允许该域名。

API Key 不应写入源码或提交到 GitHub。

## 使用

打开 Facebook 或 Messenger 并刷新一次页面：

- 点击工具栏图标可开关页面自动翻译。
- 点击「打开回复助手」可展开网页右侧的小面板。
- 输入中文，选择目标语言和语气，再点击「润色并翻译」。
- 「填入聊天框」不会自动发送消息。

## 返回总览

[查看主 README](./README.md)

