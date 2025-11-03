/**
 * SafeGuard Logs Viewer
 * 日志查看器脚本
 */

let allLogs = [];
let filteredLogs = [];

// 页面加载完成
document.addEventListener('DOMContentLoaded', async () => {
  // 等待 i18n 初始化
  await i18n.init();
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
    showError(i18n.t('viewer.loadError') + ': ' + error.message);
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
        <div class="empty-state-icon">${i18n.t('viewer.emptyStateIcon')}</div>
        <div class="empty-state-text">${i18n.t('viewer.noMatchingLogs')}</div>
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
  const time = new Date(log.timestamp).toLocaleString();

  let detailsHTML = '';
  
  if (log.type === 'image_detection') {
    detailsHTML = `
      <div class="log-details">
        <div class="log-detail" style="grid-column: 1/-1;">
          <span class="log-detail-label">${i18n.t('viewer.imageUrl')}</span>
          <span class="log-detail-value" style="word-break: break-all;">
            <a href="${log.imageUrl || '#'}" target="_blank" style="color: #667eea;">
              ${truncate(log.imageUrl || 'N/A', 100)}
            </a>
          </span>
        </div>
        ${log.imageUrl ? `
          <div class="log-detail" style="grid-column: 1/-1;">
            <img src="${log.imageUrl}" 
                 class="image-preview image-thumbnail" 
                 alt="Image Preview"
                 onclick="showImageModal('${log.imageUrl.replace(/'/g, "\\'")}')"
                 onerror="this.style.display='none'; this.nextElementSibling.style.display='block';">
            <span style="display:none; color: #dc3545;">❌ 图片加载失败</span>
          </div>
        ` : ''}
        <div class="log-detail">
          <span class="log-detail-label">${i18n.t('viewer.result')}</span>
          ${resultBadge}
        </div>
        <div class="log-detail">
          <span class="log-detail-label">${i18n.t('viewer.confidence')}</span>
          <span class="log-detail-value">${((log.confidence || 0) * 100).toFixed(1)}%</span>
        </div>
        <div class="log-detail">
          <span class="log-detail-label">${i18n.t('viewer.provider')}</span>
          <span class="log-detail-value">${log.provider || 'N/A'}</span>
        </div>
        <div class="log-detail">
          <span class="log-detail-label">${i18n.t('viewer.processingTime')}</span>
          <span class="log-detail-value">${log.processingTime || 'N/A'}ms</span>
        </div>
        ${log.error ? `
          <div class="log-detail" style="grid-column: 1/-1;">
            <span class="log-detail-label">${i18n.t('viewer.error')}</span>
            <span class="log-detail-value" style="color: #dc3545;">${log.error}</span>
          </div>
        ` : ''}
      </div>
    `;
  } else if (log.type === 'text_detection') {
    detailsHTML = `
      <div class="log-details">
        <div class="log-detail" style="grid-column: 1/-1;">
          <span class="log-detail-label">${i18n.t('viewer.originalText')}</span>
          <span class="log-detail-value" style="white-space: pre-wrap;">${truncate(log.originalText || 'N/A', 200)}</span>
        </div>
        ${log.sensitiveParts && log.sensitiveParts.length > 0 ? `
          <div class="log-detail" style="grid-column: 1/-1;">
            <span class="log-detail-label">${i18n.t('viewer.sensitiveParts')}</span>
            <span class="log-detail-value" style="color: #dc3545; font-weight: 600;">
              ${log.sensitiveParts.map(part => `"${part}"`).join(', ')}
            </span>
          </div>
        ` : ''}
        <div class="log-detail">
          <span class="log-detail-label">${i18n.t('viewer.result')}</span>
          ${resultBadge}
        </div>
        <div class="log-detail">
          <span class="log-detail-label">${i18n.t('viewer.confidence')}</span>
          <span class="log-detail-value">${((log.confidence || 0) * 100).toFixed(1)}%</span>
        </div>
      </div>
    `;
  } else if (log.type === 'realtime_detection') {
    const sourceLabel = getSourceLabel(log.source);
    detailsHTML = `
      <div class="log-details">
        <div class="log-detail" style="grid-column: 1/-1;">
          <span class="log-detail-label">${i18n.t('viewer.originalText')}</span>
          <span class="log-detail-value" style="white-space: pre-wrap;">${truncate(log.originalText || 'N/A', 200)}</span>
        </div>
        <div class="log-detail">
          <span class="log-detail-label">${i18n.t('viewer.result')}</span>
          ${resultBadge}
        </div>
        <div class="log-detail">
          <span class="log-detail-label">${i18n.t('viewer.source')}</span>
          <span class="log-detail-value">${sourceLabel}</span>
        </div>
        <div class="log-detail">
          <span class="log-detail-label">${i18n.t('viewer.responseTime')}</span>
          <span class="log-detail-value">${log.responseTime || 0}ms</span>
        </div>
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
    'image_detection': i18n.t('viewer.labelImageDetection'),
    'text_detection': i18n.t('viewer.labelTextDetection'),
    'realtime_detection': i18n.t('viewer.labelRealtimeDetection')
  };
  return labels[type] || type;
}

// 获取来源标签
function getSourceLabel(source) {
  const labels = {
    'local': i18n.t('viewer.sourceLocal'),
    'websocket': i18n.t('viewer.sourceWebSocket'),
    'http': i18n.t('viewer.sourceHTTP')
  };
  return labels[source] || source || 'N/A';
}

// 获取结果徽章
function getResultBadge(result) {
  const badges = {
    'safe': `<span class="badge badge-success">${i18n.t('viewer.badgeSafe')}</span>`,
    'privacy': `<span class="badge badge-warning">${i18n.t('viewer.badgePrivacy')}</span>`,
    'sensitive': `<span class="badge badge-warning">${i18n.t('viewer.badgeSensitive')}</span>`,
    'harmful': `<span class="badge badge-danger">${i18n.t('viewer.badgeHarmful')}</span>`,
    'error': `<span class="badge badge-danger">${i18n.t('viewer.badgeError')}</span>`
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
  const realtimeLogs = allLogs.filter(log => log.type === 'realtime_detection').length;
  const errorLogs = allLogs.filter(log => log.error || log.result === 'error').length;
  
  document.getElementById('image-logs').textContent = imageLogs;
  document.getElementById('text-logs').textContent = textLogs;
  document.getElementById('realtime-logs').textContent = realtimeLogs;
  document.getElementById('error-logs').textContent = errorLogs;
}

// 设置事件监听
function setupEventListeners() {
  // 刷新按钮
  document.getElementById('refresh-btn').addEventListener('click', async () => {
    await loadLogs();
    showNotification(i18n.t('viewer.refreshSuccess'));
  });

  // 清空日志按钮
  document.getElementById('clear-btn').addEventListener('click', async () => {
    if (!confirm(i18n.t('viewer.clearConfirm'))) {
      return;
    }
    
    try {
      await chrome.storage.local.set({ logs: [] });
      await loadLogs();
      showNotification(i18n.t('viewer.clearSuccess'));
    } catch (error) {
      showError(i18n.t('viewer.clearError') + ': ' + error.message);
    }
  });

  // 下载日志按钮
  document.getElementById('download-btn').addEventListener('click', async () => {
    try {
      const response = await chrome.runtime.sendMessage({
        action: 'downloadLogs'
      });
      
      if (response.success) {
        showNotification(i18n.t('viewer.downloadSuccess'));
      } else {
        showError(response.error || i18n.t('viewer.downloadError'));
      }
    } catch (error) {
      showError(i18n.t('viewer.downloadError') + ': ' + error.message);
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

  // 图片模态框关闭
  document.getElementById('modal-close').addEventListener('click', () => {
    document.getElementById('image-modal').classList.remove('active');
  });

  // 点击模态框背景关闭
  document.getElementById('image-modal').addEventListener('click', (e) => {
    if (e.target.id === 'image-modal') {
      document.getElementById('image-modal').classList.remove('active');
    }
  });
}

// 显示图片模态框
function showImageModal(imageUrl) {
  const modal = document.getElementById('image-modal');
  const modalImage = document.getElementById('modal-image');
  modalImage.src = imageUrl;
  modal.classList.add('active');
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
