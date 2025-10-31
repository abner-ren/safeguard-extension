/**
 * SafeGuard Options Script - 重构版
 * 统一的 AI 服务商配置界面
 */

document.addEventListener('DOMContentLoaded', async () => {
  // 加载当前设置
  await loadSettings();
  
  // 设置事件监听
  setupEventListeners();
});

// 加载设置
async function loadSettings() {
  try {
    console.log('🔄 正在加载设置...');
    
    const settings = await chrome.storage.local.get([
      // AI 服务商
      'aiProvider',
      // Gemini
      'geminiApiKey',
      'geminiModel',
      // DeepSeek
      'deepseekApiKey',
      'deepseekModel',
      // Qwen
      'qwenApiKey',
      'qwenModel',
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
      'apiKey'
    ]);
    
    console.log('📦 已加载的设置:', settings);
    
    // AI 服务商
    const provider = settings.aiProvider || 'gemini';
    document.getElementById('ai-provider').value = provider;
    toggleProviderConfig(); // 显示对应的配置区
    
    // Gemini API Key（兼容旧版本）
    const geminiKey = settings.geminiApiKey || settings.apiKey || '';
    if (geminiKey) {
      document.getElementById('gemini-api-key').value = geminiKey;
      validateApiKey('gemini', geminiKey);
    }
    
    // Gemini 模型
    const geminiModel = settings.geminiModel || 'gemini-2.5-flash';
    document.getElementById('gemini-model').value = geminiModel;
    
    // DeepSeek API Key
    if (settings.deepseekApiKey) {
      document.getElementById('deepseek-api-key').value = settings.deepseekApiKey;
      validateApiKey('deepseek', settings.deepseekApiKey);
    }
    
    // DeepSeek 模型
    const deepseekModel = settings.deepseekModel || 'deepseek-chat';
    document.getElementById('deepseek-model').value = deepseekModel;
    
    // Qwen API Key
    if (settings.qwenApiKey) {
      document.getElementById('qwen-api-key').value = settings.qwenApiKey;
      validateApiKey('qwen', settings.qwenApiKey);
    }
    
    // Qwen 模型
    const qwenModel = settings.qwenModel || 'qwen-turbo';
    document.getElementById('qwen-model').value = qwenModel;
    
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
    toggleDebugOptions(); // 显示/隐藏调试详情
    
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
  
  // AI 服务商切换
  document.getElementById('ai-provider').addEventListener('change', toggleProviderConfig);
  
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
  
  // 监听图片检测开关
  document.getElementById('detect-images').addEventListener('change', (e) => {
    const provider = document.getElementById('ai-provider').value;
    if (e.target.checked && provider === 'deepseek') {
      showStatus('⚠️ DeepSeek 不支持图片检测，建议切换到 Gemini 或通义千问', 'warning');
    }
  });
}

// 切换服务商配置区域
function toggleProviderConfig() {
  const provider = document.getElementById('ai-provider').value;
  
  console.log('🔄 切换服务商:', provider);
  
  // 隐藏所有配置区
  document.getElementById('gemini-config').style.display = 'none';
  document.getElementById('deepseek-config').style.display = 'none';
  document.getElementById('qwen-config').style.display = 'none';
  
  // 显示选中的配置区
  if (provider === 'gemini') {
    document.getElementById('gemini-config').style.display = 'block';
  } else if (provider === 'deepseek') {
    document.getElementById('deepseek-config').style.display = 'block';
    
    // 提示 DeepSeek 不支持图片
    const detectImages = document.getElementById('detect-images');
    if (detectImages.checked) {
      showStatus('⚠️ DeepSeek 不支持图片检测，图片检测功能将被禁用', 'warning');
    }
  } else if (provider === 'qwen') {
    document.getElementById('qwen-config').style.display = 'block';
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
  
  if (provider === 'gemini') {
    // Gemini Key: AIza 开头，至少 20 个字符
    isValid = apiKey.startsWith('AIza') && apiKey.length > 20;
    message = isValid ? '✅ API Key 格式正确' : '❌ Gemini API Key 应以 AIza 开头';
  } else if (provider === 'deepseek') {
    // DeepSeek Key: sk- 开头
    isValid = apiKey.startsWith('sk-');
    message = isValid ? '✅ API Key 格式正确' : '❌ DeepSeek API Key 应以 sk- 开头';
  } else if (provider === 'qwen') {
    // Qwen Key: sk- 开头
    isValid = apiKey.startsWith('sk-');
    message = isValid ? '✅ API Key 格式正确' : '❌ 通义千问 API Key 应以 sk- 开头';
  }
  
  const statusElement = document.getElementById(`${provider}-status`);
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
    
    const provider = document.getElementById('ai-provider').value;
    
    // 获取对应的 API Key
    let apiKey = '';
    let model = '';
    
    if (provider === 'gemini') {
      apiKey = document.getElementById('gemini-api-key').value.trim();
      model = document.getElementById('gemini-model').value;
      if (!validateApiKey('gemini', apiKey)) {
        showStatus('请输入有效的 Gemini API Key', 'error');
        return;
      }
    } else if (provider === 'deepseek') {
      apiKey = document.getElementById('deepseek-api-key').value.trim();
      model = document.getElementById('deepseek-model').value;
      if (!validateApiKey('deepseek', apiKey)) {
        showStatus('请输入有效的 DeepSeek API Key', 'error');
        return;
      }
    } else if (provider === 'qwen') {
      apiKey = document.getElementById('qwen-api-key').value.trim();
      model = document.getElementById('qwen-model').value;
      if (!validateApiKey('qwen', apiKey)) {
        showStatus('请输入有效的通义千问 API Key', 'error');
        return;
      }
    }
    
    if (!apiKey) {
      showStatus('请输入 API Key', 'error');
      return;
    }
    
    // 获取白名单
    const whitelist = getWhitelistDomains();
    
    const settings = {
      // AI 服务商
      aiProvider: provider,
      
      // Gemini 配置
      geminiApiKey: document.getElementById('gemini-api-key').value.trim(),
      geminiModel: document.getElementById('gemini-model').value,
      
      // DeepSeek 配置
      deepseekApiKey: document.getElementById('deepseek-api-key').value.trim(),
      deepseekModel: document.getElementById('deepseek-model').value,
      
      // Qwen 配置
      qwenApiKey: document.getElementById('qwen-api-key').value.trim(),
      qwenModel: document.getElementById('qwen-model').value,
      
      // 检测类别
      detectPrivacy: document.getElementById('detect-privacy').checked,
      detectSensitive: document.getElementById('detect-sensitive').checked,
      detectHarmful: document.getElementById('detect-harmful').checked,
      detectImages: provider === 'deepseek' ? false : document.getElementById('detect-images').checked,
      
      // 调试选项
      enableDebugLogs: document.getElementById('enable-debug-logs').checked,
      logPrompts: document.getElementById('log-prompts').checked,
      logResponses: document.getElementById('log-responses').checked,
      logTiming: document.getElementById('log-timing').checked,
      
      // 其他
      whitelist: whitelist,
      detectionDelay: parseInt(document.getElementById('detection-delay').value),
      skipSmallImages: document.getElementById('skip-small-images').checked
    };
    
    console.log('📝 即将保存的设置:', settings);
    
    // 保存到 Chrome Storage
    await chrome.storage.local.set(settings);
    
    // 验证保存成功
    const verify = await chrome.storage.local.get(['aiProvider', 'geminiApiKey', 'deepseekApiKey', 'qwenApiKey']);
    console.log('✅ 设置已保存并验证:', {
      provider: verify.aiProvider,
      geminiKey: verify.geminiApiKey ? verify.geminiApiKey.substring(0, 15) + '...' : '未设置',
      deepseekKey: verify.deepseekApiKey ? verify.deepseekApiKey.substring(0, 15) + '...' : '未设置',
      qwenKey: verify.qwenApiKey ? verify.qwenApiKey.substring(0, 15) + '...' : '未设置'
    });
    
    showStatus(`✅ 设置已保存 (使用 ${provider})`, 'success');
    
    // DeepSeek 不支持图片检测的提示
    if (provider === 'deepseek' && document.getElementById('detect-images').checked) {
      showStatus('⚠️ DeepSeek 不支持图片检测，已自动禁用', 'warning');
      document.getElementById('detect-images').checked = false;
    }
    
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
  statusDiv.className = `status-message ${type}`;
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
