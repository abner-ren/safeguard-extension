/**
 * SafeGuard Options Script - 分离版本
 * 文本检测和图片检测分别配置
 */

document.addEventListener('DOMContentLoaded', async () => {
  // 初始化国际化
  await i18n.init();
  i18n.updatePageText();
  
  await loadSettings();
  setupEventListeners();
});

// 加载设置
async function loadSettings() {
  try {
    console.log('🔄 正在加载设置...');
    
    const settings = await chrome.storage.local.get([
      // 语言
      'language',
      // 服务商选择
      'textProvider',
      'imageProvider',
      // Gemini
      'geminiApiKey',
      'geminiImageApiKey',  // ✅ 新增:图片专用 Key
      'geminiTextModel',
      'geminiImageModel',
      // DeepSeek
      'deepseekApiKey',
      'deepseekTextModel',
      // Qwen
      'qwenApiKey',
      'qwenImageApiKey',    // ✅ 新增：图片专用 Key
      'qwenTextModel',
      'qwenImageModel',
      // 检测类别
      'detectPrivacy',
      'detectSensitive',
      'detectHarmful',
      'detectImages',
      'whitelist',
      'detectionDelay',
      'skipSmallImages',
      // 调试选项
      'enableDebugLogs',
      'logPrompts',
      'logResponses',
      'logTiming',
      // 兼容旧版本
      'aiProvider',
      'apiKey'
    ]);
    
    console.log('📦 已加载的设置:', settings);
    
    // 加载语言设置
    const language = settings.language || 'en';
    document.getElementById('language-select').value = language;
    
    // 文本服务商
    const textProvider = settings.textProvider || settings.aiProvider || 'gemini';
    document.getElementById('text-provider').value = textProvider;
    toggleTextProviderConfig();
    
    // 图片服务商
    const imageProvider = settings.imageProvider || 'gemini';
    document.getElementById('image-provider').value = imageProvider;
    toggleImageProviderConfig();
    
    // 先检查并显示需要的 API Key 输入框
    checkImageApiKeyRequirement();
    
    // Gemini API Key（兼容旧版本）
    const geminiKey = settings.geminiApiKey || settings.apiKey || '';
    if (geminiKey) {
      document.getElementById('gemini-api-key').value = geminiKey;
      validateApiKey('gemini', geminiKey);
    }
    
    // Gemini 图片专用 API Key
    if (settings.geminiImageApiKey) {
      const geminiImageInput = document.getElementById('gemini-image-api-key');
      if (geminiImageInput) {
        geminiImageInput.value = settings.geminiImageApiKey;
        console.log('✅ 已加载 Gemini 图片 API Key:', settings.geminiImageApiKey.substring(0, 15) + '...');
      }
    }
    
    // Gemini 模型
    const geminiTextModel = settings.geminiTextModel || settings.geminiModel || 'gemini-2.5-flash';
    document.getElementById('gemini-text-model').value = geminiTextModel;
    
    const geminiImageModel = settings.geminiImageModel || settings.geminiModel || 'gemini-2.5-flash';
    document.getElementById('gemini-image-model').value = geminiImageModel;
    
    // DeepSeek API Key
    if (settings.deepseekApiKey) {
      document.getElementById('deepseek-api-key').value = settings.deepseekApiKey;
      validateApiKey('deepseek', settings.deepseekApiKey);
    }
    
    // DeepSeek 模型
    const deepseekTextModel = settings.deepseekTextModel || settings.deepseekModel || 'deepseek-chat';
    document.getElementById('deepseek-text-model').value = deepseekTextModel;
    
    // Qwen API Key
    if (settings.qwenApiKey) {
      document.getElementById('qwen-api-key').value = settings.qwenApiKey;
      validateApiKey('qwen', settings.qwenApiKey);
    }
    
    // Qwen 图片专用 API Key
    if (settings.qwenImageApiKey) {
      const qwenImageInput = document.getElementById('qwen-image-api-key');
      if (qwenImageInput) {
        qwenImageInput.value = settings.qwenImageApiKey;
        console.log('✅ 已加载通义千问图片 API Key:', settings.qwenImageApiKey.substring(0, 15) + '...');
      }
    }
    
    // Qwen 模型
    const qwenTextModel = settings.qwenTextModel || 'qwen-turbo';
    document.getElementById('qwen-text-model').value = qwenTextModel;
    
    const qwenImageModel = settings.qwenImageModel || 'qwen-vl-plus';
    document.getElementById('qwen-image-model').value = qwenImageModel;
    
    // 检测类别
    document.getElementById('detect-privacy').checked = settings.detectPrivacy !== false;
    document.getElementById('detect-sensitive').checked = settings.detectSensitive !== false;
    document.getElementById('detect-harmful').checked = settings.detectHarmful !== false;
    document.getElementById('detect-images').checked = settings.detectImages !== false;
    
    // 调试选项
    document.getElementById('enable-debug-logs').checked = settings.enableDebugLogs || false;
    document.getElementById('log-prompts').checked = settings.logPrompts !== false;
    document.getElementById('log-responses').checked = settings.logResponses !== false;
    document.getElementById('log-timing').checked = settings.logTiming !== false;
    toggleDebugOptions();
    
    // 白名单
    if (settings.whitelist && settings.whitelist.length > 0) {
      renderWhitelist(settings.whitelist);
    }
    
    // 性能设置
    if (settings.detectionDelay) {
      document.getElementById('detection-delay').value = settings.detectionDelay;
    }
    document.getElementById('skip-small-images').checked = settings.skipSmallImages !== false;
    
    console.log('✅ 设置加载完成');
  } catch (error) {
    console.error('❌ 加载设置失败:', error);
    showStatus('加载设置失败', 'error');
  }
}

