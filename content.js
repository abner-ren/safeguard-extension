// ========== 弹窗整体遮罩 ========== //
// 选择器可根据实际情况扩展
// 通用弹窗识别：遍历所有可见元素，筛选疑似弹窗
function queryAllPopupsDeep(root = document) {
  const all = Array.from(root.querySelectorAll('*'));
  const popups = [];
  const vw = window.innerWidth, vh = window.innerHeight;
  for (const el of all) {
    if (!(el instanceof HTMLElement)) continue;
    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity < 0.1) continue;
    if (!(style.position === 'fixed' || style.position === 'absolute')) continue;
    // z-index 至少 1000
    const z = parseInt(style.zIndex) || 0;
    if (z < 1000) continue;
    // 尺寸限制：宽高 150px~90%窗口
    const rect = el.getBoundingClientRect();
    if (rect.width < 150 || rect.height < 100) continue;
    if (rect.width > vw * 0.95 || rect.height > vh * 0.95) continue; // 排除全屏遮罩
    // 居中（中心点在视口中心±15%）
    const cx = rect.left + rect.width/2, cy = rect.top + rect.height/2;
    if (Math.abs(cx - vw/2) > vw*0.15 || Math.abs(cy - vh/2) > vh*0.15) continue;
    // 排除 overlay 遮罩（全黑/全白/半透明）
    const bg = style.backgroundColor || '';
    if (/rgba?\((\s*0\s*,){2,3}\s*(0(\.\d+)?|1(\.0+)?|0?\.\d+)\)/.test(bg) && rect.width > vw*0.7 && rect.height > vh*0.7) continue;
    // 排除 body/html
    if (el === document.body || el === document.documentElement) continue;
    popups.push(el);
  }
  return popups;
}

// 检测弹窗内容并整体遮罩
async function scanAndMaskPopups() {
  const popups = queryAllPopupsDeep();
  if (!detector) {
    console.warn('检测器未初始化，跳过弹窗检测');
    return;
  }
  for (const popup of popups) {
    try {
      // 跳过已处理
      if (popup.classList.contains('safeguard-popup-masked')) continue;
      // 跳过不可见或尺寸异常的元素（防止误判）
      const rect = popup.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) continue;
      const vw = window.innerWidth, vh = window.innerHeight;
      if (rect.width > vw * 0.95 && rect.height > vh * 0.95) continue; // 全屏/overlay
      // 严格匹配：要求包含交互元素（button/link/input/role=button 等），以降低误报
      const interactiveSelector = 'button, a[href], input[type="button"], input[type="submit"], [role="button"], .popup-btn, .popup-close, .close';
      const hasInteractive = popup.querySelector(interactiveSelector) !== null;
      if (!hasInteractive) {
        // 如果没有交互元素，跳过（可按需放宽）
        if (settings && settings.enableDebugLogs) console.log('跳过非交互弹窗候选（无按钮/链接）', popup);
        continue;
      }

      // 最小文本长度
      const text = (popup.innerText || popup.textContent || '').trim();
      if (!text || text.length < 10) continue;

  // 送 AI 检测（保持与其他检测一致的批量接口）
      const results = await detector.detectTextBatch([{ text, element: popup }]);
      const r = Array.isArray(results) ? results[0] : results;
      if (!r) continue;

      // 主要判断 shouldBlock 字段；仅在 shouldBlock 为 true 时才遮罩
      if (r.shouldBlock) {
        maskPopupElement(popup, r);
      } else {
        // 如果检测返回 markedText 且包含 {{}}，也可视为需要遮罩（兼容旧逻辑）
        if (r.markedText && /\{\{.*?\}\}/.test(r.markedText)) {
          maskPopupElement(popup, r);
        }
      }
    } catch (err) {
      console.error('弹窗检测失败:', err);
      continue;
    }
  }
}

// 暴露手动触发接口，用于开发与调试
try {
  window.testScanPopups = scanAndMaskPopups;
} catch (e) {
  // 无法暴露（例如运行在非页面上下文），忽略
}

// 遮罩弹窗
function maskPopupElement(popup, aiResult) {
  popup.classList.add('safeguard-popup-masked');
  // 创建遮罩层
  const mask = document.createElement('div');
  mask.className = 'safeguard-popup-mask';
  mask.style.position = 'absolute';
  mask.style.left = 0;
  mask.style.top = 0;
  mask.style.width = '100%';
  mask.style.height = '100%';
  mask.style.background = 'rgba(0,0,0,0.72)';
  mask.style.zIndex = 99999;
  mask.style.display = 'flex';
  mask.style.flexDirection = 'column';
  mask.style.justifyContent = 'center';
  mask.style.alignItems = 'center';
  mask.style.color = '#fff';
  mask.style.fontSize = '1.2em';
  mask.style.backdropFilter = 'blur(2px)';
  mask.style.borderRadius = getComputedStyle(popup).borderRadius;
  mask.style.boxSizing = 'border-box';
  mask.innerHTML = `
    <div style="margin-bottom: 18px; font-weight: bold; font-size: 1.3em;">⚠️ ${i18n.t('content.popupBlockedTip') || '检测到有害内容'}</div>
    <div style="display: flex; gap: 16px;">
      <button class="safeguard-popup-btn-close" style="padding: 8px 18px; font-size: 1em; border-radius: 6px; border: none; background: #e74c3c; color: #fff; cursor: pointer;">${i18n.t('content.popupBtnClose') || '关闭弹窗'}</button>
      <button class="safeguard-popup-btn-view" style="padding: 8px 18px; font-size: 1em; border-radius: 6px; border: none; background: #3498db; color: #fff; cursor: pointer;">${i18n.t('content.popupBtnView') || '查看屏蔽内容'}</button>
    </div>
  `;
  // 让遮罩自适应弹窗定位
  popup.style.position = popup.style.position || 'relative';
  popup.appendChild(mask);
  // 关闭按钮
  mask.querySelector('.safeguard-popup-btn-close').onclick = (e) => {
    e.stopPropagation();
    popup.remove();
  };
  // 查看内容按钮
  mask.querySelector('.safeguard-popup-btn-view').onclick = (e) => {
    e.stopPropagation();
    mask.remove();
    popup.classList.remove('safeguard-popup-masked');
  };
  
  // 记录到 blockedElements Map 中
  blockedElements.set(popup, {
    type: 'popup',
    category: aiResult.category || 'harmful',
    timestamp: Date.now(),
    mask: mask
  });
  
  // 更新统计
  statistics.total++;
  if (aiResult.category === 'privacy') statistics.privacy++;
  else if (aiResult.category === 'sensitive') statistics.sensitive++;
  else if (aiResult.category === 'harmful') statistics.harmful++;
}

// 在主流程合适位置调用
// scanAndMaskPopups(); // 可在 scanPage 或 observeDynamicContent 后调用
/**
 * SafeGuard Content Script
 * 在网页中运行，负责内容扫描、检测和屏蔽
 */

// 全局状态
let isEnabled = true;
let settings = {};
let detector = null; // ContentDetector 实例
let blockedElements = new Map(); // 存储被屏蔽的元素
let processingQueue = []; // 待处理队列
let isProcessing = false;
let statistics = { // 统计数据
  total: 0,
  privacy: 0,
  sensitive: 0,
  harmful: 0
};

