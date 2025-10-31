/**
 * SafeGuard Helper Utilities
 * 通用辅助函数
 */

/**
 * 从图片元素提取 Base64 数据
 * @param {HTMLImageElement} imgElement - 图片元素
 * @returns {Promise<{base64: string, mimeType: string}>}
 */
async function imageToBase64(imgElement) {
  return new Promise((resolve, reject) => {
    try {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      
      canvas.width = imgElement.naturalWidth || imgElement.width;
      canvas.height = imgElement.naturalHeight || imgElement.height;
      
      ctx.drawImage(imgElement, 0, 0);
      
      // 转换为 base64
      const dataURL = canvas.toDataURL('image/jpeg', 0.8);
      const base64 = dataURL.split(',')[1];
      
      resolve({
        base64: base64,
        mimeType: 'image/jpeg'
      });
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * 从URL加载图片并转换为Base64
 * @param {string} url - 图片URL
 * @returns {Promise<{base64: string, mimeType: string}>}
 */
async function urlToBase64(url) {
  // 优先走后台代理，避免跨域图片 taint 画布
  try {
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id) {
      const resp = await new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({
          action: 'proxyFetch',
          url,
          options: { method: 'GET', responseType: 'base64' }
        }, (res) => {
          const lastErr = chrome.runtime.lastError;
          if (lastErr) return reject(new Error(lastErr.message));
          if (!res || res.success === false) return reject(new Error(res?.error || 'proxyFetch 失败'));
          resolve(res);
        });
      });

      const mimeType = resp.contentType && resp.contentType.includes('/') ? resp.contentType : inferMimeTypeFromURL(url);
      return { base64: resp.base64, mimeType: mimeType || 'image/jpeg' };
    }
  } catch (e) {
    console.warn('后台代理获取图片失败，回退到 <img> + canvas:', e?.message || e);
  }

  // 回退：使用 <img crossOrigin=anonymous> + canvas（仅当源站允许 CORS 才可用）
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';

    img.onload = async () => {
      try {
        const result = await imageToBase64(img);
        resolve(result);
      } catch (error) {
        reject(error);
      }
    };

    img.onerror = () => reject(new Error('图片加载失败'));
    img.src = url;
  });
}

function inferMimeTypeFromURL(url) {
  const lower = (url || '').toLowerCase();
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.gif')) return 'image/gif';
  if (lower.endsWith('.bmp')) return 'image/bmp';
  if (lower.endsWith('.svg')) return 'image/svg+xml';
  return 'image/jpeg';
}

/**
 * 获取图片文件大小（近似）
 * @param {HTMLImageElement} imgElement - 图片元素
 * @returns {number} 大小（字节）
 */
function getImageSize(imgElement) {
  const width = imgElement.naturalWidth || imgElement.width;
  const height = imgElement.naturalHeight || imgElement.height;
  
  // 估算：width * height * 3 (RGB) * 0.5 (JPEG压缩)
  return width * height * 3 * 0.5;
}

/**
 * 检查是否为有效的图片URL
 * @param {string} url - URL字符串
 * @returns {boolean}
 */
function isValidImageURL(url) {
  if (!url) return false;
  
  // 排除 data URL
  if (url.startsWith('data:')) return true;
  
  // 排除常见的非图片URL
  const invalidPatterns = [
    'javascript:',
    'about:',
    'chrome:',
    'chrome-extension:'
  ];
  
  if (invalidPatterns.some(pattern => url.startsWith(pattern))) {
    return false;
  }
  
  // 检查文件扩展名
  const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.svg'];
  const urlLower = url.toLowerCase();
  
  return imageExtensions.some(ext => urlLower.includes(ext));
}

/**
 * 提取元素的纯文本内容
 * @param {HTMLElement} element - DOM元素
 * @returns {string}
 */
function extractTextContent(element) {
  if (!element) return '';
  
  // 排除脚本和样式
  if (element.tagName === 'SCRIPT' || element.tagName === 'STYLE') {
    return '';
  }
  
  return element.textContent || element.innerText || '';
}

/**
 * 检查元素是否可见
 * @param {HTMLElement} element - DOM元素
 * @returns {boolean}
 */
function isElementVisible(element) {
  if (!element) return false;
  
  const style = window.getComputedStyle(element);
  
  return (
    style.display !== 'none' &&
    style.visibility !== 'hidden' &&
    style.opacity !== '0' &&
    element.offsetWidth > 0 &&
    element.offsetHeight > 0
  );
}

/**
 * 防抖函数
 * @param {Function} func - 要执行的函数
 * @param {number} wait - 等待时间（毫秒）
 * @returns {Function}
 */
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

/**
 * 节流函数
 * @param {Function} func - 要执行的函数
 * @param {number} limit - 时间限制（毫秒）
 * @returns {Function}
 */
function throttle(func, limit) {
  let inThrottle;
  return function(...args) {
    if (!inThrottle) {
      func.apply(this, args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  };
}

/**
 * 生成唯一ID
 * @returns {string}
 */
function generateUniqueId() {
  return `safeguard-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * 格式化数字（添加千位分隔符）
 * @param {number} num - 数字
 * @returns {string}
 */
function formatNumber(num) {
  return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/**
 * 获取域名
 * @param {string} url - URL字符串
 * @returns {string}
 */
function getDomain(url) {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname;
  } catch (error) {
    return '';
  }
}

/**
 * 检查是否在白名单中
 * @param {string} url - 当前URL
 * @param {Array<string>} whitelist - 白名单数组
 * @returns {boolean}
 */
function isWhitelisted(url, whitelist) {
  if (!whitelist || whitelist.length === 0) return false;
  
  const domain = getDomain(url);
  return whitelist.some(whitelistedDomain => domain.includes(whitelistedDomain));
}

/**
 * 安全的JSON解析
 * @param {string} jsonString - JSON字符串
 * @param {*} defaultValue - 默认值
 * @returns {*}
 */
function safeJSONParse(jsonString, defaultValue = null) {
  try {
    return JSON.parse(jsonString);
  } catch (error) {
    console.error('JSON解析失败:', error);
    return defaultValue;
  }
}

/**
 * 延迟执行
 * @param {number} ms - 延迟时间（毫秒）
 * @returns {Promise}
 */
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 重试函数
 * @param {Function} func - 要重试的函数
 * @param {number} maxRetries - 最大重试次数
 * @param {number} retryDelay - 重试延迟（毫秒）
 * @returns {Promise}
 */
async function retry(func, maxRetries = 3, retryDelay = 1000) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await func();
    } catch (error) {
      if (i === maxRetries - 1) throw error;
      console.log(`重试 ${i + 1}/${maxRetries}...`);
      await delay(retryDelay);
    }
  }
}

// 导出所有函数
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    imageToBase64,
    urlToBase64,
    getImageSize,
    isValidImageURL,
    extractTextContent,
    isElementVisible,
    debounce,
    throttle,
    generateUniqueId,
    formatNumber,
    getDomain,
    isWhitelisted,
    safeJSONParse,
    delay,
    retry
  };
}
