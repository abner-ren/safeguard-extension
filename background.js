/**
 * SafeGuard Background Service Worker
 * 处理扩展的后台任务、快捷键监听和消息传递
 */

// 初始化默认设置
chrome.runtime.onInstalled.addListener(async () => {
  console.log('SafeGuard 插件已安装');
  
  // 设置默认配置
  const defaultSettings = {
    enabled: true,
    apiKey: '',
    detectPrivacy: true,
    detectSensitive: true,
    detectHarmful: true,
    detectImages: true,
    whitelist: [],
    detectionDelay: 1000, // 1秒
    skipSmallImages: true,
    smallImageThreshold: 50 * 1024, // 50KB - 优化后的阈值,平衡性能和检测准确性
    statistics: {
      today: {
        date: new Date().toDateString(),
        total: 0,
        privacy: 0,
        sensitive: 0,
        harmful: 0
      },
      allTime: {
        total: 0,
        privacy: 0,
        sensitive: 0,
        harmful: 0
      }
    }
  };
  
  // 检查是否已有设置，如果没有则设置默认值
  const currentSettings = await chrome.storage.local.get(Object.keys(defaultSettings));
  const settingsToSet = {};
  
  for (const [key, value] of Object.entries(defaultSettings)) {
    if (currentSettings[key] === undefined) {
      settingsToSet[key] = value;
    }
  }
  
  if (Object.keys(settingsToSet).length > 0) {
    await chrome.storage.local.set(settingsToSet);
  }
});

// 处理来自 content script 的消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('收到消息:', request);
  
  switch (request.action) {
    case 'getSettings':
      handleGetSettings(sendResponse);
      return true; // 异步响应
      
    case 'updateStatistics':
      handleUpdateStatistics(request.data, sendResponse);
      return true;
      
    case 'checkWhitelist':
      handleCheckWhitelist(sender.url, sendResponse);
      return true;
    
    case 'proxyFetch':
      // 通过后台代理跨域请求，解决 content-script 的 CORS 限制
      handleProxyFetch(request, sendResponse);
      return true;
    
    case 'saveLog':
      // 保存日志到文件
      handleSaveLog(request.logEntry, sendResponse);
      return true;
    
    case 'downloadLogs':
      // 下载日志文件
      handleDownloadLogs(sendResponse);
      return true;
    
    // ===== WebSocket 实时检测相关 =====
    case 'startRealtimeDetection':
      handleStartRealtimeDetection(request.settings, sendResponse);
      return true;
    
    case 'detectRealtimeText':
      handleDetectRealtimeText(request, sendResponse);
      return true;
    
    case 'stopRealtimeDetection':
      handleStopRealtimeDetection(sendResponse);
      return true;
    
    case 'getRealtimeStatus':
      sendResponse({ 
        success: true, 
        status: wsConnectionStatus 
      });
      return true;
      
    default:
      sendResponse({ error: '未知的操作' });
  }
});

// 获取设置
async function handleGetSettings(sendResponse) {
  try {
    const settings = await chrome.storage.local.get(null);
    sendResponse({ success: true, settings });
  } catch (error) {
    console.error('获取设置失败:', error);
    sendResponse({ success: false, error: error.message });
  }
}

// 代理跨域请求（供 content script 调用）
async function handleProxyFetch(request, sendResponse) {
  try {
    const { url, options } = request;
    const { responseType } = options || {};
    const fetchOptions = { ...options };
    delete fetchOptions.responseType; // 不属于 fetch 的字段

    const res = await fetch(url, fetchOptions);
    const status = res.status;
    const statusText = res.statusText;
    const ok = res.ok;

    // Content-Type
    const contentType = res.headers.get('content-type') || '';

    if (responseType === 'base64') {
      const buf = await res.arrayBuffer();
      const base64 = arrayBufferToBase64(buf);
      sendResponse({ success: true, ok, status, statusText, base64, contentType });
      return;
    }

    // 读取文本，并尝试解析 JSON
    const text = await res.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch (_) {
      // 非 JSON 响应，忽略
    }

    sendResponse({ success: true, ok, status, statusText, text, data, contentType });
  } catch (error) {
    console.error('proxyFetch 失败:', error);
    sendResponse({ success: false, error: error.message || String(error) });
  }
}