// 初始化
(async function init() {
  console.log('SafeGuard Content Script 已加载');
  
  // 获取设置
  const response = await chrome.runtime.sendMessage({ action: 'getSettings' });
  if (response.success) {
    settings = response.settings;
    isEnabled = settings.enabled;
  }
  
  // 检查是否在白名单中
  const whitelistResponse = await chrome.runtime.sendMessage({ 
    action: 'checkWhitelist' 
  });
  
  if (whitelistResponse.success && whitelistResponse.isWhitelisted) {
    console.log('当前网站在白名单中，SafeGuard 不会运行');
    return;
  }
  
  // ================================
  // 调试日志：显示完整配置信息
  // ================================
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🔧 SafeGuard 初始化信息');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📦 当前配置:');
  console.log('  · AI Provider:', settings.aiProvider || '未设置（默认 gemini）');
  console.log('  · Text Provider:', settings.textProvider || '未设置');
  console.log('  · Image Provider:', settings.imageProvider || '未设置');
  console.log('🔑 API Keys:');
  console.log('  · Gemini Key:', settings.geminiApiKey ? settings.geminiApiKey.substring(0, 15) + '...' : '未设置');
  console.log('  · Gemini Image Key:', settings.geminiImageApiKey ? settings.geminiImageApiKey.substring(0, 15) + '...' : '未设置');
  console.log('  · DeepSeek Key:', settings.deepseekApiKey ? settings.deepseekApiKey.substring(0, 15) + '...' : '未设置');
  console.log('  · Qwen Key:', settings.qwenApiKey ? settings.qwenApiKey.substring(0, 15) + '...' : '未设置');
  console.log('  · Qwen Image Key:', settings.qwenImageApiKey ? settings.qwenImageApiKey.substring(0, 15) + '...' : '未设置');
  console.log('🐛 调试选项:');
  console.log('  · Enable Debug Logs:', settings.enableDebugLogs || false);
  console.log('  · Log Prompts:', settings.logPrompts !== false);
  console.log('  · Log Responses:', settings.logResponses !== false);
  console.log('  · Log Timing:', settings.logTiming !== false);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  
  // 获取服务商配置（优先使用新配置，兼容旧配置）
  const textProvider = settings.textProvider || settings.aiProvider || 'gemini';
  const imageProvider = settings.imageProvider || settings.aiProvider || 'gemini';
  
  console.log('📌 最终选择:');
  console.log(`  · 文本检测: ${textProvider}`);
  console.log(`  · 图片检测: ${imageProvider}`);
  
  // 检查并准备 API Keys
  const providerNames = { gemini: 'Gemini', deepseek: 'DeepSeek', qwen: '通义千问' };
  
  // 检查文本检测 API Key
  let textApiKey;
  if (textProvider === 'gemini') {
    textApiKey = settings.geminiApiKey || settings.apiKey;
  } else if (textProvider === 'deepseek') {
    textApiKey = settings.deepseekApiKey;
  } else if (textProvider === 'qwen') {
    textApiKey = settings.qwenApiKey;
  }
  
  if (!textApiKey) {
    console.error(`❌ 未配置 ${providerNames[textProvider]} 文本检测 API Key`);
    showNotification(`请先配置 ${providerNames[textProvider]} API Key`, 'warning');
    return;
  }
  console.log(`✅ 文本检测 API Key (${providerNames[textProvider]}): ${textApiKey.substring(0, 15)}...`);
  
  // 检查图片检测 API Key
  let imageApiKey;
  if (imageProvider === 'gemini') {
    // 如果图片也用 Gemini,且文本不是 Gemini,使用独立的 Key
    if (textProvider !== 'gemini' && settings.geminiImageApiKey) {
      imageApiKey = settings.geminiImageApiKey;
      console.log(`✅ 图片检测使用独立的 Gemini API Key: ${imageApiKey.substring(0, 15)}...`);
    } else {
      imageApiKey = settings.geminiApiKey || settings.apiKey;
      console.log(`✅ 图片检测共用 Gemini API Key: ${imageApiKey.substring(0, 15)}...`);
    }
  } else if (imageProvider === 'qwen') {
    // 如果图片用 Qwen,且文本不是 Qwen,使用独立的 Key
    if (textProvider !== 'qwen' && settings.qwenImageApiKey) {
      imageApiKey = settings.qwenImageApiKey;
      console.log(`✅ 图片检测使用独立的通义千问 API Key: ${imageApiKey.substring(0, 15)}...`);
    } else {
      imageApiKey = settings.qwenApiKey;
      console.log(`✅ 图片检测共用通义千问 API Key: ${imageApiKey.substring(0, 15)}...`);
    }
  } else if (imageProvider === 'deepseek') {
    console.warn('⚠️ DeepSeek 不支持图片检测');
  }
  
  if (!imageApiKey && settings.detectImages) {
    console.error(`❌ 未配置 ${providerNames[imageProvider]} 图片检测 API Key`);
    showNotification(`请先配置 ${providerNames[imageProvider]} 图片检测 API Key`, 'warning');
    return;
  }
  
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  
  // 初始化 ContentDetector
  try {
    // 使用文本检测的 API Key 作为主 Key（兼容旧代码）
    const mainApiKey = textApiKey;
    
    detector = new ContentDetector(mainApiKey, {
      // 新配置
      textProvider: textProvider,
      imageProvider: imageProvider,
      
      // Gemini
      geminiApiKey: settings.geminiApiKey || settings.apiKey,
      geminiImageApiKey: settings.geminiImageApiKey, // 新增：图片专用 Key
      geminiTextModel: settings.geminiTextModel || settings.geminiModel || 'gemini-2.5-flash',
      geminiImageModel: settings.geminiImageModel || settings.geminiModel || 'gemini-2.5-flash',
      
      // DeepSeek
      deepseekApiKey: settings.deepseekApiKey,
      deepseekTextModel: settings.deepseekTextModel || settings.deepseekModel || 'deepseek-chat',
      
      // Qwen
      qwenApiKey: settings.qwenApiKey,
      qwenImageApiKey: settings.qwenImageApiKey, // 新增：图片专用 Key
      qwenTextModel: settings.qwenTextModel || 'qwen-turbo',
      qwenImageModel: settings.qwenImageModel || 'qwen-vl-plus',
      
      // 兼容旧配置
      aiProvider: textProvider,
      geminiModel: settings.geminiTextModel || settings.geminiModel || 'gemini-2.5-flash',
      deepseekModel: settings.deepseekTextModel || settings.deepseekModel || 'deepseek-chat',
      
      // 检测设置
      detectPrivacy: settings.detectPrivacy !== false,
      detectSensitive: settings.detectSensitive !== false,
      detectHarmful: settings.detectHarmful !== false,
      detectImages: settings.detectImages !== false,
      skipSmallImages: settings.skipSmallImages !== false,
      
      // 调试日志
      enableDebugLogs: settings.enableDebugLogs || false,
      logPrompts: settings.logPrompts !== false,
      logResponses: settings.logResponses !== false,
      logTiming: settings.logTiming !== false
    });
    console.log(`✅ ContentDetector 初始化成功`);
  } catch (error) {
    console.error('❌ ContentDetector 初始化失败:', error);
    showNotification('检测器初始化失败', 'error');
    return;
  }
  
  // ===== 初始化实时检测器（WebSocket） =====
  let realtimeDetector = null;
  if (settings.enableRealtimeDetection) {
    try {
      console.log('🚀 正在初始化实时检测器...');
      realtimeDetector = new RealtimeDetector({
        enableRealtimeDetection: true,
        geminiApiKey: settings.geminiApiKey || settings.apiKey,
        enableDebugLogs: settings.enableDebugLogs || false
      });
      
      // 启动 WebSocket 连接
      const startResult = await realtimeDetector.start();
      if (startResult) {
        console.log('✅ 实时检测器启动成功');
        
        // 替换标准检测器为实时检测器（用于弹幕等场景）
        window.realtimeDetector = realtimeDetector;
      } else {
        console.warn('⚠️ 实时检测器启动失败，将使用标准检测');
      }
    } catch (error) {
      console.error('❌ 实时检测器初始化失败:', error);
    }
  }
  
  if (isEnabled) {
    startScanning();
  }
  
  // 创建浮动统计显示
  createFloatingStats();
})();

// 开始扫描
function startScanning() {
  console.log('开始扫描页面内容...');
  
  // 扫描现有内容
  scanPage();
  
  // 监听动态内容
  observeDynamicContent();
}

