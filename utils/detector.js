/**
 * SafeGuard Content Detector
 * 内容检测器 - 统一处理文本和图片的检测逻辑
 */

class ContentDetector {
  constructor(apiKey, settings = {}) {
    this.apiKey = apiKey;
    this.settings = settings;
    
    // 新配置：分离文本和图片服务商
    this.textProvider = settings.textProvider || settings.aiProvider || 'gemini';
    this.imageProvider = settings.imageProvider || settings.aiProvider || 'gemini';
    
    // 兼容旧配置
    this.aiProvider = settings.aiProvider || this.textProvider;
    
    // API 实例
    this.geminiAPI = null;
    this.deepseekAPI = null;
    this.qwenAPI = null;
    
    // 文本和图片 API 实例
    this.textAPI = null;
    this.imageAPI = null;
    
    this.detectionQueue = [];
    this.isProcessing = false;
    this.resultCache = new Map();
    this.statistics = {
      totalDetected: 0,
      privacy: 0,
      sensitive: 0,
      harmful: 0,
      images: 0
    };
    
    // 初始化 AI API
    this._initAIAPI();
  }

  /**
   * 初始化 AI API
   * @private
   */
  _initAIAPI() {
    console.log('🔧 开始初始化 AI API...');
    console.log(`  文本服务商: ${this.textProvider}`);
    console.log(`  图片服务商: ${this.imageProvider}`);
    
    // 初始化 Gemini（文本或图片需要）
    if (this.textProvider === 'gemini' || this.imageProvider === 'gemini') {
      if (typeof GeminiAPI !== 'undefined') {
        // 根据使用场景选择 API Key
        let geminiKey;
        if (this.textProvider === 'gemini') {
          // 文本用 Gemini,使用文本 Key
          geminiKey = this.settings.geminiApiKey || this.apiKey;
          console.log('  � Gemini 用于文本检测');
        } else if (this.imageProvider === 'gemini') {
          // 只有图片用 Gemini,使用图片专用 Key
          geminiKey = this.settings.geminiImageApiKey || this.settings.geminiApiKey || this.apiKey;
          console.log('  📷 Gemini 仅用于图片检测(独立 Key)');
        }
        
        const textModel = this.settings.geminiTextModel || 'gemini-2.5-flash';
        const imageModel = this.settings.geminiImageModel || 'gemini-2.5-flash';
        this.geminiAPI = new GeminiAPI(geminiKey, textModel, imageModel);
        console.log(`  ✅ Gemini API 初始化完成 (Key: ${geminiKey?.substring(0, 15)}...)`);
      } else {
        console.error('  ❌ GeminiAPI 未加载');
      }
    }
    
    // 初始化 DeepSeek（仅文本）
    if (this.textProvider === 'deepseek') {
      if (typeof DeepSeekAPI !== 'undefined') {
        const deepseekKey = this.settings.deepseekApiKey || this.apiKey;
        const model = this.settings.deepseekTextModel || 'deepseek-chat';
        this.deepseekAPI = new DeepSeekAPI(deepseekKey, model);
        console.log(`  ✅ DeepSeek API 初始化完成 (Key: ${deepseekKey?.substring(0, 15)}...)`);
      } else {
        console.error('  ❌ DeepSeekAPI 未加载');
      }
    }
    
    // 初始化 Qwen（文本或图片需要）
    if (this.textProvider === 'qwen' || this.imageProvider === 'qwen') {
      if (typeof QwenAPI !== 'undefined') {
        // 根据使用场景选择 API Key
        let qwenKey;
        if (this.textProvider === 'qwen') {
          // 文本用 Qwen,使用文本 Key
          qwenKey = this.settings.qwenApiKey || this.apiKey;
          console.log('  � 通义千问用于文本检测');
        } else if (this.imageProvider === 'qwen') {
          // 只有图片用 Qwen,使用图片专用 Key
          qwenKey = this.settings.qwenImageApiKey || this.settings.qwenApiKey || this.apiKey;
          console.log('  📷 通义千问仅用于图片检测(独立 Key)');
        }
        
        const textModel = this.settings.qwenTextModel || 'qwen-turbo';
        const imageModel = this.settings.qwenImageModel || 'qwen-vl-plus';
        
        // 传递调试选项
        const debugOptions = {
          enableDebugLogs: this.settings.enableDebugLogs || false,
          logPrompts: this.settings.logPrompts !== false,
          logResponses: this.settings.logResponses !== false,
          logTiming: this.settings.logTiming !== false
        };
        
        this.qwenAPI = new QwenAPI(qwenKey, textModel, imageModel, debugOptions);
        console.log(`  ✅ 通义千问 API 初始化完成 (Key: ${qwenKey?.substring(0, 15)}...)`);
      } else {
        console.error('  ❌ QwenAPI 未加载');
      }
    }
    
    // 设置文本和图片 API 实例
    this.textAPI = this._getAPIByProvider(this.textProvider);
    this.imageAPI = this._getAPIByProvider(this.imageProvider);
    
    if (!this.textAPI) {
      console.error(`  ❌ 文本检测 API (${this.textProvider}) 初始化失败`);
    }
    if (!this.imageAPI) {
      console.error(`  ❌ 图片检测 API (${this.imageProvider}) 初始化失败`);
    }
    
    console.log('🎯 AI API 初始化完成');
  }