// 设置事件监听
function setupEventListeners() {
  // 语言切换
  document.getElementById('language-select').addEventListener('change', async (e) => {
    const newLanguage = e.target.value;
    await i18n.setLanguage(newLanguage);
    i18n.updatePageText();
    
    // 显示切换成功提示
    showStatus(i18n.t('options.saveSuccess'), 'success');
  });
  
  // 保存按钮
  document.getElementById('save-button').addEventListener('click', saveSettings);
  
  // 文本服务商切换
  document.getElementById('text-provider').addEventListener('change', () => {
    toggleTextProviderConfig();
    checkImageApiKeyRequirement();
  });
  
  // 图片服务商切换
  document.getElementById('image-provider').addEventListener('change', () => {
    toggleImageProviderConfig();
    checkImageApiKeyRequirement();
  });
  
  // 调试日志开关
  document.getElementById('enable-debug-logs').addEventListener('change', toggleDebugOptions);
  
  // API Key 验证
  document.getElementById('gemini-api-key').addEventListener('input', (e) => {
    validateApiKey('gemini', e.target.value);
  });
  
  document.getElementById('gemini-image-api-key').addEventListener('input', (e) => {
    validateApiKey('gemini', e.target.value);
  });
  
  document.getElementById('deepseek-api-key').addEventListener('input', (e) => {
    validateApiKey('deepseek', e.target.value);
  });
  
  document.getElementById('qwen-api-key').addEventListener('input', (e) => {
    validateApiKey('qwen', e.target.value);
  });
  
  document.getElementById('qwen-image-api-key').addEventListener('input', (e) => {
    validateApiKey('qwen', e.target.value);
  });
  
  // 白名单管理
  document.getElementById('add-whitelist').addEventListener('click', addWhitelistDomain);
}

// 切换文本服务商配置区域
function toggleTextProviderConfig() {
  const provider = document.getElementById('text-provider').value;
  
  console.log('🔄 切换文本服务商:', provider);
  
  // 隐藏所有文本配置区
  document.getElementById('text-gemini-config').style.display = 'none';
  document.getElementById('text-deepseek-config').style.display = 'none';
  document.getElementById('text-qwen-config').style.display = 'none';
  
  // 显示选中的配置区
  if (provider === 'gemini') {
    document.getElementById('text-gemini-config').style.display = 'block';
  } else if (provider === 'deepseek') {
    document.getElementById('text-deepseek-config').style.display = 'block';
  } else if (provider === 'qwen') {
    document.getElementById('text-qwen-config').style.display = 'block';
  }
}