// 扫描页面
async function scanPage() {
  if (!detector) {
    console.warn('检测器未初始化，跳过扫描');
    return;
  }
  
  console.log('开始扫描页面内容...');
  
  // 特殊处理：扫描所有 Shadow DOM（如 B站评论区）
  console.log('🔍 检查页面中的 Shadow DOM 组件...');
  const shadowHosts = getAllElementsWithShadowDOM(document.body);
  console.log(`找到 ${shadowHosts.length} 个包含 Shadow DOM 的元素`);
  
  shadowHosts.forEach(host => {
    console.log(`  - ${host.tagName} (ID: ${host.id || '无'}, Class: ${host.className || '无'})`);
  });
  
  // 先整体检测弹窗并遮罩（优先于文本精确遮罩）
  await scanAndMaskPopups();

  // 获取文本节点（改用块级元素聚合 + Shadow DOM 支持）
  const textBlocks = getTextBlocks(document.body);
  console.log(`找到 ${textBlocks.length} 个文本块（包括 Shadow DOM）`);
  
  // 调试：显示前5个文本块的内容
  if (settings.enableDebugLogs) {
    console.log('📋 前5个文本块预览:');
    textBlocks.slice(0, 5).forEach((block, index) => {
      console.log(`  [${index + 1}] 长度: ${block.text.length}, 内容: "${block.text.substring(0, 100)}${block.text.length > 100 ? '...' : ''}"`);
    });
  }
  
  // 批量检测文本（降低最小长度限制，从10改为5）
  const textItems = textBlocks.filter(item => item.text.length > 5); // 降低过滤阈值
  console.log(`📊 过滤后剩余 ${textItems.length} 个文本项（长度>5）`);
  
  if (textItems.length > 0) {
    console.log(`准备检测 ${textItems.length} 个文本项`);
    
    // 使用批量请求：每次5个文本（避免响应超过 token 限制）
    const batchSize = 5; // 减小批次避免 MAX_TOKENS 错误
    
    for (let i = 0; i < textItems.length; i += batchSize) {
      const batch = textItems.slice(i, i + batchSize);
      
      console.log(`📤 正在发送批量请求: 第 ${i + 1}-${Math.min(i + batchSize, textItems.length)} 项`);
      
      try {
        const results = await detector.detectTextBatch(batch);
        
        console.log(`📋 检测结果数组长度: ${results.length}, batch长度: ${batch.length}`);
        
        // 处理检测结果 - 使用 for 循环确保索引对齐
        for (let index = 0; index < results.length; index++) {
          const result = results[index];
          
          // 跳过 undefined 或 null 结果
          if (!result) {
            console.log(`⏭️ 索引 ${index}: 结果为空，跳过`);
            continue;
          }
          
          if (result.shouldBlock) {
            const item = batch[index];
            if (item && item.element) {
              console.log(`🔒 索引 ${index}: 准备屏蔽文本元素 (类别: ${result.category})`);
              // 使用精确屏蔽：只屏蔽 {{}} 内的内容
              blockTextElementPrecise(item.element, result);
            } else {
              console.warn(`⚠️ 索引 ${index}: batch[${index}] 缺少 element 属性`, item);
            }
          } else {
            console.log(`✅ 索引 ${index}: 内容安全，不屏蔽 (类别: ${result.category || 'safe'})`);
          }
        }
        
        console.log(`✅ 已处理 ${Math.min(i + batchSize, textItems.length)}/${textItems.length} 项`);
      } catch (error) {
        console.error('❌ 批量文本检测失败:', error);
      }
      
      // 批量请求间隔
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    console.log(`🎉 文本检测完成！共检测 ${textItems.length} 项`);
  }
  
  // 扫描图片
  const images = Array.from(document.querySelectorAll('img'));
  console.log(`找到 ${images.length} 个图片`);
  
  // gemini-2.5-flash 支持图片检测且无配额限制
  if (images.length > 0) {
    for (const img of images) {
      if (!img.src || img.src.startsWith('data:')) continue;
      
      try {
        const result = await detector.detectImage(img.src, img);
        
        if (result.shouldBlock) {
          blockImageElement(img, result);
        }
      } catch (error) {
        console.error('图片检测失败:', error);
      }
      
      // 适当延迟避免过快请求
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
  
  console.log('页面扫描完成');
  updateStatsFromDetector();
}

/**
 * 获取所有包含 Shadow DOM 的元素
 * @param {Element} root - 根元素
 * @returns {Array<Element>} 包含 Shadow DOM 的元素数组
 */
function getAllElementsWithShadowDOM(root) {
  const shadowHosts = [];
  const allElements = root.querySelectorAll('*');
  
  for (const element of allElements) {
    if (element.shadowRoot) {
      shadowHosts.push(element);
      // 递归查找 Shadow DOM 中的 Shadow DOM
      const nestedHosts = getAllElementsWithShadowDOM(element.shadowRoot);
      shadowHosts.push(...nestedHosts);
    }
  }
  
  return shadowHosts;
}

/**
 * 递归获取所有元素，包括 Shadow DOM 中的元素
 * @param {Element|ShadowRoot} root - 根元素或 Shadow Root
 * @returns {Array<Element>} 所有元素数组
 */
function getAllElementsIncludingShadowDOM(root) {
  const elements = [];
  
  // 遍历当前层级的所有元素
  const walker = document.createTreeWalker(
    root,
    NodeFilter.SHOW_ELEMENT,
    null
  );
  
  let node;
  while (node = walker.nextNode()) {
    elements.push(node);
    
    // 如果元素有 Shadow DOM，递归获取其中的元素
    if (node.shadowRoot) {
      console.log(`🔍 发现 Shadow DOM: ${node.tagName}`);
      const shadowElements = getAllElementsIncludingShadowDOM(node.shadowRoot);
      elements.push(...shadowElements);
    }
  }
  
  return elements;
}

/**
 * 在元素及其 Shadow DOM 中查找所有匹配选择器的元素
 * @param {Element|ShadowRoot} root - 根元素或 Shadow Root
 * @param {string} selector - CSS 选择器
 * @returns {Array<Element>} 匹配的元素数组
 */
function querySelectorAllDeep(root, selector) {
  const elements = [];
  
  // 在当前层级查找
  if (root.querySelectorAll) {
    elements.push(...root.querySelectorAll(selector));
  }
  
  // 遍历所有元素，查找 Shadow DOM
  const allElements = root.querySelectorAll ? Array.from(root.querySelectorAll('*')) : [];
  
  for (const element of allElements) {
    if (element.shadowRoot) {
      // 递归查找 Shadow DOM 中的元素
      const shadowElements = querySelectorAllDeep(element.shadowRoot, selector);
      elements.push(...shadowElements);
    }
  }
  
  // 如果 root 本身是 ShadowRoot，也检查其 host 的 Shadow DOM
  if (root instanceof ShadowRoot && root.host) {
    const hostElements = Array.from(root.host.querySelectorAll('*'));
    for (const element of hostElements) {
      if (element.shadowRoot && element !== root.host) {
        const shadowElements = querySelectorAllDeep(element.shadowRoot, selector);
        elements.push(...shadowElements);
      }
    }
  }
  
  return elements;
}

/**
 * 获取文本块（块级元素聚合 + Shadow DOM 支持）
 * @param {Element} element - 根元素
 * @returns {Array<Object>} 文本块数组 [{text: string, element: Element, children: Element[]}]
 */
function getTextBlocks(element) {
  const blocks = [];
  const processedElements = new Set();
  
  // 块级元素列表（优先级从高到低）
  // 添加常见的 Web Components 标签（如 Bilibili 的 bili-rich-text）
  const blockSelectors = [
    'p', 'div', 'li', 'td', 'th', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'article', 'section', 'blockquote', 'pre', 'span', 'a', 'label',
    // Web Components (自定义元素) - 常见社交媒体平台
    'bili-rich-text',        // Bilibili 评论文本
    'bili-comment-renderer', // Bilibili 评论渲染器
    'ytd-comment-renderer',  // YouTube 评论
    'shreddit-comment',      // Reddit 评论
    '[data-e2e="comment-level-1"]', // TikTok 评论
    '[data-testid="tweet"]'  // Twitter/X 推文
  ];
  
  console.log('🔍 开始提取文本块（包括 Shadow DOM）...');
  
  // 遍历块级元素（包括 Shadow DOM）
  for (const selector of blockSelectors) {
    // 使用深度查询，包括 Shadow DOM
    const elements = querySelectorAllDeep(element, selector);
    
    if (elements.length > 0) {
      console.log(`📝 [${selector}] 找到 ${elements.length} 个元素（含 Shadow DOM）`);
    }
    
    for (const el of elements) {
      // 跳过已处理的元素
      if (processedElements.has(el)) continue;
      
      // 跳过特殊标签
      const tagName = el.tagName.toLowerCase();
      if (['script', 'style', 'noscript', 'iframe', 'svg'].includes(tagName)) {
        continue;
      }
      
      // 获取元素的直接文本内容（不包括子元素）
      const directText = getDirectText(el);
      
      if (directText.trim().length > 0) {
        // 检查是否被父元素包含
        let isContainedByProcessed = false;
        for (const processed of processedElements) {
          if (processed.contains(el) && processed !== el) {
            isContainedByProcessed = true;
            break;
          }
        }
        
        if (!isContainedByProcessed) {
          blocks.push({
            text: directText.trim(),
            element: el,
            children: getChildTextElements(el)
          });
          
          processedElements.add(el);
        }
      }
    }
  }
  
  console.log(`✅ 提取完成: ${blocks.length} 个文本块`);
  
  // 额外调试：显示文本长度分布
  const lengthDistribution = {
    '0-10': 0,
    '11-50': 0,
    '51-100': 0,
    '101-500': 0,
    '500+': 0
  };
  
  blocks.forEach(block => {
    const len = block.text.length;
    if (len <= 10) lengthDistribution['0-10']++;
    else if (len <= 50) lengthDistribution['11-50']++;
    else if (len <= 100) lengthDistribution['51-100']++;
    else if (len <= 500) lengthDistribution['101-500']++;
    else lengthDistribution['500+']++;
  });
  
  console.log('📊 文本块长度分布:', lengthDistribution);
  
  return blocks;
}

/**
 * 获取元素的直接文本（包括所有子元素的文本，但合并为一个整体）
 * 特别处理 Shadow DOM 中的内容
 * @param {Element} element - DOM 元素
 * @returns {string} 文本内容
 */
function getDirectText(element) {
  let text = '';
  
  // 特殊处理：Bilibili 的 bili-rich-text 元素
  if (element.tagName && element.tagName.toLowerCase() === 'bili-rich-text') {
    if (element.shadowRoot) {
      const contentsEl = element.shadowRoot.querySelector('#contents');
      if (contentsEl) {
        text = contentsEl.textContent || '';
      }
    }
  }
  
  // 如果没有获取到文本，使用通用方法
  if (!text) {
    // 优先使用 textContent，因为 innerText 在某些情况下可能为空
    // innerText 会考虑 CSS 样式（如 display:none），而 textContent 不会
    text = element.textContent || element.innerText || '';
  }
  
  // 清理多余空白，但保留必要的空格
  text = text
    .replace(/\s+/g, ' ')  // 多个空白字符替换为单个空格
    .replace(/\n+/g, ' ')  // 换行替换为空格
    .trim();
  
  return text;
}

/**
 * 获取元素内的子文本元素（用于精确定位）
 * @param {Element} element - 父元素
 * @returns {Array<Element>} 子元素数组
 */
function getChildTextElements(element) {
  const children = [];
  const walker = document.createTreeWalker(
    element,
    NodeFilter.SHOW_ELEMENT,
    {
      acceptNode: function(node) {
        if (node === element) return NodeFilter.FILTER_SKIP;
        if (['script', 'style', 'noscript'].includes(node.tagName.toLowerCase())) {
          return NodeFilter.FILTER_REJECT;
        }
        if (node.textContent.trim().length > 0) {
          return NodeFilter.FILTER_ACCEPT;
        }
        return NodeFilter.FILTER_SKIP;
      }
    }
  );
  
  let node;
  while (node = walker.nextNode()) {
    children.push(node);
  }
  
  return children;
}

/**
 * 获取所有文本节点（旧方法 - 已被 getTextBlocks() 替代）
 * @deprecated 不再使用，请使用 getTextBlocks() 以获得更好的批量检测性能
 * @param {Element} element - 根元素
 * @returns {Array<Node>} 文本节点数组
 */
function getTextNodes(element) {
  const textNodes = [];
  const walker = document.createTreeWalker(
    element,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode: function(node) {
        // 过滤掉脚本、样式等标签中的文本
        const parent = node.parentElement;
        if (!parent) return NodeFilter.FILTER_REJECT;
        
        const tagName = parent.tagName.toLowerCase();
        if (['script', 'style', 'noscript', 'iframe'].includes(tagName)) {
          return NodeFilter.FILTER_REJECT;
        }
        
        // 过滤空白文本
        if (!node.textContent.trim()) {
          return NodeFilter.FILTER_REJECT;
        }
        
        return NodeFilter.FILTER_ACCEPT;
      }
    }
  );
  
  let node;
  while (node = walker.nextNode()) {
    textNodes.push(node);
  }
  
  return textNodes;
}

// 监听动态内容
function observeDynamicContent() {
  // 主文档观察器
  const mainObserver = new MutationObserver((mutations) => {
    if (!isEnabled) return;
    
    mutations.forEach(mutation => {
      mutation.addedNodes.forEach(node => {
        if (node.nodeType === Node.ELEMENT_NODE) {
          // 将新节点添加到处理队列
          queueForProcessing(node);
          
          // 如果新节点有 Shadow DOM，也监听它
          if (node.shadowRoot) {
            console.log(`🔍 发现新的 Shadow DOM: ${node.tagName}`);
            observeShadowRoot(node.shadowRoot);
          }
        }
      });
    });
  });
  
  mainObserver.observe(document.body, {
    childList: true,
    subtree: true
  });
  
  // 查找并监听现有的 Shadow DOM
  observeExistingShadowRoots();
}

/**
 * 监听现有的所有 Shadow DOM
 */
function observeExistingShadowRoots() {
  const allElements = document.querySelectorAll('*');
  allElements.forEach(element => {
    if (element.shadowRoot) {
      console.log(`🔍 监听现有 Shadow DOM: ${element.tagName}`);
      observeShadowRoot(element.shadowRoot);
    }
  });
}

/**
 * 监听 Shadow DOM 中的变化
 * @param {ShadowRoot} shadowRoot - Shadow Root 对象
 */
function observeShadowRoot(shadowRoot) {
  const shadowObserver = new MutationObserver((mutations) => {
    if (!isEnabled) return;
    
    console.log(`📝 Shadow DOM 内容变化: ${mutations.length} 个 mutation`);
    
    mutations.forEach(mutation => {
      mutation.addedNodes.forEach(node => {
        if (node.nodeType === Node.ELEMENT_NODE) {
          queueForProcessing(node);
          
          // 递归监听嵌套的 Shadow DOM
          if (node.shadowRoot) {
            observeShadowRoot(node.shadowRoot);
          }
        }
      });
    });
  });
  
  shadowObserver.observe(shadowRoot, {
    childList: true,
    subtree: true
  });
  
  // 立即扫描 Shadow DOM 中的现有内容
  setTimeout(() => {
    const shadowElements = shadowRoot.querySelectorAll('*');
    shadowElements.forEach(el => {
      const text = el.textContent?.trim();
      if (text && text.length > 10) {
        queueForProcessing(el);
      }
    });
  }, 2000); // 延迟2秒等待动态内容加载
}

// 添加到处理队列
function queueForProcessing(element) {
  // ===== 实时检测模式：立即处理弹幕等实时内容 =====
  if (window.realtimeDetector && isRealtimeContent(element)) {
    console.log('⚡ 实时检测模式：立即处理');
    processRealtimeElement(element);
    return; // 不添加到队列，立即处理
  }
  
  // 标准模式：添加到批量处理队列
  processingQueue.push(element);
  
  // 使用防抖处理队列
  if (!isProcessing) {
    isProcessing = true;
    setTimeout(processQueue, settings.detectionDelay || 1000);
  }
}

/**
 * 判断是否为实时内容（弹幕、评论等）
 * @param {Element} element - DOM元素
 * @returns {boolean}
 */
function isRealtimeContent(element) {
  const classNames = element.className || '';
  const id = element.id || '';
  const tagName = element.tagName?.toLowerCase() || '';
  
  // 弹幕相关类名和标签
  const realtimePatterns = [
    /danmaku|danmu|弹幕/i,           // 弹幕
    /live-comment|直播评论/i,         // 直播评论
    /chat-message|聊天消息/i,         // 聊天消息
    /instant-comment|即时评论/i,      // 即时评论
    /bullet-chat/i                   // 子弹评论（弹幕别名）
  ];
  
  // 检查类名、ID 和标签名
  const text = `${classNames} ${id} ${tagName}`;
  return realtimePatterns.some(pattern => pattern.test(text));
}

/**
 * 实时处理单个元素（低延迟）
 * @param {Element} element - DOM元素
 */
async function processRealtimeElement(element) {
  try {
    const text = element.textContent?.trim();
    if (!text || text.length < 3) return; // 过滤太短的文本
    
    // 使用实时检测器
    const result = await window.realtimeDetector.detect(text, element, {
      elementId: element.id || 'realtime-' + Date.now()
    });
    
    if (result.shouldBlock) {
      console.log(`⚡ 实时拦截 (${result.responseTime || 0}ms):`, text.substring(0, 30));
      
      // 实时检测使用整体屏蔽（因为没有 maskedText）
      blockRealtimeElement(element, result);
    }
    
  } catch (error) {
    console.error('⚡ 实时检测失败:', error);
  }
}

/**
 * 屏蔽实时内容元素（整体隐藏或标记）
 * @param {Element} element - DOM元素
 * @param {Object} result - 检测结果
 */
function blockRealtimeElement(element, result) {
  if (!element || blockedElements.has(element)) return;
  
  console.log('⚡ 屏蔽实时内容:', {
    element: element.tagName,
    category: result.category,
    source: result.source
  });
  
  // 方案1：完全隐藏元素（推荐用于弹幕）
  element.style.display = 'none';
  element.classList.add('safeguard-blocked-realtime');
  
  // 方案2：如果需要保留占位，使用遮罩
  // const originalDisplay = element.style.display;
  // element.style.filter = 'blur(10px)';
  // element.style.opacity = '0.3';
  // element.style.pointerEvents = 'none';
  
  // 添加提示标签（可选）
  const badge = document.createElement('span');
  badge.className = 'safeguard-realtime-badge';
  badge.textContent = '🔒';
  badge.style.cssText = `
    position: absolute;
    top: 0;
    left: 0;
    background: rgba(231, 76, 60, 0.9);
    color: white;
    padding: 2px 6px;
    border-radius: 3px;
    font-size: 12px;
    z-index: 9999;
  `;
  
  // 如果元素有相对定位父元素，添加徽章
  if (element.parentElement) {
    element.parentElement.style.position = 'relative';
    // element.parentElement.appendChild(badge);
  }
  
  // 记录到 blockedElements
  blockedElements.set(element, {
    type: 'realtime',
    category: result.category,
    source: result.source,
    timestamp: Date.now(),
    originalText: element.textContent
  });
  
  // 更新统计
  statistics.total++;
  if (result.category === 'privacy') statistics.privacy++;
  else if (result.category === 'sensitive') statistics.sensitive++;
  else if (result.category === 'harmful') statistics.harmful++;
  
  updateStatsDisplay(statistics.total);
  
  // 保存实时检测日志
  saveRealtimeDetectionLog({
    originalText: element.textContent.substring(0, 200),
    category: result.category,
    source: result.source,
    responseTime: result.responseTime || 0,
    url: window.location.href,
    timestamp: Date.now()
  });
  
  console.log('✅ 实时内容已屏蔽');
}

// 处理队列（新方法：使用批量检测）
async function processQueue() {
  if (processingQueue.length === 0) {
    isProcessing = false;
    return;
  }
  
  if (!detector) {
    console.warn('检测器未初始化');
    processingQueue = [];
    isProcessing = false;
    return;
  }
  
  const elements = processingQueue.splice(0, 10); // 每次处理10个元素
  console.log('🔄 处理动态新增元素:', elements.length);
  
  // 收集所有文本块
  const textItems = [];
  const imageItems = [];
  
  for (const element of elements) {
    try {
      // 从新增元素中提取文本块
      const blocks = getTextBlocks(element);
      textItems.push(...blocks.filter(item => item.text.length > 10));
      
      // 收集图片
      const images = element.querySelectorAll('img');
      imageItems.push(...Array.from(images).filter(img => img.src && !img.src.startsWith('data:')));
    } catch (error) {
      console.error('❌ 提取元素内容失败:', error);
    }
  }
  
  // 批量检测文本
  if (textItems.length > 0) {
    console.log(`📦 批量检测新增文本: ${textItems.length} 项`);
    try {
      const results = await detector.detectTextBatch(textItems);
      results.forEach((result, index) => {
        if (result.shouldBlock) {
          blockTextElementPrecise(textItems[index].element, result);
        }
      });
    } catch (error) {
      console.error('❌ 批量文本检测失败:', error);
    }
  }
  
  // 检测图片
  if (imageItems.length > 0) {
    console.log(`🖼️ 检测新增图片: ${imageItems.length} 项`);
    for (const img of imageItems) {
      try {
        const result = await detector.detectImage(img.src, img);
        if (result.shouldBlock) {
          blockImageElement(img, result);
        }
        await new Promise(resolve => setTimeout(resolve, 500)); // 图片检测间隔
      } catch (error) {
        console.error('❌ 图片检测失败:', error);
      }
    }
  }
  
  updateStatsFromDetector();
  
  isProcessing = false;
  if (processingQueue.length > 0) {
    setTimeout(processQueue, 100);
  }
}

// 创建浮动统计显示
function createFloatingStats() {
  const statsDiv = document.createElement('div');
  statsDiv.id = 'safeguard-floating-stats';
  statsDiv.className = 'safeguard-floating-stats';
  
  // 先用占位符 {count} 获取翻译模板
  let template;
  if (typeof i18n !== 'undefined' && i18n.t) {
    try {
      template = i18n.t('content.blockedItems', { count: '{COUNT_PLACEHOLDER}' });
    } catch (err) {
      template = '已屏蔽 {COUNT_PLACEHOLDER} 项';
    }
  } else {
    template = '已屏蔽 {COUNT_PLACEHOLDER} 项';
  }
  
  // 将占位符替换为 <span> 元素
  const statsHtml = template.replace('{COUNT_PLACEHOLDER}', '<span id="safeguard-block-count">0</span>');

  statsDiv.innerHTML = `
    <div class="safeguard-stats-icon">🛡️</div>
    <div class="safeguard-stats-text">${statsHtml}</div>
  `;
  
  document.body.appendChild(statsDiv);
  
  // 注意：统一由 safeguard-i18n-ready 事件处理刷新，不再需要 setTimeout
}

// 更新统计显示
function updateStatsDisplay(count) {
  const countElement = document.getElementById('safeguard-block-count');
  if (countElement) {
    countElement.textContent = count;
  }
}

// 显示通知
function showNotification(message, type = 'info') {
  const notification = document.createElement('div');
  notification.className = `safeguard-notification safeguard-notification-${type}`;
  notification.textContent = message;
  
  document.body.appendChild(notification);
  
  setTimeout(() => {
    notification.style.opacity = '0';
    setTimeout(() => notification.remove(), 300);
  }, 3000);
}

// 监听来自 background 的消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  switch (request.action) {
    case 'revealAll':
      revealAllBlocked(request.duration);
      sendResponse({ success: true });
      break;
      
    case 'toggleEnabled':
      isEnabled = request.enabled;
      if (isEnabled) {
        startScanning();
      } else {
        // 移除所有屏蔽
        blockedElements.forEach((data, element) => {
          removeBlockMask(element);
        });
        blockedElements.clear();
      }
      sendResponse({ success: true });
      break;
  }
});

