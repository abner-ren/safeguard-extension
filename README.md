# 🛡️ SafeGuard - AI-Powered Content Moderation Chrome Extension

[![Chrome](https://img.shields.io/badge/Chrome-Extension-green)](https://www.google.com/chrome/)
[![Manifest V3](https://img.shields.io/badge/Manifest-V3-blue)](https://developer.chrome.com/docs/extensions/mv3/)
[![AI Powered](https://img.shields.io/badge/Powered_by-AI-orange)](https://ai.google.dev/)

> An intelligent content moderation Chrome extension powered by multiple AI providers (Gemini, Qwen, DeepSeek) that automatically detects and blocks sensitive content on web pages.

English | **[简体中文](README.zh-CN.md)**

---

## ✨ Features

### 🔍 Intelligent Detection

- **Privacy Information**: Automatically identifies phone numbers, emails, ID numbers, bank cards
- **Sensitive Content**: Detects sexual, violent, and politically sensitive topics
- **Harmful Information**: Identifies gambling, scams, drugs, and self-harm related content
- **Image Moderation**: Multimodal analysis using Gemini Vision / Qwen Vision

### 🛡️ Smart Blocking

- **Precision Text Masking**: Only blocks specific harmful fragments (marked with `{{}}`) instead of entire paragraphs
- **Image Blur**: Gaussian blur + semi-transparent overlay
- **One-Click View**: Click to temporarily reveal original content (auto-hides after 3 seconds)
- **Real-time Statistics**: Live counter in bottom-right corner showing blocked items

### ⚙️ Flexible Configuration

- **Multiple AI Providers**: Support for Gemini, Qwen (Alibaba), and DeepSeek
- **Separate Text/Image APIs**: Use different providers for text and image detection
- **API Key Management**: Configure your own API keys for each provider
- **Detection Category Toggles**: Enable/disable specific detection categories
- **Website Whitelist**: Trusted sites bypass detection
- **Performance Settings**: Adjustable detection delay, skip small images

### 🎨 Modern Interface

- **Gradient Design**: Beautiful purple gradient theme
- **Responsive Layout**: Adapts to various screen sizes
- **Live Statistics**: Daily protection count and category breakdowns
- **Smooth Interactions**: Fluid animations and clear visual feedback

---

## 🚀 Quick Start

### Requirements

- Chrome 120+ (Manifest V3 compatible)
- At least one AI API Key:
  - [Gemini API Key](https://makersuite.google.com/app/apikey)
  - [Qwen API Key](https://dashscope.console.aliyun.com/)
  - [DeepSeek API Key](https://platform.deepseek.com/)

### Installation

1. **Download/Clone the repository**
   ```bash
   git clone https://github.com/abner-ren/safeguard-extension.git
   cd safeguard-extension
   ```

2. **Load the extension in Chrome**
   - Open Chrome and navigate to `chrome://extensions/`
   - Enable "Developer mode" (toggle in top-right corner)
   - Click "Load unpacked"
   - Select the `safeguard-extension` folder

3. **Configure API Keys**
   - Click the extension icon in Chrome toolbar
   - Click "⚙️ Settings" button
   - Enter your API key(s) for desired provider(s)
   - Choose text and image detection providers
   - Click "💾 Save Settings"

4. **Start Using**
   - Visit any webpage
   - Extension automatically detects and blocks inappropriate content
   - Click blocked content to temporarily view original

---

## 🏗️ Architecture

### Core Components

1. **Content Script** (`content.js`): Main orchestrator - scans DOM including Shadow DOM, aggregates text blocks, coordinates detection/blocking
2. **Background Service Worker** (`background.js`): CORS proxy for AI API calls, settings management, statistics tracking
3. **AI Provider APIs** (`utils/{gemini,qwen,deepseek}-api.js`): Modular API wrappers with caching and error handling
4. **Content Detector** (`utils/detector.js`): Routes detection requests to appropriate AI providers
5. **i18n System** (`utils/i18n.js`): Custom internationalization supporting Chinese and English

### Detection Flow

```
DOM/Shadow DOM → content.js → getTextBlocks() → detector.detectTextBatch()
    → [GeminiAPI | QwenAPI | DeepSeekAPI] → AI Response with {{}} markers
    → blockTextElementPrecise() → Precision masking UI
```

### Key Features

- **Shadow DOM Support**: Deep traversal to detect content in modern web components (Reddit, YouTube, Bilibili)
- **Batch Processing**: Groups text detection (5 items/batch) to reduce API calls by ~30%
- **Precision Masking**: Only blocks specific harmful fragments, not entire paragraphs
- **CORS Workaround**: Background service worker proxies all external API requests
- **Popup Detection**: Identifies and masks entire harmful modal popups

---

## 🛠️ Technology Stack

- **Manifest V3**: Latest Chrome Extension standard
- **Multiple AI APIs**:
  - Google Gemini (`gemini-2.0-flash-exp`) - Text & image analysis
  - Alibaba Qwen (`qwen-vl-max-latest`) - Text & image analysis
  - DeepSeek (`deepseek-chat`) - Text analysis only
- **Vanilla JavaScript (ES6+)**: No build tools required
- **Chrome APIs**:
  - `chrome.storage`: Persistent data storage
  - `chrome.runtime`: Message passing between components
  - `chrome.scripting`: Content script injection

---

## 📁 Project Structure

```
safeguard-extension/
├── manifest.json              # Extension configuration
├── background.js              # Service Worker
├── content.js                 # Content Script (main logic)
├── popup/                     # Extension popup UI
│   ├── popup.html
│   ├── popup.js
│   └── popup.css
├── options/                   # Settings page
│   ├── options.html
│   ├── options.js
│   └── options.css
├── utils/                     # Utility modules
│   ├── gemini-api.js         # Gemini API wrapper
│   ├── qwen-api.js           # Qwen API wrapper
│   ├── deepseek-api.js       # DeepSeek API wrapper
│   ├── detector.js           # Detection orchestrator
│   ├── helpers.js            # Helper functions
│   ├── i18n.js               # Internationalization
│   └── logger.js             # Debug logging
├── styles/                    # CSS files
│   ├── content.css           # Content script styles
│   └── safeguard-image-wrapper.css
├── i18n/                      # Translation files
│   ├── en.json
│   └── zh.json
├── icons/                     # Extension icons
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
└── logs/                      # Debug log viewer
    ├── viewer.html
    └── viewer.js
```

---

## 🔑 Configuration

### Supported AI Providers

| Provider | Text Detection | Image Detection | API Key Required |
|----------|---------------|-----------------|------------------|
| **Gemini** | ✅ | ✅ | Yes ([Get Key](https://makersuite.google.com/app/apikey)) |
| **Qwen** | ✅ | ✅ | Yes ([Get Key](https://dashscope.console.aliyun.com/)) |
| **DeepSeek** | ✅ | ❌ | Yes ([Get Key](https://platform.deepseek.com/)) |

### Detection Categories

- ✅ Privacy Information (phone, email, ID, bank cards)
- ✅ Sexual Content
- ✅ Violence & Gore
- ✅ Political Sensitivity
- ✅ Gambling & Betting
- ✅ Scams & Fraud
- ✅ Drugs & Substances
- ✅ Self-Harm Content

### Advanced Settings

- **Debug Logging**: Enable detailed console logs for troubleshooting
- **Prompt Logging**: Log AI prompts sent to providers
- **Response Logging**: Log AI responses received
- **Timing Logging**: Track performance metrics
- **Detection Delay**: Adjust delay before scanning (default: 2000ms)
- **Minimum Image Size**: Skip images smaller than threshold (default: 100x100px)

---

## 🐛 Debugging

1. **Enable Debug Logs**:
   - Open extension options
   - Check "Enable Debug Logs"
   - Check "Log Prompts" and "Log Responses"
   
2. **View Console Logs**:
   - Right-click on webpage → Inspect
   - Go to Console tab
   - Filter for "SafeGuard" messages

3. **View Saved Logs**:
   - Navigate to `chrome-extension://<extension-id>/logs/viewer.html`
   - Or open `logs/viewer.html` directly after loading extension

---

## 📝 License

MIT License - See [LICENSE](LICENSE) file for details

---

## 🤝 Contributing

Contributions, issues, and feature requests are welcome!

---

## 👨‍💻 Author

**abner-ren**
- GitHub: [@abner-ren](https://github.com/abner-ren)
- Email: r1401525660@gmail.com

---

## 🙏 Acknowledgments

- Google Gemini AI for powerful multimodal capabilities
- Alibaba Cloud Qwen for robust Chinese language support
- DeepSeek for efficient text analysis
- Chrome Extension community for invaluable resources

---

## 📧 Support

For issues, please use the [GitHub Issues](https://github.com/abner-ren/safeguard-extension/issues) page.

---

**Made with ❤️ for the Google Chrome Built-in AI Challenge 2025**
