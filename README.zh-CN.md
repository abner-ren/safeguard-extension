# 🛡️ SafeGuard - AI 驱动的内容审核 Chrome 扩展

[![Chrome](https://img.shields.io/badge/Chrome-Extension-green)](https://www.google.com/chrome/)
[![Manifest V3](https://img.shields.io/badge/Manifest-V3-blue)](https://developer.chrome.com/docs/extensions/mv3/)
[![AI Powered](https://img.shields.io/badge/Powered_by-AI-orange)](https://ai.google.dev/)

> 基于多种 AI 提供商（Gemini、通义千问、DeepSeek）的智能内容审核 Chrome 扩展，自动检测并屏蔽网页中的敏感内容。

**[English](README.md)** | 简体中文

---

## ✨ 功能特点

### 🔍 智能检测

- **隐私信息检测**：自动识别电话号码、邮箱地址、身份证号、银行卡号
- **敏感内容检测**：识别色情、暴力、政治敏感话题
- **有害信息检测**：识别赌博、诈骗、毒品、自残相关内容
- **图片内容审核**：使用 Gemini Vision / 通义千问 Vision 进行多模态分析
- **🆕 直播间实时检测**：使用 WebSocket API 实时监控和过滤直播弹幕中的有害消息

### 🛡️ 智能屏蔽

- **精准文本遮罩**：只屏蔽特定的有害文本片段（用 `{{}}` 标记），而不是整个段落
- **图片模糊处理**：高斯模糊 + 半透明遮罩
- **一键查看**：点击可临时查看原始内容（3秒后自动隐藏）
- **实时统计**：页面右下角显示实时屏蔽计数器

### ⚙️ 灵活配置

- **多 AI 提供商支持**：支持 Gemini、通义千问（阿里云）、DeepSeek
- **文本/图片分离**：可为文本和图片检测使用不同的 AI 提供商
- **API 密钥管理**：为每个提供商配置自己的 API 密钥
- **检测类别开关**：自由开启/关闭特定检测类别
- **网站白名单**：信任的网站跳过检测
- **性能设置**：可调节检测延迟、跳过小尺寸图片

### 🎨 现代化界面

- **渐变设计**：美观的紫色渐变主题
- **响应式布局**：适配各种屏幕尺寸
- **实时统计**：今日保护次数、分类统计
- **流畅交互**：平滑动画和清晰的视觉反馈

---

## 🚀 快速开始

### 系统要求

- Chrome 120+ (支持 Manifest V3)
- 至少一个 AI API 密钥：
  - [Gemini API 密钥](https://makersuite.google.com/app/apikey)
  - [通义千问 API 密钥](https://dashscope.console.aliyun.com/)
  - [DeepSeek API 密钥](https://platform.deepseek.com/)

### 安装步骤

1. **下载/克隆仓库**
   ```bash
   git clone https://github.com/abner-ren/safeguard-extension.git
   cd safeguard-extension
   ```

2. **加载扩展到 Chrome**
   - 打开 Chrome 浏览器，访问 `chrome://extensions/`
   - 启用右上角的"开发者模式"
   - 点击"加载已解压的扩展程序"
   - 选择 `safeguard-extension` 文件夹

3. **配置 API 密钥**
   - 点击 Chrome 工具栏中的扩展图标
   - 点击"⚙️ 设置"按钮
   - 输入所需 AI 提供商的 API 密钥
   - 选择文本和图片检测提供商
   - 点击"💾 保存设置"

4. **开始使用**
   - 访问任意网页
   - 扩展会自动检测并屏蔽不当内容
   - 点击被屏蔽内容可临时查看原文

---

## 🏗️ 架构设计

### 核心组件

1. **内容脚本** (`content.js`)：主要协调器 - 扫描 DOM（包括 Shadow DOM），聚合文本块，协调检测/屏蔽
2. **后台服务工作进程** (`background.js`)：AI API 调用的 CORS 代理，设置管理，统计追踪
3. **AI 提供商 API** (`utils/{gemini,qwen,deepseek}-api.js`)：模块化的 API 封装，带缓存和错误处理
4. **🆕 WebSocket API** (`utils/gemini-websocket-api.js`)：与 Gemini 的实时双向通信，用于直播弹幕检测
5. **🆕 实时检测器** (`utils/realtime-detector.js`)：专门用于直播环境中流式内容的检测器
6. **内容检测器** (`utils/detector.js`)：将检测请求路由到相应的 AI 提供商
7. **国际化系统** (`utils/i18n.js`)：自定义国际化系统，支持中文和英文

### 检测流程

```
DOM/Shadow DOM → content.js → getTextBlocks() → detector.detectTextBatch()
    → [GeminiAPI | QwenAPI | DeepSeekAPI] → 带 {{}} 标记的 AI 响应
    → blockTextElementPrecise() → 精准遮罩 UI
```

### 关键特性

- **Shadow DOM 支持**：深度遍历以检测现代 Web 组件中的内容（Reddit、YouTube、Bilibili）
- **批量处理**：分组文本检测（5项/批），减少约 30% 的 API 调用
- **精准遮罩**：只屏蔽特定的有害片段，而非整个段落
- **CORS 解决方案**：后台服务工作进程代理所有外部 API 请求
- **弹窗检测**：识别并遮罩整个有害的模态弹窗
- **🆕 实时 WebSocket**：双向流式传输，实现低延迟的直播弹幕内容审核

---

## 🛠️ 技术栈

- **Manifest V3**：最新的 Chrome 扩展标准
- **多 AI API**：
  - Google Gemini (`gemini-2.0-flash-exp`) - 文本和图片分析
  - 阿里云通义千问 (`qwen-vl-max-latest`) - 文本和图片分析
  - DeepSeek (`deepseek-chat`) - 仅文本分析
- **原生 JavaScript (ES6+)**：无需构建工具
- **Chrome APIs**：
  - `chrome.storage`：持久化数据存储
  - `chrome.runtime`：组件间消息传递
  - `chrome.scripting`：内容脚本注入

---

## 📁 项目结构

```
safeguard-extension/
├── manifest.json              # 扩展配置文件
├── background.js              # 服务工作进程
├── content.js                 # 内容脚本（主逻辑）
├── popup/                     # 扩展弹出窗口 UI
│   ├── popup.html
│   ├── popup.js
│   └── popup.css
├── options/                   # 设置页面
│   ├── options.html
│   ├── options.js
│   └── options.css
├── utils/                     # 工具模块
│   ├── gemini-api.js         # Gemini API 封装
│   ├── gemini-websocket-api.js  # 🆕 Gemini WebSocket API（实时检测）
│   ├── qwen-api.js           # 通义千问 API 封装
│   ├── deepseek-api.js       # DeepSeek API 封装
│   ├── detector.js           # 检测协调器
│   ├── realtime-detector.js  # 🆕 直播弹幕实时检测器
│   ├── helpers.js            # 辅助函数
│   ├── i18n.js               # 国际化
│   └── logger.js             # 调试日志
├── styles/                    # CSS 文件
│   ├── content.css           # 内容脚本样式
│   └── safeguard-image-wrapper.css
├── i18n/                      # 翻译文件
│   ├── en.json               # 英文翻译
│   └── zh.json               # 中文翻译
├── icons/                     # 扩展图标
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
└── logs/                      # 调试日志查看器
    ├── viewer.html
    └── viewer.js
```

---

## 🔑 配置说明

### 支持的 AI 提供商

| 提供商 | 文本检测 | 图片检测 | 需要 API 密钥 |
|--------|---------|---------|--------------|
| **Gemini** | ✅ | ✅ | 是（[获取密钥](https://makersuite.google.com/app/apikey)）|
| **通义千问** | ✅ | ✅ | 是（[获取密钥](https://dashscope.console.aliyun.com/)）|
| **DeepSeek** | ✅ | ❌ | 是（[获取密钥](https://platform.deepseek.com/)）|

### 检测类别

- ✅ 隐私信息（电话、邮箱、身份证、银行卡）
- ✅ 色情内容
- ✅ 暴力血腥
- ✅ 政治敏感
- ✅ 赌博博彩
- ✅ 诈骗欺诈
- ✅ 毒品物质
- ✅ 自残内容

### 高级设置

- **调试日志**：启用详细的控制台日志以便故障排除
- **提示词日志**：记录发送给 AI 提供商的提示词
- **响应日志**：记录接收到的 AI 响应
- **性能日志**：追踪性能指标
- **检测延迟**：调整扫描前的延迟（默认：2000ms）
- **最小图片尺寸**：跳过小于阈值的图片（默认：100x100px）

---

## 🐛 调试

1. **启用调试日志**：
   - 打开扩展选项
   - 勾选"启用调试日志"
   - 勾选"记录提示词"和"记录响应"
   
2. **查看控制台日志**：
   - 在网页上右键 → 检查
   - 转到控制台选项卡
   - 筛选"SafeGuard"消息

3. **查看保存的日志**：
   - 访问 `chrome-extension://<扩展ID>/logs/viewer.html`
   - 或在加载扩展后直接打开 `logs/viewer.html`

---

## 📝 开源协议

MIT License - 详见 [LICENSE](LICENSE) 文件

---

## 🤝 贡献

欢迎贡献、问题反馈和功能请求！

---

## 👨‍💻 作者

**abner-ren**
- GitHub: [@abner-ren](https://github.com/abner-ren)
- Email: r1401525660@gmail.com

---

## 🙏 致谢

- Google Gemini AI 提供强大的多模态能力
- 阿里云通义千问提供优秀的中文语言支持
- DeepSeek 提供高效的文本分析
- Chrome 扩展社区提供宝贵的资源

---

## 📧 支持

如有问题,请使用 [GitHub Issues](https://github.com/abner-ren/safeguard-extension/issues) 页面。

---

**用 ❤️ 为 Google Chrome Built-in AI Challenge 2025 打造**