// 临时显示所有被屏蔽内容
function revealAllBlocked(duration) {
  blockedElements.forEach((data, element) => {
    element.classList.add('safeguard-revealed');
  });
  
  setTimeout(() => {
    blockedElements.forEach((data, element) => {
      element.classList.remove('safeguard-revealed');
    });
  }, duration);
}

// 移除屏蔽遮罩
function removeBlockMask(element) {
  element.classList.remove('safeguard-blocked-text', 'safeguard-blocked-image');
  const mask = element.querySelector('.safeguard-mask');
  if (mask) mask.remove();
}

/**
 * 精确屏蔽文本（只屏蔽 {{}} 内的内容）
 * @param {Element} element - 包含文本的元素
 * @param {Object} result - 检测结果 {maskedText: string, category: string}
 */
function blockTextElementPrecise(element, result) {
  if (!element) {
    console.warn('⚠️ blockTextElementPrecise: element 为空');
    return;
  }
  
  if (blockedElements.has(element)) {
    console.warn('⚠️ 元素已被屏蔽，跳过:', {
      element: element.tagName,
      previousCategory: blockedElements.get(element).category,
      newCategory: result.category,
      elementId: element.id || '(无ID)',
      elementClass: element.className || '(无class)'
    });
    return;
  }
  
  console.log('🎯 精确屏蔽模式:', {
    element: element.tagName,
    category: result.category,
    hasmaskedText: !!result.maskedText,
    hasMasked_text: !!result.masked_text,
    resultKeys: Object.keys(result)
  });
  
  // 从 maskedText 中提取需要屏蔽的片段（支持两种命名）
  const maskedText = result.maskedText || result.masked_text || '';
  
  if (!maskedText) {
    console.warn('⚠️ 结果中没有 maskedText 字段，完整结果:', result);
    return;
  }
  
  console.log('📝 maskedText 内容:', maskedText.substring(0, 200));
  
  const sensitiveParts = extractSensitiveParts(maskedText);
  
  if (sensitiveParts.length === 0) {
    console.warn('⚠️ 未找到 {{}} 标记的敏感内容，maskedText:', maskedText);
    return;
  }
  
  console.log(`🔍 找到 ${sensitiveParts.length} 个敏感片段:`, sensitiveParts);
  
  // 获取元素的文本内容
  const originalText = element.innerText || element.textContent;
  console.log('📄 元素原始文本 (innerText):', originalText.substring(0, 200));
  
  // 检查敏感内容是否存在于元素中
  sensitiveParts.forEach(sensitive => {
    const found = originalText.includes(sensitive);
    console.log(`🔎 检查 "${sensitive}" 是否在元素中: ${found ? '✅ 找到' : '❌ 未找到'}`);
  });
  
  // 打印元素的 HTML 结构（前 500 字符）
  console.log('🏗️ 元素 HTML 结构:', element.innerHTML?.substring(0, 500));
  
  // 遍历文本节点，查找并替换敏感内容
  replaceTextInElement(element, sensitiveParts, result.category);
  
  // 使用 Map.set() 而不是 Set.add()
  blockedElements.set(element, {
    category: result.category,
    sensitiveParts: sensitiveParts,
    timestamp: Date.now()
  });
  
  // 更新统计
  const oldTotal = statistics.total;
  statistics.total++;
  if (result.category === 'privacy') statistics.privacy++;
  else if (result.category === 'sensitive') statistics.sensitive++;
  else if (result.category === 'harmful') statistics.harmful++;
  
  console.log(`📊 统计更新: ${oldTotal} → ${statistics.total} (类别: ${result.category})`);
  
  // 立即更新显示
  updateStatsDisplay(statistics.total);
  
  // 保存日志
  saveTextDetectionLog({
    originalText: originalText.substring(0, 200), // 只保存前200字符
    sensitiveParts: sensitiveParts,
    category: result.category,
    confidence: result.confidence || 0.8,
    url: window.location.href,
    timestamp: Date.now()
  });
}