// 切换图片服务商配置区域
function toggleImageProviderConfig() {
  const provider = document.getElementById('image-provider').value;
  
  console.log('🔄 切换图片服务商:', provider);
  
  // 隐藏所有图片配置区
  document.getElementById('image-gemini-config').style.display = 'none';
  document.getElementById('image-qwen-config').style.display = 'none';
  
  // 显示选中的配置区
  if (provider === 'gemini') {
    document.getElementById('image-gemini-config').style.display = 'block';
  } else if (provider === 'qwen') {
    document.getElementById('image-qwen-config').style.display = 'block';
  }
}

// 检查图片 API Key 是否需要单独配置
function checkImageApiKeyRequirement() {
  const textProvider = document.getElementById('text-provider').value;
  const imageProvider = document.getElementById('image-provider').value;
  
  console.log('🔍 检查 API Key 需求:', {textProvider, imageProvider});
  
  // Gemini 图片 API Key
  const geminiImageSection = document.getElementById('gemini-image-api-section');
  const geminiImageHint = document.getElementById('gemini-image-api-hint');
  
  if (imageProvider === 'gemini') {
    if (textProvider === 'gemini') {
      // 共用 Gemini API Key
      geminiImageSection.style.display = 'none';
      geminiImageHint.textContent = '✅ 与文本共用 Gemini API Key';
      geminiImageHint.style.color = '#27ae60';
    } else {
      // 需要单独的 Gemini API Key
      geminiImageSection.style.display = 'block';
      geminiImageHint.textContent = '⚠️ 需要单独配置 Gemini API Key（文本使用 ' + textProvider + '）';
      geminiImageHint.style.color = '#f39c12';
    }
  }
  
  // Qwen 图片 API Key
  const qwenImageSection = document.getElementById('qwen-image-api-section');
  const qwenImageHint = document.getElementById('qwen-image-api-hint');
  
  if (imageProvider === 'qwen') {
    if (textProvider === 'qwen') {
      // 共用 Qwen API Key
      qwenImageSection.style.display = 'none';
      qwenImageHint.textContent = '✅ 与文本共用通义千问 API Key';
      qwenImageHint.style.color = '#27ae60';
    } else {
      // 需要单独的 Qwen API Key
      qwenImageSection.style.display = 'block';
      qwenImageHint.textContent = '⚠️ 需要单独配置通义千问 API Key（文本使用 ' + textProvider + '）';
      qwenImageHint.style.color = '#f39c12';
    }
  }
}

// 切换调试选项显示
function toggleDebugOptions() {
  const enabled = document.getElementById('enable-debug-logs').checked;
  const debugDetails = document.getElementById('debug-details');
  
  if (enabled) {
    debugDetails.style.display = 'block';
  } else {
    debugDetails.style.display = 'none';
  }
}

// 验证 API Key 格式
function validateApiKey(provider, apiKey) {
  if (!apiKey) return;
  
  let isValid = false;
  let message = '';
  let statusElement = null;
  
  if (provider === 'gemini') {
    isValid = apiKey.startsWith('AIza') && apiKey.length > 20;
    message = isValid ? '✅ API Key 格式正确' : '❌ Gemini API Key 应以 AIza 开头';
    statusElement = document.getElementById('gemini-text-status');
  } else if (provider === 'deepseek') {
    isValid = apiKey.startsWith('sk-');
    message = isValid ? '✅ API Key 格式正确' : '❌ DeepSeek API Key 应以 sk- 开头';
    statusElement = document.getElementById('deepseek-text-status');
  } else if (provider === 'qwen') {
    isValid = apiKey.startsWith('sk-');
    message = isValid ? '✅ API Key 格式正确' : '❌ 通义千问 API Key 应以 sk- 开头';
    statusElement = document.getElementById('qwen-text-status');
  }
  
  if (statusElement) {
    statusElement.textContent = message;
    statusElement.className = `api-status ${isValid ? 'valid' : 'invalid'}`;
  }
  
  return isValid;
}

