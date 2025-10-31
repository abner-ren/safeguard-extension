/**
 * SafeGuard Options Script
 * 处理设置页面的交互和数据管理
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
    const settings = await chrome.storage.local.get([
      // 新配置（分离文本和图片）
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
      // 旧配置（兼容）
      'aiProvider',
      'geminiModel',
      'deepseekModel',
      'apiKey',
      // 检测类别
      'detectPrivacy',
      'detectSensitive',
      'detectHarmful',
      'detectImages',
      'whitelist',
      'detectionDelay',
      'skipSmallImages'
    ]);
    
    // 文本服务商（兼容旧配置）
    const textProvider = settings.textProvider || settings.aiProvider || 'gemini';
    document.getElementById('text-provider').value = textProvider;
    
    // 图片服务商（默认 Gemini）
    const imageProvider = settings.imageProvider || 'gemini';
    document.getElementById('image-provider').value = imageProvider;
    
    // 更新配置区域显示
    updateProviderConfig();
    
    // Gemini API Key（兼容旧版本）
    const geminiKey = settings.geminiApiKey || settings.apiKey || '';
    if (geminiKey) {
      document.getElementById('gemini-api-key').value = geminiKey;
      validateApiKey('gemini', geminiKey);
    }
    
    // Gemini 模型（兼容旧版本）
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
    
    // 白名单
    if (settings.whitelist && settings.whitelist.length > 0) {
      renderWhitelist(settings.whitelist);
    }
    
    // 性能设置
    if (settings.detectionDelay) {
      document.getElementById('detection-delay').value = settings.detectionDelay;
    }
    document.getElementById('skip-small-images').checked = settings.skipSmallImages !== false;
    
  } catch (error) {
    console.error('加载设置失败:', error);
    showStatus('加载设置失败', 'error');
  }
}

// 设置事件监听
function setupEventListeners() {
  // 服务商切换
  document.getElementById('text-provider').addEventListener('change', updateProviderConfig);
  document.getElementById('image-provider').addEventListener('change', updateProviderConfig);
  
  // API Key 验证
  document.getElementById('gemini-api-key').addEventListener('blur', (e) => {
    validateApiKey('gemini', e.target.value);
  });
  
  document.getElementById('deepseek-api-key').addEventListener('blur', (e) => {
    validateApiKey('deepseek', e.target.value);
  });
  
  document.getElementById('qwen-api-key').addEventListener('blur', (e) => {
    validateApiKey('qwen', e.target.value);
  });
  
  // 添加白名单
  document.getElementById('add-whitelist-btn').addEventListener('click', addToWhitelist);
  document.getElementById('whitelist-input').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') addToWhitelist();
  });
  
  // 保存按钮
  document.getElementById('save-btn').addEventListener('click', saveSettings);
  
  // 重置按钮
  document.getElementById('reset-btn').addEventListener('click', resetSettings);
}

// 更新服务商配置显示
function updateProviderConfig() {
  const textProvider = document.getElementById('text-provider').value;
  const imageProvider = document.getElementById('image-provider').value;
  
  // 获取所有需要使用的服务商
  const neededProviders = new Set([textProvider, imageProvider]);
  
  // 显示/隐藏配置区域
  document.getElementById('gemini-config').style.display = 
    neededProviders.has('gemini') ? 'block' : 'none';
  
  document.getElementById('deepseek-config').style.display = 
    neededProviders.has('deepseek') ? 'block' : 'none';
    
  document.getElementById('qwen-config').style.display = 
    neededProviders.has('qwen') ? 'block' : 'none';
}

// 验证 API Key
async function validateApiKey(provider, apiKey) {
  const statusDiv = document.getElementById(`${provider}-status`);
  
  if (!apiKey) {
    statusDiv.innerHTML = '<span class="status-error">❌ 请输入 API Key</span>';
    return false;
  }
  
  // 简单格式验证
  if (provider === 'gemini') {
    if (apiKey.length < 20) {
      statusDiv.innerHTML = '<span class="status-error">❌ Gemini API Key 格式不正确</span>';
      return false;
    }
    statusDiv.innerHTML = '<span class="status-success">✅ Gemini API Key 格式正确</span>';
  } else if (provider === 'deepseek') {
    if (!apiKey.startsWith('sk-')) {
      statusDiv.innerHTML = '<span class="status-error">❌ DeepSeek API Key 应该以 sk- 开头</span>';
      return false;
    }
    statusDiv.innerHTML = '<span class="status-success">✅ DeepSeek API Key 格式正确</span>';
  } else if (provider === 'qwen') {
    if (!apiKey.startsWith('sk-')) {
      statusDiv.innerHTML = '<span class="status-error">❌ 通义千问 API Key 应该以 sk- 开头</span>';
      return false;
    }
    statusDiv.innerHTML = '<span class="status-success">✅ 通义千问 API Key 格式正确</span>';
  }
  
  return true;
}

// 渲染白名单
function renderWhitelist(whitelist) {
  const listElement = document.getElementById('whitelist-list');
  listElement.innerHTML = '';
  
  whitelist.forEach(domain => {
    const li = document.createElement('li');
    li.innerHTML = `
      <span>${domain}</span>
      <button class="btn-remove" data-domain="${domain}">删除</button>
    `;
    listElement.appendChild(li);
  });
  
  // 添加删除事件监听
  document.querySelectorAll('.btn-remove').forEach(btn => {
    btn.addEventListener('click', () => removeFromWhitelist(btn.dataset.domain));
  });
}

// 添加到白名单
async function addToWhitelist() {
  const input = document.getElementById('whitelist-input');
  const domain = input.value.trim().toLowerCase();
  
  if (!domain) return;
  
  // 简单域名验证
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain)) {
    showStatus('请输入有效的域名', 'error');
    return;
  }
  
  const { whitelist = [] } = await chrome.storage.local.get('whitelist');
  
  if (whitelist.includes(domain)) {
    showStatus('该域名已在白名单中', 'warning');
    return;
  }
  
  whitelist.push(domain);
  await chrome.storage.local.set({ whitelist });
  
  renderWhitelist(whitelist);
  input.value = '';
  showStatus('已添加到白名单', 'success');
}

// 从白名单移除
async function removeFromWhitelist(domain) {
  const { whitelist = [] } = await chrome.storage.local.get('whitelist');
  const newWhitelist = whitelist.filter(d => d !== domain);
  
  await chrome.storage.local.set({ whitelist: newWhitelist });
  renderWhitelist(newWhitelist);
  showStatus('已从白名单移除', 'success');
}

// 保存设置
async function saveSettings() {
  try {
    const textProvider = document.getElementById('text-provider').value;
    const imageProvider = document.getElementById('image-provider').value;
    
    // 验证所需的 API Keys
    const neededProviders = new Set([textProvider, imageProvider]);
    
    // 检查每个服务商的 API Key
    const keys = {};
    for (const provider of neededProviders) {
      const apiKey = document.getElementById(`${provider}-api-key`).value.trim();
      if (!apiKey || !(await validateApiKey(provider, apiKey))) {
        const providerNames = {
          gemini: 'Gemini',
          deepseek: 'DeepSeek',
          qwen: '通义千问'
        };
        showStatus(`请输入有效的 ${providerNames[provider]} API Key`, 'error');
        return;
      }
      keys[provider] = apiKey;
    }
    
    const settings = {
      // 新配置
      textProvider: textProvider,
      imageProvider: imageProvider,
      
      // Gemini
      geminiApiKey: document.getElementById('gemini-api-key').value.trim(),
      geminiTextModel: document.getElementById('gemini-text-model').value,
      geminiImageModel: document.getElementById('gemini-image-model').value,
      
      // DeepSeek
      deepseekApiKey: document.getElementById('deepseek-api-key').value.trim(),
      deepseekTextModel: document.getElementById('deepseek-text-model').value,
      
      // Qwen
      qwenApiKey: document.getElementById('qwen-api-key').value.trim(),
      qwenTextModel: document.getElementById('qwen-text-model').value,
      qwenImageModel: document.getElementById('qwen-image-model').value,
      
      // 兼容旧配置
      aiProvider: textProvider, // 兼容旧代码
      apiKey: keys[textProvider] || keys.gemini, // 兼容旧代码
      geminiModel: document.getElementById('gemini-text-model').value, // 兼容旧代码
      deepseekModel: document.getElementById('deepseek-text-model').value, // 兼容旧代码
      
      // 检测类别
      detectPrivacy: document.getElementById('detect-privacy').checked,
      detectSensitive: document.getElementById('detect-sensitive').checked,
      detectHarmful: document.getElementById('detect-harmful').checked,
      detectImages: document.getElementById('detect-images').checked,
      
      // 性能设置
      detectionDelay: parseInt(document.getElementById('detection-delay').value),
      skipSmallImages: document.getElementById('skip-small-images').checked
    };
    
    await chrome.storage.local.set(settings);
    showStatus('✅ 设置已保存', 'success');
    
    // 提示用户重新加载页面
    setTimeout(() => {
      showStatus('💡 请刷新页面以应用新配置', 'info');
    }, 1500);
    
  } catch (error) {
    console.error('保存设置失败:', error);
    showStatus('保存设置失败: ' + error.message, 'error');
  }
}

// 重置设置
async function resetSettings() {
  if (!confirm('确定要重置所有设置为默认值吗？')) return;
  
  const defaultSettings = {
    textProvider: 'gemini',
    imageProvider: 'gemini',
    geminiApiKey: '',
    geminiTextModel: 'gemini-2.5-flash',
    geminiImageModel: 'gemini-2.5-flash',
    deepseekApiKey: '',
    deepseekTextModel: 'deepseek-chat',
    qwenApiKey: '',
    qwenTextModel: 'qwen-turbo',
    qwenImageModel: 'qwen-vl-plus',
    detectPrivacy: true,
    detectSensitive: true,
    detectHarmful: true,
    detectImages: true,
    whitelist: [],
    detectionDelay: 1000,
    skipSmallImages: true
  };
  
  await chrome.storage.local.set(defaultSettings);
  await loadSettings();
  showStatus('✅ 已重置为默认设置', 'success');
}

// 显示状态消息
function showStatus(message, type = 'info') {
  const statusDiv = document.getElementById('save-status');
  statusDiv.textContent = message;
  statusDiv.className = `save-status status-${type}`;
  
  setTimeout(() => {
    statusDiv.textContent = '';
    statusDiv.className = 'save-status';
  }, 3000);
}