/**
 * 从 maskedText 中提取 {{}} 内的敏感内容
 * @param {string} maskedText - 带有 {{}} 标记的文本
 * @returns {Array<string>} 敏感内容数组（去重）
 */
function extractSensitiveParts(maskedText) {
  const parts = [];
  const regex = /\{\{(.+?)\}\}/g;
  let match;
  
  while ((match = regex.exec(maskedText)) !== null) {
    parts.push(match[1]); // match[1] 是括号内的内容
  }
  
  // 去重：同一个敏感词可能在文本中多次出现
  return [...new Set(parts)];
}

/**
 * 在元素中查找并替换敏感文本为遮罩（支持跨节点匹配）
 * @param {Element} element - 目标元素
 * @param {Array<string>} sensitiveParts - 需要屏蔽的文本片段
 * @param {string} category - 内容类别
 */
function replaceTextInElement(element, sensitiveParts, category) {
  console.log('🔄 开始替换文本节点（跨节点匹配模式），敏感片段:', sensitiveParts);
  
  // 收集所有文本节点
  const textNodes = [];
  const walker = document.createTreeWalker(
    element,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode: function(node) {
        if (node.parentElement?.classList.contains('safeguard-inline-mask')) {
          return NodeFilter.FILTER_REJECT;
        }
        if (!node.textContent.trim()) {
          return NodeFilter.FILTER_REJECT;
        }
        return NodeFilter.FILTER_ACCEPT;
      }
    }
  );
  
  let node;
  while (node = walker.nextNode()) {
    textNodes.push(node);
  }
  
  console.log(`📋 找到 ${textNodes.length} 个文本节点`);
  
  if (textNodes.length === 0) {
    console.warn('⚠️ 没有可用的文本节点');
    return;
  }
  
  // 合并所有文本节点的内容
  const mergedText = textNodes.map(n => n.textContent).join('');
  console.log('📝 合并后的文本:', mergedText.substring(0, 300));
  
  // 构建节点位置映射表：字符索引 -> 节点信息
  const charToNodeMap = buildCharToNodeMap(textNodes);
  
  let replacedCount = 0;
  
  // 对每个敏感片段进行匹配
  sensitiveParts.forEach((sensitive, partIndex) => {
    console.log(`\n🔍 处理敏感片段 ${partIndex + 1}/${sensitiveParts.length}: "${sensitive}"`);
    
    // 在合并文本中查找所有匹配位置
    let matches = findAllMatches(mergedText, sensitive);
    
    if (matches.length === 0) {
      console.warn(`⚠️ 未找到 "${sensitive}"`);
      return;
    }
    
    // 为避免替换时节点结构被前面匹配修改，按起始位置从大到小处理
    matches.sort((a, b) => b.start - a.start);
    // 过滤掉重叠/相邻（共享字符）的匹配，防止对同一片段重复替换导致节点被多次移除
    const filtered = [];
    let lastStart = Infinity;
    for (const m of matches) {
      if (m.end <= lastStart) {
        filtered.push(m);
        lastStart = m.start;
      } else {
        console.log('  ↩︎ 跳过重叠匹配:', m);
      }
    }
    matches = filtered;
    
    console.log(`✅ 找到 ${matches.length} 个匹配位置:`, matches);
    
    // 处理每个匹配
    matches.forEach((match, matchIndex) => {
      console.log(`\n  🎯 处理匹配 ${matchIndex + 1}: 位置 ${match.start}-${match.end}, 内容 "${match.text}"`);
      
      // 查找该匹配跨越的所有节点
      const affectedNodes = findAffectedNodes(charToNodeMap, match.start, match.end);
      
      if (affectedNodes.length === 0) {
        console.warn(`  ⚠️ 未找到受影响的节点`);
        return;
      }
      
      console.log(`  📍 跨越 ${affectedNodes.length} 个节点:`, 
        affectedNodes.map(n => `节点${n.nodeIndex}[${n.startOffset}-${n.endOffset}]`)
      );
      
      // 替换这些节点
  const replaced = replaceAcrossNodes(affectedNodes, match.text, category);
      
      if (replaced) {
        replacedCount++;
        console.log(`  ✅ 成功替换`);
      } else {
        console.warn(`  ❌ 替换失败`);
      }
    });
  });
  
  console.log(`\n🎉 文本替换完成，共替换 ${replacedCount} 个匹配项`);
}

