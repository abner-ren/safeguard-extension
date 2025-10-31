/**
 * SafeGuard Gemini API Wrapper
 * 封装与 Google Gemini API 的交互逻辑
 */

class GeminiAPI {
  constructor(apiKey) {
    this.apiKey = apiKey;
    this.baseURL = 'https://generativelanguage.googleapis.com/v1beta';
    this.model = 'gemini-2.5-flash'; // 切换到无配额限制的模型
    this.requestCache = new Map(); // 请求缓存
    this.requestQueue = []; // 请求队列
    this.isProcessing = false;
  }

  /**
   * 分析图片内容
   * @param {string} imageBase64 - Base64编码的图片
   * @param {string} mimeType - 图片MIME类型
   * @returns {Promise<Object>} 分析结果
   */
  async analyzeImage(imageBase64, mimeType = 'image/jpeg', imageUrl = '') {
    if (!imageBase64) {
      return { category: null, confidence: 0 };
    }
    
    const startTime = Date.now();
    let result = null;
    let error = null;

    // 检查缓存
    const cacheKey = `image:${imageBase64.substring(0, 100)}`;
    if (this.requestCache.has(cacheKey)) {
      console.log('使用缓存结果');
      return this.requestCache.get(cacheKey);
    }

    const prompt = this._buildImageAnalysisPrompt();
    
    try {
      const apiResult = await this._callGeminiAPI(prompt, {
        inlineData: {
          mimeType: mimeType,
          data: imageBase64
        }
      });
      
      const analysis = this._parseImageAnalysisResult(apiResult);
      result = analysis;
      
      // 缓存结果
      this.requestCache.set(cacheKey, analysis);
      
      return analysis;
    } catch (err) {
      console.error('图片分析失败:', err);
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
        provider: 'gemini',
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
      console.warn('[Gemini API] 日志保存失败:', error);
    }
  }

