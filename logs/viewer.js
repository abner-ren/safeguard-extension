/**
 * SafeGuard Logs Viewer
 * 日志查看器脚本
 */

let allLogs = [];
let filteredLogs = [];

// 页面加载完成
document.addEventListener('DOMContentLoaded', async () => {
  await loadLogs();
  setupEventListeners();
});

// 加载日志
async function loadLogs() {
  try {
    const { logs = [] } = await chrome.storage.local.get('logs');
    allLogs = logs.reverse(); // 最新的在前面
    applyFilters();
    displayLogs();
    updateStats();
  } catch (error) {
    console.error('加载日志失败:', error);
    showError('加载日志失败: ' + error.message);
  }
}

// 应用过滤器
function applyFilters() {
  const typeFilter = document.getElementById('type-filter').value;
  const resultFilter = document.getElementById('result-filter').value;
  const providerFilter = document.getElementById('provider-filter').value;

  filteredLogs = allLogs.filter(log => {
    if (typeFilter !== 'all' && log.type !== typeFilter) return false;
    if (resultFilter !== 'all' && log.result !== resultFilter) return false;
    if (providerFilter !== 'all' && log.provider !== providerFilter) return false;
    return true;
  });
}

// 显示日志
function displayLogs() {
  const container = document.getElementById('logs-container');

  if (filteredLogs.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">📭</div>
        <div class="empty-state-text">没有符合条件的日志</div>
      </div>
    `;
    return;
  }

  container.innerHTML = filteredLogs.map(log => createLogEntryHTML(log)).join('');
}

// 创建日志条目 HTML
function createLogEntryHTML(log) {
  const isError = log.error || log.result === 'error';
  const resultBadge = getResultBadge(log.result);
  const time = new Date(log.timestamp).toLocaleString('zh-CN');

  let detailsHTML = '';
  
  if (log.type === 'image_detection') {
    detailsHTML = `
      <div class="log-details">
        <div class="log-detail">
          <span class="log-detail-label">图片URL:</span>
          <span class="log-detail-value">${truncate(log.imageUrl || 'N/A', 60)}</span>
        </div>
        <div class="log-detail">
          <span class="log-detail-label">结果:</span>
          ${resultBadge}
        </div>
        <div class="log-detail">
          <span class="log-detail-label">置信度:</span>
          <span class="log-detail-value">${(log.confidence * 100).toFixed(1)}%</span>
        </div>
        <div class="log-detail">
          <span class="log-detail-label">提供商:</span>
          <span class="log-detail-value">${log.provider || 'N/A'}</span>
        </div>
        <div class="log-detail">
          <span class="log-detail-label">处理时间:</span>
          <span class="log-detail-value">${log.processingTime || 'N/A'}ms</span>
        </div>
        ${log.error ? `
          <div class="log-detail" style="grid-column: 1/-1;">
            <span class="log-detail-label">错误:</span>
            <span class="log-detail-value" style="color: #dc3545;">${log.error}</span>
          </div>
        ` : ''}
      </div>
    `;
  }

  return `
    <div class="log-entry ${isError ? 'error' : ''}">
      <div class="log-header">
        <span class="log-type">${getTypeLabel(log.type)}</span>
        <span class="log-time">${time}</span>
      </div>
      ${detailsHTML}
    </div>
  `;
}

// 获取类型标签
function getTypeLabel(type) {
  const labels = {
    'image_detection': '🖼️ 图片检测',
    'text_detection': '📝 文本检测'
  };
  return labels[type] || type;
}

// 获取结果徽章
function getResultBadge(result) {
  const badges = {
    'safe': '<span class="badge badge-success">✅ 安全</span>',
    'privacy': '<span class="badge badge-warning">🔒 隐私</span>',
    'sensitive': '<span class="badge badge-warning">⚠️ 敏感</span>',
    'harmful': '<span class="badge badge-danger">🚫 有害</span>',
    'error': '<span class="badge badge-danger">❌ 错误</span>'
  };
  return badges[result] || `<span class="badge badge-info">${result}</span>`;
}

// 截断文本
function truncate(text, maxLength) {
  if (!text) return 'N/A';
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength) + '...';
}

// 更新统计
function updateStats() {
  document.getElementById('total-logs').textContent = allLogs.length;
  
  const imageLogs = allLogs.filter(log => log.type === 'image_detection').length;
  const textLogs = allLogs.filter(log => log.type === 'text_detection').length;
  const errorLogs = allLogs.filter(log => log.error || log.result === 'error').length;
  
  document.getElementById('image-logs').textContent = imageLogs;
  document.getElementById('text-logs').textContent = textLogs;
  document.getElementById('error-logs').textContent = errorLogs;
}

// 设置事件监听
function setupEventListeners() {
  // 刷新按钮
  document.getElementById('refresh-btn').addEventListener('click', async () => {
    await loadLogs();
    showNotification('日志已刷新');
  });

  // 清空日志按钮
  document.getElementById('clear-btn').addEventListener('click', async () => {
    if (!confirm('确定要清空所有日志吗？此操作不可恢复！')) {
      return;
    }
    
    try {
      await chrome.storage.local.set({ logs: [] });
      await loadLogs();
      showNotification('日志已清空');
    } catch (error) {
      showError('清空日志失败: ' + error.message);
    }
  });

  // 下载日志按钮
  document.getElementById('download-btn').addEventListener('click', async () => {
    try {
      const response = await chrome.runtime.sendMessage({
        action: 'downloadLogs'
      });
      
      if (response.success) {
        showNotification('日志下载成功');
      } else {
        showError(response.error || '下载失败');
      }
    } catch (error) {
      showError('下载日志失败: ' + error.message);
    }
  });

  // 过滤器
  document.getElementById('type-filter').addEventListener('change', () => {
    applyFilters();
    displayLogs();
  });

  document.getElementById('result-filter').addEventListener('change', () => {
    applyFilters();
    displayLogs();
  });

  document.getElementById('provider-filter').addEventListener('change', () => {
    applyFilters();
    displayLogs();
  });
}

// 显示通知
function showNotification(message) {
  // 简单的 alert，后续可以改为更美观的提示
  alert(message);
}

// 显示错误
function showError(message) {
  alert('❌ ' + message);
}