/**
 * 构建字符索引到节点的映射表
 * @param {Array<Node>} textNodes - 文本节点数组
 * @returns {Array<Object>} 映射表
 */
function buildCharToNodeMap(textNodes) {
  const map = [];
  let globalOffset = 0;
  
  textNodes.forEach((node, nodeIndex) => {
    const text = node.textContent;
    const length = text.length;
    
    map.push({
      nodeIndex: nodeIndex,
      node: node,
      startChar: globalOffset,
      endChar: globalOffset + length,
      length: length,
      text: text
    });
    
    globalOffset += length;
  });
  
  return map;
}

/**
 * 在文本中查找所有匹配（支持忽略大小写、空白等）
 * @param {string} text - 搜索文本
 * @param {string} pattern - 匹配模式
 * @returns {Array<Object>} 匹配结果 [{start, end, text}]
 */
function findAllMatches(text, pattern) {
  const matches = [];
  
  // 尝试多种匹配模式
  const patterns = [
    { regex: new RegExp(escapeRegExp(pattern), 'g'), name: '精确匹配' },
    { regex: new RegExp(escapeRegExp(pattern), 'gi'), name: '忽略大小写' },
    { regex: new RegExp(escapeRegExp(pattern).replace(/\s+/g, '\\s*'), 'gi'), name: '忽略空白' }
  ];
  
  for (const { regex, name } of patterns) {
    let match;
    while ((match = regex.exec(text)) !== null) {
      const isDuplicate = matches.some(m => m.start === match.index);
      if (!isDuplicate) {
        matches.push({
          start: match.index,
          end: match.index + match[0].length,
          text: match[0],
          pattern: name
        });
        console.log(`  ✓ ${name}: 位置 ${match.index}, 内容 "${match[0]}"`);
      }
    }
    
    if (matches.length > 0) {
      break; // 找到匹配就停止尝试其他模式
    }
  }
  
  return matches;
}

/**
 * 查找受影响的节点（匹配跨越的节点）
 * @param {Array<Object>} charToNodeMap - 字符映射表
 * @param {number} startChar - 开始字符位置
 * @param {number} endChar - 结束字符位置
 * @returns {Array<Object>} 受影响的节点信息
 */
function findAffectedNodes(charToNodeMap, startChar, endChar) {
  const affected = [];
  
  for (const nodeInfo of charToNodeMap) {
    // 检查该节点是否与匹配范围有交集
    if (nodeInfo.endChar <= startChar || nodeInfo.startChar >= endChar) {
      continue; // 无交集
    }
    
    // 计算交集范围
    const overlapStart = Math.max(nodeInfo.startChar, startChar);
    const overlapEnd = Math.min(nodeInfo.endChar, endChar);
    
    // 计算在该节点内的偏移量
    const startOffset = overlapStart - nodeInfo.startChar;
    const endOffset = overlapEnd - nodeInfo.startChar;
    
    affected.push({
      nodeIndex: nodeInfo.nodeIndex,
      node: nodeInfo.node,
      startOffset: startOffset,
      endOffset: endOffset,
      text: nodeInfo.text.substring(startOffset, endOffset)
    });
  }
  
  return affected;
}

/**
 * 跨节点替换文本为遮罩
 * @param {Array<Object>} affectedNodes - 受影响的节点
 * @param {string} originalText - 原始文本（用于显示）
 * @param {string} category - 类别
 * @returns {boolean} 是否成功
 */
