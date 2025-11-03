# SafeGuard Chrome Extension - AI Agent Instructions

## Project Overview

1、每次对话结束后，提交一次git在本地;

SafeGuard is a Chrome Manifest V3 extension that uses multiple AI providers (Gemini, Qwen, DeepSeek) to detect and block harmful content on web pages. It implements **precision masking** - only blocking specific harmful text fragments marked with `{{}}` instead of entire paragraphs.

## Architecture & Data Flow

### Core Components

1. **Content Script** (`content.js`) - Main orchestrator running on every page:
   - Scans DOM including Shadow DOM (critical for Reddit, YouTube, Bilibili)
   - Aggregates text into blocks via `getTextBlocks()` to reduce API calls
   - Coordinates detection/blocking pipeline
   - Implements **precision masking** via `blockTextElementPrecise()`

2. **Background Service Worker** (`background.js`):
   - CORS proxy for AI API calls (solves `chrome.runtime.sendMessage({action: 'proxyFetch'})`)
   - Settings management via `chrome.storage.local`
   - Statistics tracking

3. **AI Provider APIs** (`utils/{gemini,qwen,deepseek}-api.js`):
   - Modular wrappers with caching and error handling
   - **Gemini**: Text + image analysis (gemini-2.5-flash)
   - **Qwen**: Text + image analysis (qwen-vl-plus for images)
   - **DeepSeek**: Text only (deepseek-chat)

4. **Content Detector** (`utils/detector.js`):
   - Routes requests to appropriate AI providers
   - Supports separate text/image providers (e.g., DeepSeek for text, Gemini for images)
   - API key management per provider

### Detection Flow

```
DOM/Shadow DOM → getTextBlocks() → detector.detectTextBatch(5 items/batch)
  → [GeminiAPI | QwenAPI | DeepSeekAPI] → AI Response with {{harmful text}} markers
  → blockTextElementPrecise() → Precision masking UI with click-to-reveal
```

**Key Feature**: Batch processing groups 5 text blocks per API call (30% reduction in API usage).

## Critical Patterns

### 1. Shadow DOM Support

Modern sites (Reddit, YouTube, Bilibili) use Shadow DOM extensively. Always traverse deeply:

```javascript
// Find all Shadow DOM hosts
getAllElementsWithShadowDOM(root) // → returns elements with shadowRoot
querySelectorAllDeep(root, selector) // → queries including Shadow DOM
```

When detecting content, use `getTextBlocks()` which automatically handles Shadow DOM traversal.

### 2. Precision Masking System

The extension **never blocks entire paragraphs**. AI responses must mark harmful parts with `{{}}`:

```javascript
// AI returns: "This is {{harmful content}} mixed with safe text"
// Result: Only "harmful content" is masked, rest remains visible
```

Implementation in `blockTextElementPrecise()`:
- Extracts `{{}}` markers via `extractSensitiveParts()`
- Builds `charToNodeMap` for cross-node text matching
- Replaces only marked fragments with `.safeguard-inline-mask` spans

### 3. CORS Workaround

Content scripts cannot make cross-origin requests. ALL external API calls go through background proxy:

```javascript
// In content script or API wrapper:
chrome.runtime.sendMessage({
  action: 'proxyFetch',
  url: apiEndpoint,
  options: {method: 'POST', body: JSON.stringify(data)}
}, response => {
  // response.data contains fetch result
});
```

Background handles actual fetch in `handleProxyFetch()`.

### 4. Separate Text/Image API Keys

Support separate API providers for text vs images:

```javascript
// settings structure
{
  textProvider: 'deepseek',      // Text detection
  imageProvider: 'gemini',       // Image detection
  deepseekApiKey: 'sk-xxx',
  geminiImageApiKey: 'AI-yyy'    // Independent image API key
}
```

Check `options.js` for configuration UI patterns.

### 5. Custom i18n System

Uses custom internationalization (not `chrome.i18n`) supporting `i18n/{en,zh}.json`:

```javascript
// In any page:
await i18n.init();
i18n.updatePageText(); // Translates elements with data-i18n attributes
```

### 6. Popup Detection & Masking

Detects harmful modal popups before text scanning (`scanAndMaskPopups()`):

```javascript
// Identifies popups by: z-index >= 1000, centered, has interactive elements
// Sends entire popup content to AI
// Masks full popup if shouldBlock === true
```

## Development Workflows

### Testing Changes

1. **Load Extension**: Chrome → `chrome://extensions/` → Developer mode → Load unpacked
2. **View Console Logs**: Right-click webpage → Inspect → Console (filter "SafeGuard")
3. **Enable Debug Logging**: Extension options → Check "Enable Debug Logs"
4. **View Saved Logs**: Navigate to `chrome-extension://<id>/logs/viewer.html`

### Debugging Detection Issues

Enable all logging in options:
- ✅ Log Prompts (shows AI requests)
- ✅ Log Responses (shows AI responses)
- ✅ Log Timing (performance metrics)

Check console for:
- `🔍 开始提取文本块` - Text block extraction
- `📤 正在发送批量请求` - Batch API calls
- `🎯 精确屏蔽模式` - Precision masking execution

### Adding New AI Providers

1. Create `utils/newprovider-api.js` following `gemini-api.js` pattern
2. Implement `analyzeImage()` and `analyzeBatchTexts()` methods
3. Update `detector.js` → `_initAIAPI()` to initialize new provider
4. Add configuration fields in `options.js` and `options.html`
5. Update manifest.json `host_permissions` if needed

## File Structure Conventions

```
background.js         # Service worker - no DOM access
content.js            # Main logic - has DOM access, no CORS
utils/*.js            # Shared utilities injected before content.js
options/*             # Settings pages (separate context)
popup/*               # Extension popup (separate context)
```

**Injection Order** (manifest.json): helpers.js → i18n.js → API wrappers → detector.js → content.js

## Common Pitfalls

1. **Don't bypass Shadow DOM**: Always use `querySelectorAllDeep()` or `getAllElementsIncludingShadowDOM()` for comprehensive scanning
2. **Never use full paragraph masking**: AI must return `{{}}` markers; check `extractSensitiveParts()` finds matches
3. **CORS errors in content script**: Route through `proxyFetch` in background.js
4. **Token limit errors**: Reduce batch size in `analyzeBatchTexts()` (currently 5 items)
5. **Settings not persisting**: Always use `chrome.storage.local`, not `localStorage`

## Key Technologies

- **Manifest V3**: Service workers, `chrome.scripting`, `chrome.storage`
- **Vanilla JS (ES6+)**: No build tools, no bundlers
- **Multiple AI APIs**: Gemini, Qwen, DeepSeek with fallback strategies
- **CSS**: Gradient theme (`linear-gradient` purple tones), blur filters for images

## Project Context

Built for **Google Chrome Built-in AI Challenge 2025** by abner-ren. Primary language support: Chinese and English.
