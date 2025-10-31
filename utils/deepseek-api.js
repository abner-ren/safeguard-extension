/**
 * SafeGuard DeepSeek API Wrapper
 * 封装与 DeepSeek API 的交互逻辑
 */

class DeepSeekAPI {
  constructor(apiKey, model = 'deepseek-chat') {
    this.apiKey = apiKey;
    this.baseURL = 'https://api.deepseek.com/v1';
    this.model = model;
    this.requestCache = new Map();
    
    // 调试选项（从设置中读取）
    this.debugConfig = {
      enabled: false,
      logPrompts: true,
      logResponses: true,
      logTiming: true
    };
    
    console.log('🔧 DeepSeekAPI 初始化:', {
      model: this.model,
      baseURL: this.baseURL
    });
    
    // 从 storage 加载调试配置
    this._loadDebugConfig();
  }
  
  async _loadDebugConfig() {
    try {
      const settings = await chrome.storage.local.get(['enableDebugLogs', 'logPrompts', 'logResponses', 'logTiming']);
      this.debugConfig = {
        enabled: settings.enableDebugLogs || false,
        logPrompts: settings.logPrompts !== false,
        logResponses: settings.logResponses !== false,
        logTiming: settings.logTiming !== false
      };
      
      console.log('🔧 DeepSeekAPI 调试配置:', this.debugConfig);
    } catch (error) {
      // 默认禁用
      console.warn('⚠️ 无法加载 DeepSeek 调试配置');
    }
  }

  /**
   * 批量分析文本
   * @param {Array<string>} texts - 文本数组
   * @returns {Promise<Array>} 分析结果数组
   */
  async analyzeBatchTexts(texts) {
    console.log('📦 DeepSeekAPI.analyzeBatchTexts 被调用, 批次数:', texts?.length || 0);
    
    if (!texts || texts.length === 0) {
      return [];
    }

    console.log(`� DeepSeek 批量检测: ${texts.length} 项`);

    try {
      const prompt = this._buildBatchTextPrompt(texts);
      const resultText = await this._callDeepSeekAPI(prompt);
      const results = this._parseBatchTextResult(resultText, texts.length);
      
      console.log(`✅ DeepSeek 批量分析完成: ${results.length} 个结果`);
      
      return results;
    } catch (error) {
      console.error('❌ DeepSeek 批量文本分析失败:', error.message);
      
      // 如果是 token 限制错误，尝试拆分
      if (error.message.includes('max_tokens') && texts.length > 1) {
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
        reason: 'DeepSeek 批量检测失败'
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
   * 调用 DeepSeek API
   */
  async _callDeepSeekAPI(prompt) {
    const url = `${this.baseURL}/chat/completions`;

    const requestBody = {
      model: this.model,
      messages: [
        {
          role: "system",
          content: "你是一个专业的内容审核助手，擅长识别有害信息、敏感内容和隐私信息。请严格按照JSON格式返回结果。"
        },
        {
          role: "user",
          content: prompt
        }
      ],
      temperature: 0.1,
      max_tokens: 2048,
      response_format: { type: "json_object" }
    };

    // ===== 始终记录请求信息 =====
    console.log('📤 DeepSeek API 请求:', {
      model: this.model,
      promptLength: prompt.length,
      maxTokens: 2048
    });
    
    if (this.debugConfig.enabled && this.debugConfig.logPrompts) {
      console.log('📝 完整 Prompt:', prompt.substring(0, 500) + (prompt.length > 500 ? '...' : ''));
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);
    const startTime = performance.now();

    try {
      const response = await fetch(url, {
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
        throw new Error(`DeepSeek API 错误 ${response.status}: ${errorData.error?.message || response.statusText}`);
      }

      const data = await response.json();
      
      if (!data.choices || !data.choices[0] || !data.choices[0].message) {
        throw new Error('DeepSeek API 返回格式错误');
      }

      // ===== 始终记录响应信息 =====
      const duration = Math.round(performance.now() - startTime);
      const content = data.choices[0].message.content;
      
      console.log(`📥 DeepSeek API 响应 (${duration}ms):`, {
        contentLength: content.length,
        usage: data.usage
      });
      
      if (this.debugConfig.enabled && this.debugConfig.logResponses) {
        console.log('📄 完整响应内容:', content.substring(0, 500) + (content.length > 500 ? '...' : ''));
      }

      return content;
    } catch (error) {
      clearTimeout(timeoutId);
      
      if (error.name === 'AbortError') {
        throw new Error('DeepSeek API 请求超时（30秒）');
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
      console.error('❌ DeepSeek 批量结果解析失败:', error);
      
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
    console.log('🗑️ DeepSeek 缓存已清除');
  }
}

// 导出类
if (typeof module !== 'undefined' && module.exports) {
  module.exports = DeepSeekAPI;
}