function replaceAcrossNodes(affectedNodes, originalText, category) {
  if (affectedNodes.length === 0) return false;
  
  try {
    if (affectedNodes.length === 1) {
      // 单节点情况：简单替换
      const nodeInfo = affectedNodes[0];
      const node = nodeInfo.node;
      const text = node.textContent;
      
      const before = text.substring(0, nodeInfo.startOffset);
      const after = text.substring(nodeInfo.endOffset);
      
      console.log(`  🔧 单节点替换详情:`, {
        原始文本长度: text.length,
        before长度: before.length,
        after长度: after.length,
        要替换的内容: nodeInfo.text,
        节点父元素: node.parentNode?.tagName
      });
      
      // 创建容器（使用 DOM API 而不是 innerHTML 避免内容丢失）
      const container = document.createElement('span');
      container.style.display = 'inline';
      
      // 添加前面的文本
      if (before) {
        container.appendChild(document.createTextNode(before));
      }
      
      // 创建遮罩元素
      const maskSpan = document.createElement('span');
      maskSpan.className = 'safeguard-inline-mask';
      maskSpan.setAttribute('data-original', escapeHtml(originalText));
      maskSpan.setAttribute('data-category', category);
      // 本地化的提示文字（遮罩前置文本）和 title
      const beforeLabel = (typeof i18n !== 'undefined' && i18n.t)
        ? (category === 'privacy' ? i18n.t('content.privacyBlocked') : category === 'sensitive' ? i18n.t('content.sensitiveBlocked') : category === 'harmful' ? i18n.t('content.harmfulBlocked') : i18n.t('content.textBlocked'))
        : (category === 'privacy' ? '隐私信息' : category === 'sensitive' ? '敏感内容' : category === 'harmful' ? '有害内容' : '屏蔽内容');
      maskSpan.setAttribute('data-before', escapeHtml(beforeLabel));
      const titleLabel = (typeof i18n !== 'undefined' && i18n.t) ? i18n.t('content.clickToReveal') : '点击查看';
      maskSpan.title = titleLabel;
      maskSpan.addEventListener('click', function(e) {
        e.stopPropagation();
        this.classList.toggle('revealed');
      });
      container.appendChild(maskSpan);
      
      // 添加后面的文本
      if (after) {
        container.appendChild(document.createTextNode(after));
      }
      
      // 替换节点
      if (node.parentNode) {
        node.parentNode.replaceChild(container, node);
        console.log(`  ✅ 单节点替换成功`);
      } else {
        console.warn(`  ⚠️ 节点没有父节点，无法替换`);
        return false;
      }
      
    } else {
      // 多节点情况：需要更复杂的处理
      console.log(`  📝 多节点替换 (${affectedNodes.length} 个节点)`);
      
      // 找到共同的父容器
      const commonParent = findCommonParent(affectedNodes.map(n => n.node));
      
      if (!commonParent) {
        console.warn(`  ⚠️ 未找到共同父节点`);
        return false;
      }
      
      // 创建遮罩元素
      const maskSpan = document.createElement('span');
      maskSpan.className = 'safeguard-inline-mask';
      maskSpan.setAttribute('data-original', escapeHtml(originalText));
      maskSpan.setAttribute('data-category', category);  // 保存类别用于 CSS
      const beforeLabel2 = (typeof i18n !== 'undefined' && i18n.t)
        ? (category === 'privacy' ? i18n.t('content.privacyBlocked') : category === 'sensitive' ? i18n.t('content.sensitiveBlocked') : category === 'harmful' ? i18n.t('content.harmfulBlocked') : i18n.t('content.textBlocked'))
        : (category === 'privacy' ? '隐私信息' : category === 'sensitive' ? '敏感内容' : category === 'harmful' ? '有害内容' : '屏蔽内容');
      maskSpan.setAttribute('data-before', escapeHtml(beforeLabel2));
      const titleLabel2 = (typeof i18n !== 'undefined' && i18n.t) ? i18n.t('content.clickToReveal') : '点击查看';
      maskSpan.title = titleLabel2;
      
      // 不设置 textContent，完全由 CSS ::before 控制图标显示
      // 这样点击后切换 revealed 类时，CSS 可以完全控制显示内容
      
      maskSpan.addEventListener('click', function(e) {
        e.stopPropagation();
        e.preventDefault(); // 防止触发父元素（如链接）的默认行为
        
        this.classList.toggle('revealed');
        
        // 检测是否在链接内，如果是则添加跳转按钮
        const linkParent = this.closest('a');
        if (linkParent && this.classList.contains('revealed')) {
          // 检查是否已经添加了跳转按钮
          const existingLink = this.querySelector('.safeguard-original-link');
          if (!existingLink) {
            const linkBtn = document.createElement('a');
            linkBtn.className = 'safeguard-original-link';
            linkBtn.href = linkParent.href;
            linkBtn.target = linkParent.target || '_self';
            linkBtn.textContent = ' [跳转到原页面]';
            linkBtn.title = linkParent.href;
            linkBtn.addEventListener('click', (evt) => {
              evt.stopPropagation(); // 防止再次触发遮罩点击
            });
            this.appendChild(linkBtn);
          }
        } else if (!this.classList.contains('revealed')) {
          // 隐藏时移除跳转按钮
          const linkBtn = this.querySelector('.safeguard-original-link');
          if (linkBtn) {
            linkBtn.remove();
          }
        }
      });
      
      // 处理第一个节点（保留前面部分）
      const firstNode = affectedNodes[0];
      const firstText = firstNode.node.textContent;
      const beforeText = firstText.substring(0, firstNode.startOffset);
      
      if (beforeText) {
        const beforeSpan = document.createElement('span');
        beforeSpan.textContent = beforeText;
        firstNode.node.parentNode.replaceChild(beforeSpan, firstNode.node);
        beforeSpan.parentNode.insertBefore(maskSpan, beforeSpan.nextSibling);
      } else {
        firstNode.node.parentNode.replaceChild(maskSpan, firstNode.node);
      }
      
      // 隐藏中间的节点（保留 DOM 结构）
      for (let i = 1; i < affectedNodes.length - 1; i++) {
        const node = affectedNodes[i].node;
        if (node.parentNode) {
          // 创建隐藏的 span 包装节点内容
          const hiddenSpan = document.createElement('span');
          hiddenSpan.className = 'safeguard-masked-content';
          hiddenSpan.style.display = 'none';
          hiddenSpan.textContent = node.textContent;
          node.parentNode.replaceChild(hiddenSpan, node);
        }
      }
      
      // 处理最后一个节点（保留后面部分）
      if (affectedNodes.length > 1) {
        const lastNode = affectedNodes[affectedNodes.length - 1];
        const lastText = lastNode.node.textContent;
        const afterText = lastText.substring(lastNode.endOffset);
        
        if (afterText) {
          const afterSpan = document.createElement('span');
          afterSpan.textContent = afterText;
          lastNode.node.parentNode.replaceChild(afterSpan, lastNode.node);
        } else {
          // 保留空的 span 以维持 DOM 结构
          const placeholder = document.createElement('span');
          placeholder.className = 'safeguard-masked-content';
          placeholder.style.display = 'none';
          placeholder.textContent = lastNode.node.textContent;
          if (lastNode.node.parentNode) {
            lastNode.node.parentNode.replaceChild(placeholder, lastNode.node);
          }
        }
      }
      
      console.log(`  ✅ 已替换 ${affectedNodes.length} 个节点为单个遮罩`);
    }
    
    return true;
    
  } catch (error) {
    console.error(`  ❌ 替换失败:`, error);
    return false;
  }
}

/**
 * 查找多个节点的共同父节点
 * @param {Array<Node>} nodes - 节点数组
 * @returns {Node|null} 共同父节点
 */
function findCommonParent(nodes) {
  if (nodes.length === 0) return null;
  if (nodes.length === 1) return nodes[0].parentNode;
  
  // 获取第一个节点的所有祖先
  const ancestors = [];
  let current = nodes[0];
  while (current) {
    ancestors.push(current);
    current = current.parentNode;
  }
  
  // 从祖先列表中找到包含所有节点的最近祖先
  for (const ancestor of ancestors) {
    const containsAll = nodes.every(node => ancestor.contains(node));
    if (containsAll) {
      return ancestor;
    }
  }
  
  return null;
}

/**
 * 创建内联遮罩 HTML
 * @param {string} text - 原始文本
 * @param {string} category - 类别
 * @returns {string} HTML 字符串
 */
function createInlineMask(text, category) {
  // 不在 HTML 中直接写图标，完全由 CSS ::before 控制
  // 这样点击后切换 revealed 类时，CSS 可以完全控制显示内容
  const beforeLabel = (typeof i18n !== 'undefined' && i18n.t)
    ? (category === 'privacy' ? i18n.t('content.privacyBlocked') : category === 'sensitive' ? i18n.t('content.sensitiveBlocked') : category === 'harmful' ? i18n.t('content.harmfulBlocked') : i18n.t('content.textBlocked'))
    : (category === 'privacy' ? '隐私信息' : category === 'sensitive' ? '敏感内容' : category === 'harmful' ? '有害内容' : '屏蔽内容');
  const titleLabel = (typeof i18n !== 'undefined' && i18n.t) ? i18n.t('content.clickToReveal') : '点击查看';
  return `<span class="safeguard-inline-mask" data-original="${escapeHtml(text)}" data-category="${category}" data-before="${escapeHtml(beforeLabel)}" title="${escapeHtml(titleLabel)}"></span>`;
}

/**
 * 转义正则表达式特殊字符
 * @param {string} string - 输入字符串
 * @returns {string} 转义后的字符串
 */
function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * 转义 HTML 特殊字符
 * @param {string} text - 输入文本
 * @returns {string} 转义后的文本
 */
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * 屏蔽文本元素（旧方法：整体屏蔽 - 已废弃，不再使用）
 * @deprecated 请使用 blockTextElementPrecise() 代替
 * @param {Element} element - 要屏蔽的元素
 * @param {Object} result - 检测结果
 */
function blockTextElement(element, result) {
  console.warn('⚠️ 调用了已废弃的 blockTextElement()，请使用 blockTextElementPrecise()');
  // 为了避免遗留代码导致问题，这里直接调用新方法
  blockTextElementPrecise(element, result);
}

/**
 * 屏蔽图片元素
 * @param {HTMLImageElement} img - 要屏蔽的图片
 * @param {Object} result - 检测结果
 */