  /**
   * 根据服务商获取 API
   * @private
   */
  _getAPIByProvider(provider) {
    switch (provider) {
      case 'gemini':
        return this.geminiAPI;
      case 'deepseek':
        return this.deepseekAPI;
      case 'qwen':
        return this.qwenAPI;
      default:
        return this.geminiAPI;
    }
  }

  /**
   * 获取当前使用的 API（兼容旧代码）
   * @private
   */
  _getAPI() {
    return this.textAPI || this.geminiAPI;
  }

  /**
   * 检测图片内容
   * @param {string} imageUrl - 图片 URL
   * @param {HTMLElement} imgElement - 图片元素
   * @returns {Promise<Object>} 检测结果
   */
  async detectImage(imageUrl, imgElement = null) {
    if (!imageUrl) {
      return { isSafe: true, category: null };
    }

    console.log('🖼️ 开始检测图片:', imageUrl.substring(0, 100));

    // 检查是否启用图片检测
    if (!this.settings.detectImages) {
      console.log('⏭️ 图片检测已禁用');
      return { isSafe: true, category: null, skipped: true };
    }

    // 检查缓存
    const cacheKey = this._getCacheKey('image', imageUrl);
    if (this.resultCache.has(cacheKey)) {
      console.log('✅ 使用缓存结果');
      return this.resultCache.get(cacheKey);
    }

    try {
      // 检查图片大小（跳过小图片）
      if (this.settings.skipSmallImages && imgElement) {
        const size = await this._getImageSize(imgElement);
        const threshold = this.settings.smallImageThreshold || 50 * 1024; // 默认50KB
        if (size < threshold) {
          console.log(`⏭️ 跳过小图片 (${(size / 1024).toFixed(1)}KB < ${(threshold / 1024).toFixed(0)}KB)`);
          return { isSafe: true, category: null, skipped: true };
        }
      }

      // 将图片转换为 Base64
      console.log('🔄 正在转换图片为 Base64...');
      const base64Data = await this._imageToBase64(imageUrl, imgElement);
      if (!base64Data) {
        console.error('❌ 图片转换失败');
        return { isSafe: true, category: null, error: 'Cannot convert image' };
      }
      console.log('✅ 图片转换成功:', (base64Data.data.length / 1024).toFixed(2), 'KB');

      // 使用图片检测 API
      const api = this.imageAPI;
      if (!api) {
        console.error('❌ 图片检测 API 未初始化');
        throw new Error('图片检测 API 未初始化');
      }
      
      console.log('📡 准备调用', this.imageProvider, 'API 分析图片...');
      
      // DeepSeek 不支持图片检测
      if (this.imageProvider === 'deepseek') {
        console.warn('⚠️ DeepSeek 不支持图片分析');
        return { isSafe: true, category: null, skipped: true };
      }
      
      // 调用 AI API 分析图片（传递 imageUrl 参数用于日志记录）
      const analysis = await api.analyzeImage(
        base64Data.data, 
        base64Data.mimeType,
        imageUrl  // 新增：用于日志记录
      );
      
      // 处理分析结果
      const result = this._processImageAnalysis(analysis, imgElement);
      
      // 缓存结果
      this.resultCache.set(cacheKey, result);
      
      // 更新统计
      this._updateStatistics(result);
      
      return result;
    } catch (error) {
      console.error('图片检测失败:', error);
      return { 
        isSafe: true, 
        category: null, 
        error: error.message 
      };
    }
  }

