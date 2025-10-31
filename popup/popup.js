/**
 * SafeGuard Popup Script
 * 处理弹出窗口的交互和数据显示
 */

document.addEventListener('DOMContentLoaded', async () => {
  // 等待国际化初始化完成
  await i18n.init();
  i18n.updatePageText();
  
  // 加载设置和统计数据
  await loadData();
  
  // 设置事件监听
  setupEventListeners();
  
  // 定期更新数据
  setInterval(loadData, 2000);
});

// 加载数据
async function loadData() {
  try {
    const data = await chrome.storage.local.get(['enabled', 'statistics']);
    
    // 更新启用状态
    const enableToggle = document.getElementById('enable-toggle');
    const statusText = document.getElementById('status-text');
    const statusDot = document.getElementById('status-dot');
    
    if (enableToggle) {
      enableToggle.checked = data.enabled !== false;
      
      if (data.enabled !== false) {
        statusText.textContent = i18n.t('popup.statusProtecting');
        statusDot.className = 'status-dot active';
      } else {
        statusText.textContent = i18n.t('popup.statusPaused');
        statusDot.className = 'status-dot paused';
      }
    }
    
    // 更新统计数据
    if (data.statistics) {
      // 今日统计
      document.getElementById('today-total').textContent = data.statistics.today.total || 0;
      
      // 本页统计 (暂时显示今日数据，后续会从当前标签页获取)
      document.getElementById('total-blocked').textContent = data.statistics.today.total || 0;
      document.getElementById('privacy-blocked').textContent = data.statistics.today.privacy || 0;
      document.getElementById('sensitive-blocked').textContent = data.statistics.today.sensitive || 0;
      document.getElementById('harmful-blocked').textContent = data.statistics.today.harmful || 0;
    }
  } catch (error) {
    console.error('加载数据失败:', error);
  }
}

// 设置事件监听
function setupEventListeners() {
  // 启用/禁用切换
  const enableToggle = document.getElementById('enable-toggle');
  if (enableToggle) {
    enableToggle.addEventListener('change', async (e) => {
      const enabled = e.target.checked;
      await chrome.storage.local.set({ enabled });
      
      // 通知当前标签页
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab) {
        chrome.tabs.sendMessage(tab.id, { 
          action: 'toggleEnabled', 
          enabled 
        }).catch(err => console.log('标签页未加载 content script'));
      }
      
      // 更新状态显示
      loadData();
    });
  }
  
  // 设置按钮
  const settingsBtn = document.getElementById('settings-btn');
  if (settingsBtn) {
    settingsBtn.addEventListener('click', () => {
      chrome.runtime.openOptionsPage();
    });
  }
  
  // 查看日志按钮
  const viewLogsBtn = document.getElementById('view-logs-btn');
  if (viewLogsBtn) {
    viewLogsBtn.addEventListener('click', async () => {
      try {
        // 获取日志
        const { logs = [] } = await chrome.storage.local.get('logs');
        
        if (logs.length === 0) {
          alert('暂无日志记录');
          return;
        }
        
        // 打开日志查看页面
        const logsUrl = chrome.runtime.getURL('logs/viewer.html');
        chrome.tabs.create({ url: logsUrl });
      } catch (error) {
        console.error('查看日志失败:', error);
        alert('查看日志失败: ' + error.message);
      }
    });
  }
}