function blockImageElement(img, result) {
  if (!img || blockedElements.has(img)) return;

  // 添加屏蔽样式
  img.classList.add('safeguard-blocked-image');

  // 创建遮罩
  const mask = document.createElement('div');
  mask.className = 'safeguard-mask safeguard-image-mask';

  const icons = {
    sensitive: '⚠️',
    harmful: '🚫',
    privacy: '🔒'
  };
  const labels = {
    sensitive: (typeof i18n !== 'undefined' && i18n.t) ? i18n.t('content.sensitiveBlocked') : '敏感图片',
    harmful: (typeof i18n !== 'undefined' && i18n.t) ? i18n.t('content.harmfulBlocked') : '有害图片',
    privacy: (typeof i18n !== 'undefined' && i18n.t) ? i18n.t('content.privacyBlocked') : '隐私信息'
  };

  const revealBtnLabel = (typeof i18n !== 'undefined' && i18n.t) ? i18n.t('content.clickToReveal') : '点击查看';
  const maskTipLabel = (typeof i18n !== 'undefined' && i18n.t) ? i18n.t('content.imageBlocked') : '图片已屏蔽';

  mask.innerHTML = `
    <div class="safeguard-mask-content">
      <span class="safeguard-mask-icon">${icons[result.category] || '🛡️'}</span>
      <span class="safeguard-mask-label">${labels[result.category] || '已屏蔽'}</span>
      <button class="safeguard-reveal-btn">👁️&nbsp;${escapeHtml(revealBtnLabel)}</button>
      <div class="safeguard-mask-tip">${escapeHtml(maskTipLabel)}</div>
    </div>
  `;

  // 添加点击事件
  const revealBtn = mask.querySelector('.safeguard-reveal-btn');
  revealBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    revealElement(img, 3000);
  });

  // 包裹图片，保证遮罩定位只覆盖图片本身
  let wrapper;
  if (
    img.parentNode &&
    img.parentNode.classList &&
    img.parentNode.classList.contains('safeguard-image-wrapper')
  ) {
    wrapper = img.parentNode;
  } else {
    wrapper = document.createElement('div');
    wrapper.className = 'safeguard-image-wrapper';
    wrapper.style.position = 'relative';
    wrapper.style.display = getComputedStyle(img).display === 'inline' ? 'inline-block' : getComputedStyle(img).display;
    wrapper.style.width = img.width ? img.width + 'px' : img.style.width || img.offsetWidth + 'px';
    wrapper.style.height = img.height ? img.height + 'px' : img.style.height || img.offsetHeight + 'px';
    img.parentNode.insertBefore(wrapper, img);
    wrapper.appendChild(img);
  }

  // 遮罩插入到 wrapper 内部，和图片同级
  wrapper.appendChild(mask);

  // 记录屏蔽信息
  blockedElements.set(img, {
    type: 'image',
    category: result.category,
    confidence: result.confidence,
    mask: mask
  });

  // 更新统计
  statistics.total++;
  if (result.category === 'privacy') statistics.privacy++;
  else if (result.category === 'sensitive') statistics.sensitive++;
  else if (result.category === 'harmful') statistics.harmful++;
}

/**
 * 临时显示被屏蔽的元素
 * @param {Element} element - 要显示的元素
 * @param {number} duration - 显示时长（毫秒）
 */
function revealElement(element, duration = 3000) {
  // 如果是被包裹的图片，给 wrapper 加类，否则给自身加类
  let target = element;
  if (
    element.tagName === 'IMG' &&
    element.parentNode &&
    element.parentNode.classList &&
    element.parentNode.classList.contains('safeguard-image-wrapper')
  ) {
    target = element.parentNode;
  }
  target.classList.add('safeguard-revealed');

  setTimeout(() => {
    target.classList.remove('safeguard-revealed');
  }, duration);
}

/**
 * 从 detector 更新统计数据
 */
function updateStatsFromDetector() {
  if (!detector) return;
  
  const detectorStats = detector.getStatistics();
  
  // ❌ 不要重置 statistics.total！
  // 精确屏蔽模式下，statistics.total 在 blockTextElementPrecise() 中已经正确累加
  // 这里只更新 blockedElements.size 作为参考（元素数量，不是屏蔽片段数量）
  
  // 更新显示（使用已累加的 statistics.total）
  updateStatsDisplay(statistics.total);
}

/**
 * 刷新所有遮罩的本地化文本
 * 在 i18n 加载完成后调用，确保所有已插入的遮罩使用正确的语言
 */
function refreshAllMasksLocalization() {
  if (typeof i18n === 'undefined' || !i18n.t) {
    console.warn('⚠️ i18n 尚未初始化，跳过遮罩本地化刷新');
    return;
  }
  
  console.log('🌍 刷新所有遮罩的本地化文本...');
  
  // 1. 刷新内联文本遮罩（.safeguard-inline-mask）
  const inlineMasks = document.querySelectorAll('.safeguard-inline-mask');
  console.log(`  找到 ${inlineMasks.length} 个内联遮罩`);
  
  inlineMasks.forEach(mask => {
    const category = mask.getAttribute('data-category');
    const beforeLabel = (category === 'privacy' 
      ? i18n.t('content.privacyBlocked') 
      : category === 'sensitive' 
      ? i18n.t('content.sensitiveBlocked') 
      : category === 'harmful' 
      ? i18n.t('content.harmfulBlocked') 
      : i18n.t('content.textBlocked'));
    
    if (beforeLabel) {
      mask.setAttribute('data-before', beforeLabel);
    }
    
    // 更新 title
    const titleLabel = i18n.t('content.clickToReveal');
    if (titleLabel) {
      mask.title = titleLabel;
    }
  });
  
  // 2. 刷新图片遮罩标签
  const imageMasks = document.querySelectorAll('.safeguard-image-wrapper');
  console.log(`  找到 ${imageMasks.length} 个图片遮罩容器`);
  
  imageMasks.forEach(wrapper => {
    const labelEl = wrapper.querySelector('.safeguard-mask-label');
    const tipEl = wrapper.querySelector('.safeguard-mask-tip');
    const btnEl = wrapper.querySelector('.safeguard-reveal-btn');
    
    // 从 data-category 或其他方式获取类别（如果有的话）
    // 简化处理：直接更新为通用文案
    if (labelEl) {
      // 尝试从 label 文本推断类别（粗略匹配）
      const text = labelEl.textContent;
      let category = 'sensitive'; // 默认
      if (text.includes('隐私') || text.includes('Privacy')) category = 'privacy';
      if (text.includes('有害') || text.includes('Harmful')) category = 'harmful';
      
      const newLabel = (category === 'privacy' 
        ? i18n.t('content.privacyBlocked') 
        : category === 'sensitive' 
        ? i18n.t('content.sensitiveBlocked') 
        : i18n.t('content.harmfulBlocked'));
      
      if (newLabel) labelEl.textContent = newLabel;
    }
    
    if (tipEl) {
      const newTip = i18n.t('content.imageBlocked');
      if (newTip) tipEl.textContent = newTip;
    }
    
    if (btnEl) {
      const newBtnText = i18n.t('content.clickToReveal');
      if (newBtnText) {
        // 保留眼睛图标
        btnEl.innerHTML = `👁️&nbsp;${newBtnText}`;
      }
    }
  });
  
  // 3. 刷新浮动统计
  const statsText = document.querySelector('.safeguard-stats-text');
  if (statsText) {
    const existingCount = document.getElementById('safeguard-block-count');
    const countValue = existingCount ? existingCount.textContent : '0';
    
    try {
      // 先用占位符获取翻译模板
      const template = i18n.t('content.blockedItems', { count: '{COUNT_PLACEHOLDER}' });
      // 将占位符替换为 <span> 元素
      const refreshed = template.replace('{COUNT_PLACEHOLDER}', `<span id="safeguard-block-count">${countValue}</span>`);
      
      if (refreshed) {
        statsText.innerHTML = refreshed;
        console.log(`  ✅ 浮动统计已更新为: ${refreshed.replace(/<[^>]*>/g, '')}`);
      }
    } catch (err) {
      console.warn('  ⚠️ 更新浮动统计失败:', err);
    }
  }
  
  console.log('✅ 遮罩本地化刷新完成');
}

// 监听 i18n 初始化完成事件
window.addEventListener('safeguard-i18n-ready', (event) => {
  console.log('🌍 收到 i18n-ready 事件，当前语言:', event.detail?.language);
  refreshAllMasksLocalization();
});

// 兼容：如果 i18n 已经加载完成（页面加载较慢时），也尝试刷新一次
setTimeout(() => {
  if (typeof i18n !== 'undefined' && i18n.t) {
    console.log('🌍 检测到 i18n 已加载，执行兼容性刷新');
    refreshAllMasksLocalization();
  }
}, 1000);

/**
 * 保存文本检测日志
 */
function saveTextDetectionLog(data) {
  chrome.runtime.sendMessage({
    action: 'saveLog',
    logEntry: {
      type: 'text_detection',
      result: data.category,
      originalText: data.originalText,
      sensitiveParts: data.sensitiveParts,
      confidence: data.confidence,
      url: data.url,
      timestamp: data.timestamp
    }
  }).catch(err => console.error('保存文本日志失败:', err));
}

/**
 * 保存实时检测日志
 */
function saveRealtimeDetectionLog(data) {
  chrome.runtime.sendMessage({
    action: 'saveLog',
    logEntry: {
      type: 'realtime_detection',
      result: data.category,
      originalText: data.originalText,
      source: data.source,
      responseTime: data.responseTime,
      url: data.url,
      timestamp: data.timestamp
    }
  }).catch(err => console.error('保存实时日志失败:', err));
}

console.log('SafeGuard Content Script 初始化完成');