  /**
   * 批量检测文本（使用新的批量 API）
   * @param {Array<{text: string, element: HTMLElement}>} items - 文本项数组
   * @returns {Promise<Array<Object>>} 检测结果数组
   */
  async detectTextBatch(items) {
    if (!items || items.length === 0) {
      return [];
    }

    try {
      // 分离缓存和未缓存的项
      const cachedResults = [];
      const uncachedItems = [];
      const uncachedIndexes = [];

      items.forEach((item, index) => {
        const cacheKey = this._getCacheKey('text', item.text);
        if (this.resultCache.has(cacheKey)) {
          cachedResults[index] = this.resultCache.get(cacheKey);
        } else {
          uncachedItems.push(item);
          uncachedIndexes.push(index);
        }
      });

      // 如果全部命中缓存
      if (uncachedItems.length === 0) {
        return cachedResults;
      }

      console.log(`📦 批量检测: ${uncachedItems.length} 项 (缓存命中: ${items.length - uncachedItems.length})`);

      // 使用文本检测 API
      const api = this.textAPI;
      if (!api) {
        throw new Error('文本检测 API 未初始化');
      }
      
      const texts = uncachedItems.map(item => item.text);
      const batchResults = await api.analyzeBatchTexts(texts);

      // 处理批量结果
      const allResults = [...cachedResults];
      
      for (let i = 0; i < uncachedItems.length; i++) {
        const analysis = batchResults[i];
        const item = uncachedItems[i];
        const originalIndex = uncachedIndexes[i];
        
        const result = this._processTextAnalysis(analysis, item.element);
        
        // 如果有 maskedText，保存它
        if (analysis.maskedText) {
          result.maskedText = analysis.maskedText;
        }
        
        // 缓存结果
        const cacheKey = this._getCacheKey('text', item.text);
        this.resultCache.set(cacheKey, result);
        
        // 更新统计
        this._updateStatistics(result);
        
        allResults[originalIndex] = result;
      }

      return allResults;
      
    } catch (error) {
      console.error('❌ 批量文本检测失败:', error);
      return items.map(() => ({ 
        isSafe: true, 
        shouldBlock: false,
        category: null, 
        error: error.message 
      }));
    }
  }

  /**
   * 将检测任务加入队列
   * @param {Object} task - 检测任务
   */
  queueDetection(task) {
    this.detectionQueue.push(task);
    this._processQueue();
  }

  /**
   * 处理检测队列
   * @private
   */
  async _processQueue() {
    if (this.isProcessing || this.detectionQueue.length === 0) {
      return;
    }

    this.isProcessing = true;

    // 批量处理文本任务
    const textTasks = this.detectionQueue.filter(t => t.type === 'text');
    const imageTasks = this.detectionQueue.filter(t => t.type === 'image');

    // 清空队列
    this.detectionQueue = [];

    try {
      // 批量处理文本
      if (textTasks.length > 0) {
        const textItems = textTasks.map(t => ({
          text: t.content,
          element: t.element
        }));
        const results = await this.detectTextBatch(textItems);
        
        // 执行回调
        textTasks.forEach((task, index) => {
          if (task.callback) {
            task.callback(results[index]);
          }
        });
      }

      // 逐个处理图片（图片分析较慢）
      for (const task of imageTasks) {
        const result = await this.detectImage(task.content, task.element);
        if (task.callback) {
          task.callback(result);
        }
      }
    } catch (error) {
      console.error('队列处理失败:', error);
    } finally {
      this.isProcessing = false;
      
      // 如果队列中又有新任务，继续处理
      if (this.detectionQueue.length > 0) {
        setTimeout(() => this._processQueue(), 100);
      }
    }
  }

  /**
   * 处理文本分析结果
   * @private
   */
  _processTextAnalysis(analysis, element) {
    if (!analysis || analysis.error) {
      return {
        isSafe: true,
        category: null,
        confidence: 0,
        element: element,
        reason: analysis?.reason || 'Analysis failed'
      };
    }

    // 检查是否检测到风险
    const isSafe = !analysis.category || analysis.category === null;
    
    // 检查类别是否启用
    const categoryEnabled = this._isCategoryEnabled(analysis.category);
    
    const result = {
      isSafe: isSafe || !categoryEnabled,
      category: analysis.category,
      confidence: analysis.confidence || 0,
      reason: analysis.reason || '',
      element: element,
      shouldBlock: !isSafe && categoryEnabled
    };
    
    // 保存 maskedText（如果存在）
    if (analysis.maskedText || analysis.masked_text) {
      result.maskedText = analysis.maskedText || analysis.masked_text;
    }
    
    return result;
  }