// 工具：ArrayBuffer 转 Base64
function arrayBufferToBase64(buffer) {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  // btoa 期望 binary string
  return btoa(binary);
}

// 更新统计数据
async function handleUpdateStatistics(data, sendResponse) {
  try {
    const { statistics } = await chrome.storage.local.get('statistics');
    const today = new Date().toDateString();
    
    // 检查是否是新的一天
    if (statistics.today.date !== today) {
      statistics.today = {
        date: today,
        total: 0,
        privacy: 0,
        sensitive: 0,
        harmful: 0
      };
    }
    
    // 更新统计
    statistics.today.total += 1;
    statistics.today[data.category] = (statistics.today[data.category] || 0) + 1;
    statistics.allTime.total += 1;
    statistics.allTime[data.category] = (statistics.allTime[data.category] || 0) + 1;
    
    await chrome.storage.local.set({ statistics });
    sendResponse({ success: true });
  } catch (error) {
    console.error('更新统计数据失败:', error);
    sendResponse({ success: false, error: error.message });
  }
}

// 检查是否在白名单中
async function handleCheckWhitelist(url, sendResponse) {
  try {
    const { whitelist } = await chrome.storage.local.get('whitelist');
    const hostname = new URL(url).hostname;
    const isWhitelisted = whitelist.some(domain => hostname.includes(domain));
    sendResponse({ success: true, isWhitelisted });
  } catch (error) {
    console.error('检查白名单失败:', error);
    sendResponse({ success: false, error: error.message });
  }
}

// 处理快捷键命令
chrome.commands.onCommand.addListener(async (command) => {
  console.log('快捷键触发:', command);
  
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  
  if (!tab) return;
  
  switch (command) {
    case 'toggle-reveal':
      // 发送消息到 content script 临时显示所有内容
      chrome.tabs.sendMessage(tab.id, { action: 'revealAll', duration: 5000 });
      break;
      
    case 'toggle-pause':
      // 切换插件开关
      const { enabled } = await chrome.storage.local.get('enabled');
      await chrome.storage.local.set({ enabled: !enabled });
      chrome.tabs.sendMessage(tab.id, { action: 'toggleEnabled', enabled: !enabled });
      break;
  }
});

// ===== 日志管理功能 =====

// 日志存储（使用 chrome.storage.local）
async function handleSaveLog(logEntry, sendResponse) {
  try {
    // 获取当前日志
    const { logs = [] } = await chrome.storage.local.get('logs');
    
    // 添加新日志
    logs.push(logEntry);
    
    // 限制日志数量（保留最近 500 条）
    const maxLogs = 500;
    const trimmedLogs = logs.length > maxLogs ? logs.slice(-maxLogs) : logs;
    
    // 保存到 storage
    await chrome.storage.local.set({ logs: trimmedLogs });
    
    console.log('[Background] 日志已保存:', {
      type: logEntry.type,
      timestamp: logEntry.timestamp,
      totalLogs: trimmedLogs.length
    });
    
    sendResponse({ success: true });
  } catch (error) {
    console.error('[Background] 保存日志失败:', error);
    sendResponse({ success: false, error: error.message });
  }
}

// 下载日志文件
async function handleDownloadLogs(sendResponse) {
  try {
    // 获取所有日志
    const { logs = [] } = await chrome.storage.local.get('logs');
    
    if (logs.length === 0) {
      sendResponse({ success: false, error: '没有可下载的日志' });
      return;
    }
    
    // 生成日志内容
    const logContent = JSON.stringify(logs, null, 2);
    
    // 使用 Data URL 而不是 Blob URL (Service Worker 不支持 URL.createObjectURL)
    const dataUrl = 'data:application/json;charset=utf-8,' + encodeURIComponent(logContent);
    
    // 生成文件名（包含时间戳）
    const now = new Date();
    const filename = `safeguard-logs-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}-${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}.json`;
    
    // 下载文件
    await chrome.downloads.download({
      url: dataUrl,
      filename: filename,
      saveAs: true
    });
    
    console.log('[Background] 日志已下载:', filename);
    sendResponse({ success: true, filename });
  } catch (error) {
    console.error('[Background] 下载日志失败:', error);
    sendResponse({ success: false, error: error.message });
  }
}

