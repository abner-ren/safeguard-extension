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
    smallImageThreshold: 100 * 1024, // 100KB
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
    const blob = new Blob([logContent], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    // 生成文件名（包含时间戳）
    const now = new Date();
    const filename = `safeguard-logs-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}-${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}.json`;
    
    // 下载文件
    await chrome.downloads.download({
      url: url,
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

console.log('SafeGuard Background Service Worker 已启动');
