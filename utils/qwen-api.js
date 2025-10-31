/**
 * SafeGuard 通义千问 API Wrapper
 * 封装与阿里云通义千问 API 的交互逻辑
 */

class QwenAPI {
  constructor(apiKey, textModel = 'qwen-turbo', imageModel = 'qwen-vl-plus', options = {}) {
    this.apiKey = apiKey;
    this.baseURL = 'https://dashscope.aliyuncs.com/api/v1';
    this.textModel = textModel;      // 文本检测模型
    this.imageModel = imageModel;    // 图片检测模型
    this.requestCache = new Map();
    
    // 调试选项
    this.enableDebugLogs = options.enableDebugLogs || false;
    this.logPrompts = options.logPrompts !== false;
    this.logResponses = options.logResponses !== false;
    this.logTiming = options.logTiming !== false;
    
    // 输出调试配置
    console.log('🔧 QwenAPI 调试配置:', {
      enableDebugLogs: this.enableDebugLogs,
      logPrompts: this.logPrompts,
      logResponses: this.logResponses,
      logTiming: this.logTiming
    });
  }

  /**
   * 分析图片内容
   * @param {string} imageBase64 - Base64编码的图片
   * @param {string} mimeType - 图片MIME类型
   * @returns {Promise<Object>} 分析结果
   */
  async analyzeImage(imageBase64, mimeType = 'image/jpeg', imageUrl = '') {
    console.log('🎨 QwenAPI.analyzeImage 被调用');
    
    if (!imageBase64) {
      console.log('⚠️ 图片数据为空');
      return { category: null, confidence: 0 };
    }

    console.log('📊 图片数据大小:', (imageBase64.length / 1024).toFixed(2), 'KB');
    
    const startTime = Date.now();
    let result = null;
    let error = null;

    // 检查缓存
    const cacheKey = `image:${imageBase64.substring(0, 100)}`;
    if (this.requestCache.has(cacheKey)) {
      console.log('✅ 使用缓存结果');
      return this.requestCache.get(cacheKey);
    }

    try {
      console.log('🚀 调用通义千问视觉 API...');
      const apiResult = await this._callQwenVisionAPI(imageBase64, this.imageModel);
      const analysis = this._parseImageAnalysisResult(apiResult);
      result = analysis;
      
      // 缓存结果
      this.requestCache.set(cacheKey, analysis);
      
      return analysis;
    } catch (err) {
      console.error('❌ 通义千问图片分析失败:', err);
      error = err.message;
      result = { category: null, confidence: 0, error: err.message };
      return result;
    } finally {
      // 记录日志
      const processingTime = Date.now() - startTime;
      this._logImageDetection({
        imageUrl,
        result: result?.category || 'error',
        confidence: result?.confidence || 0,
        provider: 'qwen',
        processingTime,
        error
      });
    }
  }
  
  /**
   * 记录图片检测日志
   * @private
   */
  async _logImageDetection(logData) {
    try {
      await chrome.runtime.sendMessage({
        action: 'saveLog',
        logEntry: {
          timestamp: new Date().toISOString(),
          type: 'image_detection',
          ...logData
        }
      });
    } catch (error) {
      // 忽略日志保存失败（不影响主流程）
      console.warn('[Qwen API] 日志保存失败:', error);
    }
  }

  /**
   * 批量分析文本（新格式）
   * @param {Array<string>} texts - 文本数组
   * @returns {Promise<Array>} 分析结果数组
   */
  async analyzeBatchTexts(texts) {
    if (!texts || texts.length === 0) {
      return [];
    }

    console.log(`📦 通义千问批量检测: ${texts.length} 项`);

    try {
      const prompt = this._buildBatchTextPrompt(texts);
      const resultText = await this._callQwenAPI(prompt, this.textModel);
      const results = this._parseBatchTextResult(resultText, texts.length);
      return results;
    } catch (error) {
      console.error('❌ 通义千问批量文本分析失败:', error.message);
      
      // 如果是 token 限制错误，尝试拆分
      if (error.message.includes('tokens') && texts.length > 1) {
        console.warn('⚠️ 响应太长，拆分为两批重试...');
        const mid = Math.ceil(texts.length / 2);
        const batch1 = texts.slice(0, mid);
        const batch2 = texts.slice(mid);
        
        try {
          const results1 = await this.analyzeBatchTexts(batch1);
          const results2 = await this.analyzeBatchTexts(batch2);
          return [...results1, ...results2];
        } catch (retryError) {
          console.error('❌ 重试失败:', retryError);
        }
      }
      
      // 最终失败：返回所有安全
      return texts.map(() => ({ 
        category: null, 
        confidence: 0, 
        isSafe: true,
        shouldBlock: false,
        reason: '通义千问批量检测失败'
      }));
    }
  }