// 监听标签页更新，重置统计
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete') {
    // 页面加载完成，可以在这里做一些初始化工作
    console.log('页面加载完成:', tab.url);
  }
});

// ===== WebSocket 实时检测管理 =====

/**
 * Gemini WebSocket API 实例（全局单例）
 */
let geminiWSConnection = null;
let wsConnectionStatus = {
  isConnected: false,
  lastError: null,
  connectedAt: null
};

/**
 * 启动实时检测 WebSocket 连接
 */
async function handleStartRealtimeDetection(settings, sendResponse) {
  try {
    console.log('[RealtimeWS] 启动 WebSocket 连接...');
    
    // 检查是否已连接
    if (geminiWSConnection && wsConnectionStatus.isConnected) {
      console.log('[RealtimeWS] WebSocket 已连接，复用现有连接');
      sendResponse({ success: true, message: '已连接' });
      return;
    }

    // 获取 API Key
    const apiKey = settings.geminiApiKey || settings.apiKey;
    if (!apiKey) {
      throw new Error('未配置 Gemini API Key');
    }

    // 创建 WebSocket 连接（注意：Service Worker 中可以直接使用 WebSocket）
    const wsUrl = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent?key=${apiKey}`;
    
    geminiWSConnection = new WebSocket(wsUrl);
    
    // 设置连接超时
    const connectionTimeout = setTimeout(() => {
      if (!wsConnectionStatus.isConnected) {
        geminiWSConnection.close();
        throw new Error('WebSocket 连接超时');
      }
    }, 10000);

    geminiWSConnection.onopen = () => {
      clearTimeout(connectionTimeout);
      console.log('[RealtimeWS] ✅ WebSocket 连接成功');
      wsConnectionStatus.isConnected = true;
      wsConnectionStatus.connectedAt = Date.now();
      wsConnectionStatus.lastError = null;
      
      // 发送初始化设置
      sendWSSetup(settings);
      
      sendResponse({ success: true, message: 'WebSocket 连接成功' });
    };

    geminiWSConnection.onerror = (error) => {
      console.error('[RealtimeWS] ❌ WebSocket 错误:', error);
      wsConnectionStatus.lastError = error.message || '连接错误';
      
      if (!wsConnectionStatus.isConnected) {
        sendResponse({ success: false, error: '连接失败' });
      }
    };

    geminiWSConnection.onclose = (event) => {
      console.log(`[RealtimeWS] ⚠️ WebSocket 连接关闭 (code: ${event.code})`);
      wsConnectionStatus.isConnected = false;
      geminiWSConnection = null;
    };

    geminiWSConnection.onmessage = (event) => {
      handleWSMessage(event.data);
    };

  } catch (error) {
    console.error('[RealtimeWS] 启动失败:', error);
    sendResponse({ success: false, error: error.message });
  }
}

/**
 * 发送 WebSocket 初始化设置
 */
function sendWSSetup(settings) {
  const setupMessage = {
    setup: {
      model: 'models/gemini-2.0-flash-live-001',
      generationConfig: {
        temperature: 0.3,
        topK: 20,
        topP: 0.8,
        maxOutputTokens: 256,
        responseModalities: ["TEXT"]
      },
      systemInstruction: {
        parts: [
          {
            text: `你是内容审核AI。快速判断文本是否有害。
分类: safe|privacy|sensitive|harmful
回复JSON: {"category":"...", "confidence":0-1, "reason":"..."}`
          }
        ]
      }
    }
  };
  
  try {
    geminiWSConnection.send(JSON.stringify(setupMessage));
    console.log('[RealtimeWS] 📤 发送初始化设置');
  } catch (error) {
    console.error('[RealtimeWS] 发送设置失败:', error);
  }
}

/**
 * 处理 WebSocket 接收消息
 */
const wsPendingDetections = new Map(); // 存储待处理的检测请求
let wsDetectionIdCounter = 0;

function handleWSMessage(data) {
  try {
    const message = JSON.parse(data);
    
    // 设置完成确认
    if (message.setupComplete) {
      console.log('[RealtimeWS] ✅ 初始化完成');
      return;
    }

    // 处理检测响应
    if (message.serverContent?.modelTurn?.parts) {
      const parts = message.serverContent.modelTurn.parts;
      let responseText = '';

      parts.forEach(part => {
        if (part.text) {
          responseText += part.text;
        }
      });

      if (responseText) {
        processWSDetectionResponse(responseText);
      }
    }

  } catch (error) {
    console.error('[RealtimeWS] 解析消息失败:', error);
  }
}

/**
 * 处理检测响应
 */
function processWSDetectionResponse(responseText) {
  try {
    // 提取检测ID
    const idMatch = responseText.match(/ID[:：]\s*(\d+)/);
    if (!idMatch) {
      console.warn('[RealtimeWS] 无法提取检测ID');
      return;
    }

    const id = parseInt(idMatch[1]);
    const pending = wsPendingDetections.get(id);
    
    if (!pending) {
      console.warn(`[RealtimeWS] 未找到待处理请求 #${id}`);
      return;
    }

    // 解析 JSON 响应
    const jsonMatch = responseText.match(/\{[\s\S]*"category"[\s\S]*\}/);
    let result;

    if (jsonMatch) {
      result = JSON.parse(jsonMatch[0]);
    } else {
      // 降级：简单判断
      result = {
        category: responseText.includes('harmful') ? 'harmful' : 'safe',
        confidence: 0.5,
        reason: '降级解析'
      };
    }

    // 添加响应时间
    result.responseTime = Date.now() - pending.timestamp;

    console.log(`[RealtimeWS] 📥 检测结果 #${id}: ${result.category} (${result.responseTime}ms)`);

    // 调用回调
    wsPendingDetections.delete(id);
    if (pending.sendResponse) {
      pending.sendResponse({ success: true, result });
    }

  } catch (error) {
    console.error('[RealtimeWS] 处理响应失败:', error);
  }
}

