/**
 * SafeGuard Options Script - 分离版本
 * 文本检测和图片检测分别配置
 */

document.addEventListener('DOMContentLoaded', async () => {
  await loadSettings();
  setupEventListeners();
});

// 加载设置
async function loadSettings() {
  try {
    console.log('🔄 正在加载设置...');
    
    const settings = await chrome.storage.local.get([
      // 服务商选择
      'textProvider',
      'imageProvider',
      // Gemini
      'geminiApiKey',
      'geminiTextModel',
      'geminiImageModel',
      // DeepSeek
      'deepseekApiKey',
      'deepseekTextModel',
      // Qwen
      'qwenApiKey',
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
    
    // 文本服务商
    const textProvider = settings.textProvider || settings.aiProvider || 'gemini';
    document.getElementById('text-provider').value = textProvider;
    toggleTextProviderConfig();
    
    // 图片服务商
    const imageProvider = settings.imageProvider || 'gemini';
    document.getElementById('image-provider').value = imageProvider;
    toggleImageProviderConfig();
    
    // Gemini API Key（兼容旧版本）
    const geminiKey = settings.geminiApiKey || settings.apiKey || '';
    if (geminiKey) {
      document.getElementById('gemini-api-key').value = geminiKey;
      validateApiKey('gemini', geminiKey);
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
  // 保存按钮
  document.getElementById('save-button').addEventListener('click', saveSettings);
  
  // 文本服务商切换
  document.getElementById('text-provider').addEventListener('change', toggleTextProviderConfig);
  
  // 图片服务商切换
  document.getElementById('image-provider').addEventListener('change', toggleImageProviderConfig);
  
  // 调试日志开关
  document.getElementById('enable-debug-logs').addEventListener('change', toggleDebugOptions);
  
  // API Key 验证
  document.getElementById('gemini-api-key').addEventListener('input', (e) => {
    validateApiKey('gemini', e.target.value);
  });
  
  document.getElementById('deepseek-api-key').addEventListener('input', (e) => {
    validateApiKey('deepseek', e.target.value);
  });
  
  document.getElementById('qwen-api-key').addEventListener('input', (e) => {
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
    
    const settings = {
      // 服务商选择
      textProvider: textProvider,
      imageProvider: imageProvider,
      
      // Gemini 配置
      geminiApiKey: document.getElementById('gemini-api-key').value.trim(),
      geminiTextModel: document.getElementById('gemini-text-model').value,
      geminiImageModel: document.getElementById('gemini-image-model').value,
      
      // DeepSeek 配置
      deepseekApiKey: document.getElementById('deepseek-api-key').value.trim(),
      deepseekTextModel: document.getElementById('deepseek-text-model').value,
      
      // Qwen 配置
      qwenApiKey: document.getElementById('qwen-api-key').value.trim(),
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
    if (textProvider === 'gemini' || imageProvider === 'gemini') {
      if (!settings.geminiApiKey) {
        showStatus('请输入 Gemini API Key', 'error');
        return;
      }
      if (!validateApiKey('gemini', settings.geminiApiKey)) {
        showStatus('Gemini API Key 格式不正确', 'error');
        return;
      }
    }
    
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
    
    if (textProvider === 'qwen' || imageProvider === 'qwen') {
      if (!settings.qwenApiKey) {
        showStatus('请输入通义千问 API Key', 'error');
        return;
      }
      if (!validateApiKey('qwen', settings.qwenApiKey)) {
        showStatus('通义千问 API Key 格式不正确', 'error');
        return;
      }
    }
    
    console.log('📝 即将保存的设置:', settings);
    
    // 保存到 Chrome Storage
    await chrome.storage.local.set(settings);
    
    // 验证保存成功
    const verify = await chrome.storage.local.get(['textProvider', 'imageProvider', 'geminiApiKey', 'deepseekApiKey', 'qwenApiKey']);
    console.log('✅ 设置已保存并验证:', {
      textProvider: verify.textProvider,
      imageProvider: verify.imageProvider,
      geminiKey: verify.geminiApiKey ? verify.geminiApiKey.substring(0, 15) + '...' : '未设置',
      deepseekKey: verify.deepseekApiKey ? verify.deepseekApiKey.substring(0, 15) + '...' : '未设置',
      qwenKey: verify.qwenApiKey ? verify.qwenApiKey.substring(0, 15) + '...' : '未设置'
    });
    
    showStatus(`✅ 设置已保存 (文本: ${textProvider}, 图片: ${imageProvider})`, 'success');
    
  } catch (error) {
    console.error('❌ 保存设置失败:', error);
    showStatus('保存失败: ' + error.message, 'error');
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
