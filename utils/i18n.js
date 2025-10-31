/**
 * SafeGuard 国际化工具
 * 提供多语言支持
 */

class I18n {
  constructor() {
    this.messages = {};
    this.currentLanguage = 'en';
  }

  /**
   * 初始化国际化
   */
  async init() {
    // 从存储中获取用户选择的语言
    const { language } = await chrome.storage.local.get('language');
    this.currentLanguage = language || 'en'; // 默认英文
    
    // 加载语言文件
    await this.loadLanguage(this.currentLanguage);
  }

  /**
   * 加载语言文件
   */
  async loadLanguage(lang) {
    try {
      const response = await fetch(chrome.runtime.getURL(`i18n/${lang}.json`));
      this.messages = await response.json();
      this.currentLanguage = lang;
    } catch (error) {
      console.error('Failed to load language file:', error);
      // 如果加载失败，尝试加载英文作为后备
      if (lang !== 'en') {
        await this.loadLanguage('en');
      }
    }
  }

  /**
   * 获取翻译文本
   * @param {string} key - 翻译键，支持点号分隔的路径，如 'popup.title'
   * @param {object} params - 替换参数
   */
  t(key, params = {}) {
    const keys = key.split('.');
    let value = this.messages;
    
    for (const k of keys) {
      if (value && typeof value === 'object' && k in value) {
        value = value[k];
      } else {
        console.warn(`Translation key not found: ${key}`);
        return key;
      }
    }
    
    // 替换参数
    if (typeof value === 'string' && Object.keys(params).length > 0) {
      return value.replace(/\{(\w+)\}/g, (match, param) => {
        return params[param] !== undefined ? params[param] : match;
      });
    }
    
    return value;
  }

  /**
   * 切换语言
   */
  async setLanguage(lang) {
    await this.loadLanguage(lang);
    await chrome.storage.local.set({ language: lang });
  }

  /**
   * 获取当前语言
   */
  getLanguage() {
    return this.currentLanguage;
  }

  /**
   * 更新页面中所有带有 data-i18n 属性的元素
   */
  updatePageText() {
    // 更新文本内容
    document.querySelectorAll('[data-i18n]').forEach(element => {
      const key = element.getAttribute('data-i18n');
      element.textContent = this.t(key);
    });

    // 更新占位符
    document.querySelectorAll('[data-i18n-placeholder]').forEach(element => {
      const key = element.getAttribute('data-i18n-placeholder');
      element.placeholder = this.t(key);
    });

    // 更新标题
    document.querySelectorAll('[data-i18n-title]').forEach(element => {
      const key = element.getAttribute('data-i18n-title');
      element.title = this.t(key);
    });

    // 更新值（用于 option 等）
    document.querySelectorAll('[data-i18n-value]').forEach(element => {
      const key = element.getAttribute('data-i18n-value');
      element.textContent = this.t(key);
    });
  }
}

// 创建全局实例
const i18n = new I18n();

// 如果是浏览器扩展环境，自动初始化
if (typeof chrome !== 'undefined' && chrome.runtime) {
  i18n.init().then(() => {
    // 初始化完成后，更新页面文本
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        i18n.updatePageText();
        // 广播 i18n 初始化完成事件
        window.dispatchEvent(new CustomEvent('safeguard-i18n-ready', { 
          detail: { language: i18n.currentLanguage } 
        }));
      });
    } else {
      i18n.updatePageText();
      // 广播 i18n 初始化完成事件
      window.dispatchEvent(new CustomEvent('safeguard-i18n-ready', { 
        detail: { language: i18n.currentLanguage } 
      }));
    }
  });
}