// 保存设置
async function saveSettings() {
  try {
    console.log('💾 正在保存设置...');
    
    const textProvider = document.getElementById('text-provider').value;
    const imageProvider = document.getElementById('image-provider').value;
    
    // 调试：检查图片 API Key 输入框的值
    const geminiImageKeyInput = document.getElementById('gemini-image-api-key');
    const qwenImageKeyInput = document.getElementById('qwen-image-api-key');
    
    console.log('🔍 保存前检查:');
    console.log('  Gemini 图片 Key 元素存在:', !!geminiImageKeyInput);
    console.log('  Gemini 图片 Key 值:', geminiImageKeyInput?.value);
    console.log('  Qwen 图片 Key 元素存在:', !!qwenImageKeyInput);
    console.log('  Qwen 图片 Key 值:', qwenImageKeyInput?.value);
    
    const settings = {
      // 语言设置
      language: document.getElementById('language-select').value,
      
      // 服务商选择
      textProvider: textProvider,
      imageProvider: imageProvider,
      
      // Gemini 配置
      geminiApiKey: document.getElementById('gemini-api-key').value.trim(),
      geminiImageApiKey: geminiImageKeyInput?.value.trim() || '',
      geminiTextModel: document.getElementById('gemini-text-model').value,
      geminiImageModel: document.getElementById('gemini-image-model').value,
      
      // DeepSeek 配置
      deepseekApiKey: document.getElementById('deepseek-api-key').value.trim(),
      deepseekTextModel: document.getElementById('deepseek-text-model').value,
      
      // Qwen 配置
      qwenApiKey: document.getElementById('qwen-api-key').value.trim(),
      qwenImageApiKey: qwenImageKeyInput?.value.trim() || '',
      qwenTextModel: document.getElementById('qwen-text-model').value,
      qwenImageModel: document.getElementById('qwen-image-model').value,
      
      // 检测类别
      detectPrivacy: document.getElementById('detect-privacy').checked,
      detectSensitive: document.getElementById('detect-sensitive').checked,
      detectHarmful: document.getElementById('detect-harmful').checked,
      detectImages: document.getElementById('detect-images').checked,
      
      // 调试选项
      enableDebugLogs: document.getElementById('enable-debug-logs').checked,
      logPrompts: document.getElementById('log-prompts').checked,
      logResponses: document.getElementById('log-responses').checked,
      logTiming: document.getElementById('log-timing').checked,
      
      // 其他
      whitelist: getWhitelistDomains(),
      detectionDelay: parseInt(document.getElementById('detection-delay').value),
      skipSmallImages: document.getElementById('skip-small-images').checked
    };
    
    // 验证 API Keys
    // Gemini 文本检测
    if (textProvider === 'gemini') {
      if (!settings.geminiApiKey) {
        showStatus('请输入 Gemini API Key', 'error');
        return;
      }
      if (!validateApiKey('gemini', settings.geminiApiKey)) {
        showStatus('Gemini API Key 格式不正确', 'error');
        return;
      }
    }
    
    // Gemini 图片检测 (独立于文本)
    if (imageProvider === 'gemini' && textProvider !== 'gemini') {
      if (!settings.geminiImageApiKey) {
        showStatus('请输入 Gemini 图片检测 API Key', 'error');
        return;
      }
      if (!validateApiKey('gemini', settings.geminiImageApiKey)) {
        showStatus('Gemini 图片检测 API Key 格式不正确', 'error');
        return;
      }
    }
    
    // DeepSeek 文本检测
    if (textProvider === 'deepseek') {
      if (!settings.deepseekApiKey) {
        showStatus('请输入 DeepSeek API Key', 'error');
        return;
      }
      if (!validateApiKey('deepseek', settings.deepseekApiKey)) {
        showStatus('DeepSeek API Key 格式不正确', 'error');
        return;
      }
    }
    
    // Qwen 文本检测
    if (textProvider === 'qwen') {
      if (!settings.qwenApiKey) {
        showStatus('请输入通义千问 API Key', 'error');
        return;
      }
      if (!validateApiKey('qwen', settings.qwenApiKey)) {
        showStatus('通义千问 API Key 格式不正确', 'error');
        return;
      }
    }
    
    // Qwen 图片检测 (独立于文本)
    if (imageProvider === 'qwen' && textProvider !== 'qwen') {
      if (!settings.qwenImageApiKey) {
        showStatus('请输入通义千问图片检测 API Key', 'error');
        return;
      }
      if (!validateApiKey('qwen', settings.qwenImageApiKey)) {
        showStatus('通义千问图片检测 API Key 格式不正确', 'error');
        return;
      }
    }
    
    console.log('📝 即将保存的设置:', settings);
    
    // 保存到 Chrome Storage
    await chrome.storage.local.set(settings);
    
    // 验证保存成功 - 包括图片专用 API Key
    const verify = await chrome.storage.local.get([
      'textProvider', 
      'imageProvider', 
      'geminiApiKey', 
      'geminiImageApiKey',
      'deepseekApiKey', 
      'qwenApiKey',
      'qwenImageApiKey'
    ]);
    console.log('✅ 设置已保存并验证:', {
      textProvider: verify.textProvider,
      imageProvider: verify.imageProvider,
      geminiKey: verify.geminiApiKey ? verify.geminiApiKey.substring(0, 15) + '...' : '未设置',
      geminiImageKey: verify.geminiImageApiKey ? verify.geminiImageApiKey.substring(0, 15) + '...' : '未设置',
      deepseekKey: verify.deepseekApiKey ? verify.deepseekApiKey.substring(0, 15) + '...' : '未设置',
      qwenKey: verify.qwenApiKey ? verify.qwenApiKey.substring(0, 15) + '...' : '未设置',
      qwenImageKey: verify.qwenImageApiKey ? verify.qwenImageApiKey.substring(0, 15) + '...' : '未设置'
    });
    
    showStatus(i18n.t('options.saveSuccess'), 'success');
    
  } catch (error) {
    console.error('❌ 保存设置失败:', error);
    showStatus(i18n.t('options.saveError') + ': ' + error.message, 'error');
  }
}