  /**
   * 处理图片分析结果
   * @private
   */
  _processImageAnalysis(analysis, element) {
    if (!analysis || analysis.error) {
      return {
        isSafe: true,
        category: null,
        confidence: 0,
        element: element,
        reason: analysis?.reason || 'Analysis failed'
      };
    }

    // 检查是否检测到风险
    const isSafe = !analysis.category || analysis.category === null;
    
    // 检查类别是否启用
    const categoryEnabled = this._isCategoryEnabled(analysis.category);
    
    return {
      isSafe: isSafe || !categoryEnabled,
      category: analysis.category,
      confidence: analysis.confidence || 0,
      reason: analysis.reason || '',
      element: element,
      isImage: true,
      shouldBlock: !isSafe && categoryEnabled
    };
  }

  /**
   * 检查检测类别是否启用
   * @private
   */
  _isCategoryEnabled(category) {
    if (!category) return false;
    
    const categoryMap = {
      'privacy': this.settings.detectPrivacy !== false,
      'sensitive': this.settings.detectSensitive !== false,
      'harmful': this.settings.detectHarmful !== false
    };
    
    return categoryMap[category] !== false;
  }

  /**
   * 更新统计数据
   * @private
   */
  _updateStatistics(result) {
    if (!result.shouldBlock) return;
    
    this.statistics.totalDetected++;
    
    if (result.category === 'privacy') {
      this.statistics.privacy++;
    } else if (result.category === 'sensitive') {
      this.statistics.sensitive++;
    } else if (result.category === 'harmful') {
      this.statistics.harmful++;
    }
    
    if (result.isImage) {
      this.statistics.images++;
    }
  }

  /**
   * 获取统计数据
   */
  getStatistics() {
    return { ...this.statistics };
  }

  /**
   * 重置统计数据
   */
  resetStatistics() {
    this.statistics = {
      totalDetected: 0,
      privacy: 0,
      sensitive: 0,
      harmful: 0,
      images: 0
    };
  }

  /**
   * 获取缓存键
   * @private
   */
  _getCacheKey(type, content) {
    // 使用简单的哈希来减少内存占用
    const hash = this._simpleHash(content);
    return `${type}:${hash}`;
  }

  /**
   * 简单哈希函数
   * @private
   */
  _simpleHash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return hash.toString(36);
  }

  /**
   * 将图片转换为 Base64
   * @private
   */
  async _imageToBase64(url, imgElement) {
    try {
      // 如果有 helpers.js，使用它的函数
      if (typeof urlToBase64 === 'function') {
        const r = await urlToBase64(url);
        // 兼容 helpers 返回 { base64, mimeType }
        if (r && r.base64) {
          return { data: r.base64, mimeType: r.mimeType || 'image/jpeg' };
        }
        return r; // 假定已是 { data, mimeType }
      }

      // 否则使用简单的实现
      if (imgElement && imgElement.complete) {
        const canvas = document.createElement('canvas');
        canvas.width = imgElement.naturalWidth;
        canvas.height = imgElement.naturalHeight;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(imgElement, 0, 0);
        
        const dataURL = canvas.toDataURL('image/jpeg', 0.75);
        const base64 = dataURL.split(',')[1];
        
        return {
          data: base64,
          mimeType: 'image/jpeg'
        };
      }
      
      // 无法通过 <img> 转换时，尝试后台代理（兜底）
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

        return {
          data: resp.base64,
          mimeType: resp.contentType || 'image/jpeg'
        };
      }

      return null;
    } catch (error) {
      console.error('图片转换失败:', error);
      return null;
    }
  }

  /**
   * 获取图片大小估算
   * @private
   */
  async _getImageSize(imgElement) {
    try {
      // 如果有 helpers.js，使用它的函数
      if (typeof getImageSize === 'function') {
        return await getImageSize(imgElement);
      }

      // 简单估算：宽 × 高 × 3 (RGB)
      const width = imgElement.naturalWidth || imgElement.width;
      const height = imgElement.naturalHeight || imgElement.height;
      return width * height * 3;
    } catch (error) {
      return 0;
    }
  }

  /**
   * 清空缓存
   */
  clearCache() {
    this.resultCache.clear();
    if (this.geminiAPI && this.geminiAPI.requestCache) {
      this.geminiAPI.requestCache.clear();
    }
  }

  /**
   * 获取缓存大小
   */
  getCacheSize() {
    return this.resultCache.size;
  }

  /**
   * 更新设置
   */
  updateSettings(newSettings) {
    this.settings = { ...this.settings, ...newSettings };
  }

  /**
   * 更新 API Key
   */
  updateApiKey(newApiKey) {
    this.apiKey = newApiKey;
    this._initGeminiAPI();
  }
}

// 导出（如果在模块环境中）
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ContentDetector;
}