  /**
   * 构建批量文本分析提示词（优化版 - 快速生成）
   */
  _buildBatchTextPrompt(texts) {
    const numberedTexts = texts.map((text, index) => 
      `${index + 1}. ${text}`
    ).join('\n');

    return `请检测以下文本是否包含有害内容，并用{{}}标记有害部分。

文本列表：
${numberedTexts}

分类规则：
privacy=隐私 | sensitive=敏感 | harmful=有害 | safe=安全

标记规则：
- 如果检测到有害内容，在text字段中用{{}}包裹敏感部分
- 如果内容安全，text字段返回原文，cat为"safe"

示例1（隐私）：
输入: "联系电话13800138000"
输出: {"idx":1,"cat":"privacy","text":"联系电话{{13800138000}}","conf":0.95}

示例2（安全）：
输入: "今天天气不错"
输出: {"idx":2,"cat":"safe","text":"今天天气不错","conf":0.9}

JSON输出格式：
{"results":[{"idx":1,"cat":"safe","text":"...","conf":0.9}]}`;
  }

  /**
   * 调用通义千问文本 API
   */
  async _callQwenAPI(prompt, model = null) {
    const url = `${this.baseURL}/services/aigc/text-generation/generation`;

    const requestBody = {
      model: model || this.textModel,
      input: {
        messages: [
          {
            role: "system",
            content: "你是一个专业的内容审核助手，擅长识别有害信息、敏感内容和隐私信息。请严格按照JSON格式返回结果。"
          },
          {
            role: "user",
            content: prompt
          }
        ]
      },
      parameters: {
        result_format: "message",
        temperature: 0.1,
        max_tokens: 2048
      }
    };

    // 记录请求日志 (总是输出基本信息)
    console.log('📤 通义千问请求:', {
      model: requestBody.model,
      promptLength: prompt.length
    });
    
    if (this.enableDebugLogs && this.logPrompts) {
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('  URL:', url);
      console.log('  完整 Prompt:', prompt);
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);
    const startTime = performance.now();  // 总是记录时间

    try {
      const response = await this._fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error('❌ 通义千问 API 错误:', {
          status: response.status,
          statusText: response.statusText,
          error: errorData
        });
        throw new Error(`通义千问 API 错误 ${response.status}: ${errorData.message || response.statusText}`);
      }

      const data = await response.json();
      
      // 记录响应日志 (总是输出基本信息)
      const duration = performance.now() - startTime;
      console.log(`📥 通义千问响应 (${duration.toFixed(0)}ms):`, {
        content: data.output?.choices?.[0]?.message?.content?.substring(0, 100) + '...',
        usage: data.usage
      });
      
      if (this.enableDebugLogs && this.logResponses) {
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('  完整响应:', data);
        console.log('  完整内容:', data.output?.choices?.[0]?.message?.content);
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      }
      
      if (!data.output || !data.output.choices || !data.output.choices[0]) {
        throw new Error('通义千问 API 返回格式错误');
      }

      return data.output.choices[0].message.content;
    } catch (error) {
      clearTimeout(timeoutId);
      
      if (error.name === 'AbortError') {
        throw new Error('通义千问 API 请求超时（30秒）');
      }
      
      if (error.message.includes('Failed to fetch')) {
        console.error('❌ 通义千问网络错误:', error);
        throw new Error('网络连接失败，请检查网络或API Key');
      }
      
      throw error;
    }
  }

  /**
   * 调用通义千问视觉 API
   */
  async _callQwenVisionAPI(imageBase64, model = null) {
    const url = `${this.baseURL}/services/aigc/multimodal-generation/generation`;

    const prompt = `请分析这张图片是否包含有害内容。

判断类别：
- sensitive: 敏感内容（色情、暴力、血腥）
- harmful: 有害信息（赌博、毒品、违法）
- privacy: 隐私信息（身份证、银行卡等证件）
- safe: 安全内容

请严格按照以下JSON格式回复：
{
  "label": "safe|sensitive|harmful|privacy",
  "confidence": 0.9,
  "reason": "简短说明"
}`;

    const requestBody = {
      model: model || this.imageModel,
      input: {
        messages: [
          {
            role: "user",
            content: [
              { text: prompt },
              { image: `data:image/jpeg;base64,${imageBase64}` }
            ]
          }
        ]
      },
      parameters: {
        result_format: "message"
      }
    };

    // 记录请求日志 (总是输出基本信息)
    console.log('📤 通义千问视觉 API 请求:', {
      model: requestBody.model,
      imageSize: (imageBase64.length / 1024).toFixed(2) + ' KB'
    });
    
    if (this.enableDebugLogs && this.logPrompts) {
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('  URL:', url);
      console.log('  完整 Prompt:', prompt);
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);
    const startTime = performance.now();  // 总是记录时间

    try {
      const response = await this._fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error('❌ 通义千问视觉 API 错误:', {
          status: response.status,
          statusText: response.statusText,
          error: errorData
        });
        throw new Error(`通义千问视觉 API 错误 ${response.status}: ${errorData.message || response.statusText}`);
      }

  const data = await response.json();
      
      // 记录响应日志 (总是输出基本信息)
      const duration = performance.now() - startTime;
      const responseContent = data.output?.choices?.[0]?.message?.content;
      const responseText = Array.isArray(responseContent) ? responseContent[0]?.text : responseContent;
      
      console.log(`📥 通义千问视觉响应 (${duration.toFixed(0)}ms):`, {
        content: responseText?.substring(0, 100) + '...',
        usage: data.usage
      });
      
      if (this.enableDebugLogs && this.logResponses) {
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('  完整响应:', data);
        console.log('  完整内容:', responseText);
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      }
      
      if (!data.output || !data.output.choices || !data.output.choices[0]) {
        throw new Error('通义千问视觉 API 返回格式错误');
      }

      return data.output.choices[0].message.content[0].text;
    } catch (error) {
      clearTimeout(timeoutId);
      
      if (error.name === 'AbortError') {
        throw new Error('通义千问视觉 API 请求超时（30秒）');
      }
      
      console.error('❌ 通义千问视觉 API 调用失败:', error);
      throw error;
    }
  }

  /**
   * 在 content 脚本中通过后台代理发起请求，避免 CORS；在扩展页/普通页中回退为直接 fetch
   * 返回值提供与 Response 近似的接口：{ ok, status, statusText, json():Promise, text():Promise }
   */
  async _fetch(url, options) {
    try {
      // 优先使用后台代理（content-script 环境）
      if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id) {
        // sanitize 传输参数，去除不可 clone 的字段（如 AbortSignal）并规范 headers
        const safeOptions = { ...(options || {}) };
        // AbortSignal 无法通过 postMessage 传递
        if (safeOptions.signal) delete safeOptions.signal;
        // Headers 对象在 MV3 下不可 clone，转为普通对象
        if (safeOptions.headers && typeof safeOptions.headers.forEach === 'function') {
          const plain = {};
          safeOptions.headers.forEach((v, k) => { plain[k] = v; });
          safeOptions.headers = plain;
        }

        return await new Promise((resolve, reject) => {
          chrome.runtime.sendMessage({ action: 'proxyFetch', url, options: safeOptions }, (resp) => {
            const lastErr = chrome.runtime.lastError;
            if (lastErr) {
              // 回退到原生 fetch（会受 CORS 限制）
              console.warn('[QwenAPI] proxyFetch 不可用，回退为直接 fetch。原因:', lastErr.message || lastErr);
              resolve(fetch(url, options));
              return;
            }
            if (!resp || resp.success === false) {
              const errMsg = resp?.error || 'proxyFetch 调用失败';
              console.error('[QwenAPI] 后台 proxyFetch 调用失败:', errMsg);
              reject(new Error(errMsg));
              return;
            }
            // 组装 Response 近似对象
            const wrapped = {
              ok: !!resp.ok,
              status: resp.status,
              statusText: resp.statusText,
              json: async () => (resp.data !== undefined ? resp.data : JSON.parse(resp.text || 'null')),
              text: async () => resp.text
            };
            resolve(wrapped);
          });
        });
      }
    } catch (_) {
      // 忽略，走回退
    }
    // 回退：直接 fetch（扩展页面/Popup/Options 下通常已跨域许可）
    return fetch(url, options);
  }

  /**
   * 解析图片分析结果
   */
  _parseImageAnalysisResult(resultText) {
    try {
      let cleanText = resultText.trim();
      cleanText = cleanText.replace(/```json\n?/g, '');
      cleanText = cleanText.replace(/```\n?/g, '');
      
      // 修复单引号问题
      cleanText = cleanText.replace(/'([^']+?)'(\s*:)/g, '"$1"$2');
      cleanText = cleanText.replace(/:\s*'([^']*?)'/g, ': "$1"');

      const result = JSON.parse(cleanText);
      
      const label = result.label || result.category;
      
      return {
        category: label === 'safe' ? null : label,
        confidence: result.confidence || 0.8,
        reason: result.reason || '',
        isSafe: label === 'safe',
        label: label
      };
      
    } catch (error) {
      console.error('❌ 通义千问图片结果解析失败:', error);
      
      // 回退方案
      const lowerText = (resultText || '').toLowerCase();
      if (lowerText.includes('sensitive') || lowerText.includes('敏感')) {
        return { category: 'sensitive', confidence: 0.6, reason: '关键词匹配', isSafe: false, label: 'sensitive' };
      }
      if (lowerText.includes('harmful') || lowerText.includes('有害')) {
        return { category: 'harmful', confidence: 0.6, reason: '关键词匹配', isSafe: false, label: 'harmful' };
      }
      
      return { category: null, confidence: 0, reason: '解析失败', isSafe: true, label: 'safe' };
    }
  }

  /**
   * 解析批量文本分析结果（优化版 - 适配新格式）
   */
  _parseBatchTextResult(resultText, expectedCount) {
    try {
      let cleanText = resultText.trim();
      
      // 修复单引号问题
      cleanText = cleanText.replace(/'([^']+?)'(\s*:)/g, '"$1"$2');
      cleanText = cleanText.replace(/:\s*'([^']*?)'/g, ': "$1"');

      const data = JSON.parse(cleanText);
      
      if (!data.results || !Array.isArray(data.results)) {
        throw new Error('返回格式错误：缺少 results 数组');
      }

      // 转换为统一格式（兼容新旧字段名）
      const results = data.results.map(item => {
        const category = item.cat || item.category;
        const maskedText = item.text || item.masked_text;
        const confidence = item.conf || item.confidence;
        
        const hasMask = maskedText && maskedText.includes('{{');
        
        return {
          category: category === 'safe' ? null : category,
          confidence: confidence || 0.8,
          reason: hasMask ? '包含有害信息' : '内容安全',
          isSafe: category === 'safe',
          maskedText: maskedText,
          shouldBlock: category !== 'safe'
        };
      });

      // 如果返回数量不足，补充安全结果
      while (results.length < expectedCount) {
        results.push({
          category: null,
          confidence: 0,
          reason: '未检测',
          isSafe: true,
          shouldBlock: false
        });
      }

      return results;
      
    } catch (error) {
      console.error('❌ 通义千问批量结果解析失败:', error);
      
      return Array(expectedCount).fill({
        category: null,
        confidence: 0,
        reason: '解析失败',
        isSafe: true,
        shouldBlock: false
      });
    }
  }

  /**
   * 清除缓存
   */
  clearCache() {
    this.requestCache.clear();
    console.log('🗑️ 通义千问缓存已清除');
  }
}

// 导出类
if (typeof module !== 'undefined' && module.exports) {
  module.exports = QwenAPI;
}