  /**
   * 批量分析文本（新的优化方法 - 一次请求多个）
   * @param {Array<string>} texts - 文本数组
   * @returns {Promise<Array>} 分析结果数组
   */
  async analyzeBatchTexts(texts) {
    if (!texts || texts.length === 0) {
      return [];
    }

    try {
      const prompt = this._buildBatchTextPrompt(texts);
      const resultText = await this._callGeminiAPI(prompt);
      const results = this._parseBatchTextResult(resultText, texts.length);
      
      return results;
    } catch (error) {
      console.error('❌ 批量文本分析失败:', error.message);
      
      // 如果是 MAX_TOKENS 错误，尝试减半重试
      if (error.message.includes('MAX_TOKENS') && texts.length > 1) {
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
        reason: '批量检测失败'
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
   * 构建图片分析提示词
   */
  _buildImageAnalysisPrompt() {
    return `你需要判断这张图片是否包含有害内容。

判断类别：
- 敏感内容(sensitive)：色情、裸露、低俗、暴力、血腥
- 有害信息(harmful)：赌博、毒品、违法犯罪相关
- 隐私信息(privacy)：身份证、银行卡等证件信息

请给出一个标签(label)：safe / sensitive / harmful / privacy

请严格按照以下JSON格式回复（不要添加任何其他文字）：
{
  "label": "safe",
  "confidence": 0.9,
  "reason": "简短说明"
}

如果图片安全，label 返回 "safe"。`;
  }

  /**
   * 调用 Gemini API
   */
  async _callGeminiAPI(textPrompt, imagePart = null) {
    const url = `${this.baseURL}/models/${this.model}:generateContent?key=${this.apiKey}`;

    const parts = [{ text: textPrompt }];
    if (imagePart) {
      parts.push(imagePart);
    }

    // 判断是否为批量请求（需要更多 token）
    const isBatchRequest = textPrompt.includes('"results"');
    
    const requestBody = {
      contents: [{
        parts: parts
      }],
      generationConfig: {
        temperature: 0.1, // 降低随机性，提高一致性
        maxOutputTokens: isBatchRequest ? 2048 : 512 // 批量请求需要更多 token
      },
      safetySettings: [
        {
          category: "HARM_CATEGORY_HARASSMENT",
          threshold: "BLOCK_NONE"
        },
        {
          category: "HARM_CATEGORY_HATE_SPEECH",
          threshold: "BLOCK_NONE"
        },
        {
          category: "HARM_CATEGORY_SEXUALLY_EXPLICIT",
          threshold: "BLOCK_NONE"
        },
        {
          category: "HARM_CATEGORY_DANGEROUS_CONTENT",
          threshold: "BLOCK_NONE"
        }
      ]
    };

  // 创建超时控制（图片请求给更长时间）
  const controller = new AbortController();
  const timeoutMs = imagePart ? 60000 : 30000; // 图片给 60s
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(`API 错误: ${error.error?.message || response.statusText}`);
      }

      const data = await response.json();
      
      // 详细的响应验证
      if (!data) {
        throw new Error('API 返回空数据');
      }
      
      if (!data.candidates || !Array.isArray(data.candidates)) {
        console.error('API 响应格式错误:', data);
        throw new Error('API 响应缺少 candidates 字段');
      }
      
      if (data.candidates.length === 0) {
        console.error('API 返回空 candidates:', data);
        throw new Error('API 未返回有效结果');
      }
      
      const candidate = data.candidates[0];
      
      // 检查是否被截断（MAX_TOKENS）
      if (candidate.finishReason === 'MAX_TOKENS') {
        console.warn('⚠️ API 响应被截断 (MAX_TOKENS)，尝试使用部分内容');
        // 仍然尝试解析部分内容
      }
      
      if (!candidate.content || !candidate.content.parts || !Array.isArray(candidate.content.parts)) {
        console.error('候选结果格式错误:', candidate);
        
        // 如果是 MAX_TOKENS 导致的格式错误，返回特殊标记
        if (candidate.finishReason === 'MAX_TOKENS') {
          throw new Error('MAX_TOKENS: 响应太长被截断');
        }
        
        throw new Error('API 响应格式错误');
      }
      
      if (candidate.content.parts.length === 0) {
        console.error('候选结果无内容:', candidate);
        throw new Error('API 返回空内容');
      }
      
      const text = candidate.content.parts[0].text;
      
      if (typeof text !== 'string') {
        console.error('返回内容不是字符串:', candidate.content.parts[0]);
        throw new Error('API 返回内容格式错误');
      }

      return text;
    } catch (error) {
      clearTimeout(timeoutId);
      
      if (error.name === 'AbortError') {
        throw new Error(`API 请求超时（${timeoutMs/1000}秒）`);
      }
      
      if (error.message.includes('Failed to fetch')) {
        throw new Error('网络连接失败，请检查网络或API Key');
      }
      
      throw error;
    }
  }

  /**
   * 解析批量文本分析结果（优化版 - 适配新格式）
   */
  _parseBatchTextResult(resultText, expectedCount) {
    try {
      // 清理文本
      let cleanText = resultText.trim();
      cleanText = cleanText.replace(/```json\n?/g, '');
      cleanText = cleanText.replace(/```\n?/g, '');
      cleanText = cleanText.replace(/^\uFEFF/, '');
      cleanText = cleanText.trim();

      // 🔧 修复单引号问题
      cleanText = cleanText.replace(/'([^']+?)'(\s*:)/g, '"$1"$2');
      cleanText = cleanText.replace(/:\s*'([^']*?)'/g, ': "$1"');

      const data = JSON.parse(cleanText);
      
      // 验证格式
      if (!data.results || !Array.isArray(data.results)) {
        throw new Error('返回格式错误：缺少 results 数组');
      }

      // 转换为统一格式（适配新字段名）
      const results = data.results.map(item => {
        // 兼容新旧字段名
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
      console.error('❌ 批量结果解析失败:', error, '原始文本:', resultText);
      
      // 回退：返回全部安全
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
   * 解析图片分析结果
   */
  _parseImageAnalysisResult(resultText) {
    try {
      // 清理文本
      let cleanText = resultText.trim();
      cleanText = cleanText.replace(/```json\n?/g, '');
      cleanText = cleanText.replace(/```\n?/g, '');
      cleanText = cleanText.replace(/^\uFEFF/, '');
      cleanText = cleanText.trim();

      // 🔧 修复单引号问题
      cleanText = cleanText.replace(/'([^']+?)'(\s*:)/g, '"$1"$2'); // 'property': → "property":
      cleanText = cleanText.replace(/:\s*'([^']*?)'/g, ': "$1"');   // : 'value' → : "value"

      const result = JSON.parse(cleanText);
      
      // 兼容新旧格式
      const label = result.label || result.category;
      
      return {
        category: label === 'safe' ? null : label,
        confidence: result.confidence || 0.8,
        reason: result.reason || '',
        isSafe: label === 'safe',
        label: label // 保存原始 label
      };
      
    } catch (error) {
      console.error('❌ 图片结果解析失败:', error);
      
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
   * 延迟函数
   */
  _delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 清除缓存
   */
  clearCache() {
    this.requestCache.clear();
  }

  /**
   * 获取缓存大小
   */
  getCacheSize() {
    return this.requestCache.size;
  }
}

// 导出供其他模块使用
if (typeof module !== 'undefined' && module.exports) {
  module.exports = GeminiAPI;
}