/**
 * 通过 WebSocket 检测文本
 */
function handleDetectRealtimeText(request, sendResponse) {
  if (!geminiWSConnection || !wsConnectionStatus.isConnected) {
    sendResponse({ 
      success: false, 
      error: 'WebSocket 未连接' 
    });
    return;
  }

  const id = ++wsDetectionIdCounter;
  const text = request.text;
  
  // 保存待处理请求
  wsPendingDetections.set(id, {
    sendResponse,
    text,
    timestamp: Date.now(),
    metadata: request.metadata
  });

  // 发送检测请求
  const message = {
    clientContent: {
      turns: [
        {
          role: "user",
          parts: [
            { 
              text: `ID: ${id}\n${text}` 
            }
          ]
        }
      ],
      turnComplete: true
    }
  };

  try {
    geminiWSConnection.send(JSON.stringify(message));
    console.log(`[RealtimeWS] 📤 发送检测 #${id}: ${text.substring(0, 30)}...`);
    
    // 超时处理（5秒）
    setTimeout(() => {
      if (wsPendingDetections.has(id)) {
        wsPendingDetections.delete(id);
        sendResponse({ 
          success: false, 
          error: '检测超时',
          result: { category: 'safe', confidence: 0 }
        });
      }
    }, 5000);

  } catch (error) {
    console.error('[RealtimeWS] 发送失败:', error);
    wsPendingDetections.delete(id);
    sendResponse({ success: false, error: error.message });
  }
}

/**
 * 停止实时检测
 */
function handleStopRealtimeDetection(sendResponse) {
  try {
    if (geminiWSConnection) {
      geminiWSConnection.close();
      geminiWSConnection = null;
      wsConnectionStatus.isConnected = false;
      console.log('[RealtimeWS] 🛑 WebSocket 连接已关闭');
    }
    sendResponse({ success: true });
  } catch (error) {
    console.error('[RealtimeWS] 关闭失败:', error);
    sendResponse({ success: false, error: error.message });
  }
}

console.log('SafeGuard Background Service Worker 已启动');