// 显示状态消息
function showStatus(message, type = 'info') {
  const statusDiv = document.getElementById('status-message');
  if (!statusDiv) return;
  
  statusDiv.textContent = message;
  statusDiv.className = `save-status status-${type}`;
  statusDiv.style.display = 'block';
  
  // 3秒后自动隐藏
  setTimeout(() => {
    statusDiv.style.display = 'none';
  }, 3000);
}

// 白名单相关函数
function renderWhitelist(domains) {
  const container = document.getElementById('whitelist-domains');
  container.innerHTML = '';
  
  domains.forEach(domain => {
    const item = document.createElement('div');
    item.className = 'whitelist-item';
    item.innerHTML = `
      <span>${domain}</span>
      <button class="remove-btn" data-domain="${domain}">移除</button>
    `;
    
    item.querySelector('.remove-btn').addEventListener('click', () => {
      removeWhitelistDomain(domain);
    });
    
    container.appendChild(item);
  });
}

function addWhitelistDomain() {
  const input = document.getElementById('whitelist-input');
  const domain = input.value.trim();
  
  if (!domain) {
    showStatus('请输入域名', 'warning');
    return;
  }
  
  // 简单的域名格式验证
  if (!domain.match(/^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/)) {
    showStatus('请输入有效的域名格式', 'warning');
    return;
  }
  
  const currentDomains = getWhitelistDomains();
  if (currentDomains.includes(domain)) {
    showStatus('该域名已在白名单中', 'warning');
    return;
  }
  
  currentDomains.push(domain);
  renderWhitelist(currentDomains);
  input.value = '';
}

function removeWhitelistDomain(domain) {
  const currentDomains = getWhitelistDomains();
  const index = currentDomains.indexOf(domain);
  if (index > -1) {
    currentDomains.splice(index, 1);
    renderWhitelist(currentDomains);
  }
}

function getWhitelistDomains() {
  const container = document.getElementById('whitelist-domains');
  const items = container.querySelectorAll('.whitelist-item span');
  return Array.from(items).map(item => item.textContent);
}
