/**
 * Gemini Live API WebSocket 实时检测
 * 用于低延迟的实时内容审核（如弹幕、直播评论）
 * 
 * 文档参考：https://ai.google.dev/gemini-api/docs/live?hl=zh-cn
 */

class GeminiWebSocketAPI {
  constructor(apiKey, model = 'gemini-2.0-flash-live-001') {
    this.apiKey = apiKey;
    this.model = model;
    this.ws = null;
    this.isConnected = false;
    this.setupComplete = false;
    this.messageQueue = [];
    this.pendingDetections = new Map(); // 存储待处理的检测请求
    this.detectionId = 0;
    
    // 配置
    this.config = {
      autoReconnect: true,
      maxReconnectAttempts: 3,
      reconnectDelay: 2000,
      enableDebugLogs: false
    };
    
    this.reconnectAttempts = 0;
  }

  /**
   * 连接到 Gemini Live API
   */
  async connect(systemInstruction = null) {
    if (this.isConnected) {
      this._log('⚠️ WebSocket 已连接，跳过重复连接');
      return;
    }

    return new Promise((resolve, reject) => {
      this._log('🔗 正在连接到 Gemini Live API...');
      
      const url = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent?key=${this.apiKey}`;
      
      try {
        this.ws = new WebSocket(url);
        
        // 连接打开
        this.ws.onopen = () => {
          this._log('✅ WebSocket 连接已建立');
          this.isConnected = true;
          this.reconnectAttempts = 0;
          
          // 发送初始化设置
          this._sendSetup(systemInstruction);
          
          resolve();
        };
        
        // 接收消息
        this.ws.onmessage = (event) => {
          this._handleMessage(event.data);
        };
        
        // 连接错误
        this.ws.onerror = (error) => {
          this._log('❌ WebSocket 错误:', error);
          if (!this.isConnected) {
            reject(error);
          }
        };
        
        // 连接关闭
        this.ws.onclose = (event) => {
          this._log(`⚠️ WebSocket 连接已关闭 (code: ${event.code})`);
          this.isConnected = false;
          this.setupComplete = false;
          
          // 自动重连
          if (this.config.autoReconnect && this.reconnectAttempts < this.config.maxReconnectAttempts) {
            this.reconnectAttempts++;
            this._log(`🔄 尝试重连 (${this.reconnectAttempts}/${this.config.maxReconnectAttempts})...`);
            setTimeout(() => this.connect(systemInstruction), this.config.reconnectDelay);
          }
        };
        
      } catch (error) {
        this._log('❌ 创建 WebSocket 失败:', error);
        reject(error);
      }
    });
  }

  /**
   * 发送初始化设置
   * @private
   */
  _sendSetup(customInstruction = null) {
    const defaultInstruction = `你是一个内容审核 AI 助手。你的任务是快速判断文本内容是否包含有害信息。

分类标准：
1. **safe** - 正常内容
2. **privacy** - 隐私泄露（电话、地址、身份证等）
3. **sensitive** - 敏感话题（政治、宗教争议等）
4. **harmful** - 有害信息（色情、暴力、赌博、诈骗、毒品等）

请用JSON格式快速回复，不要解释：
{
  "category": "safe|privacy|sensitive|harmful",
  "confidence": 0-1,
  "reason": "简短原因"
}`;

    const setupMessage = {
      setup: {
        model: `models/${this.model}`,
        generationConfig: {
          temperature: 0.3, // 降低温度提高一致性
          topK: 20,
          topP: 0.8,
          maxOutputTokens: 256, // 减少输出提高速度
          responseModalities: ["TEXT"]
        },
        systemInstruction: {
          parts: [
            {
              text: customInstruction || defaultInstruction
            }
          ]
        }
      }
    };
    
    this._send(setupMessage);
    this._log('📤 发送初始化设置');
  }

  /**
   * 实时检测文本内容
   * @param {string} text - 待检测文本
   * @param {Object} metadata - 元数据（用于标识和日志）
   * @returns {Promise<Object>} 检测结果
   */
  async detectText(text, metadata = {}) {
    if (!this.isConnected) {
      throw new Error('WebSocket 未连接');
    }

    // 等待设置完成
    await this._waitForSetup();

    return new Promise((resolve, reject) => {
      const id = ++this.detectionId;
      
      // 保存到待处理队列
      this.pendingDetections.set(id, {
        resolve,
        reject,
        text,
        metadata,
        timestamp: Date.now()
      });

      // 发送检测请求
      const message = {
        clientContent: {
          turns: [
            {
              role: "user",
              parts: [
                { 
                  text: `检测ID: ${id}\n内容: ${text}` 
                }
              ]
            }
          ],
          turnComplete: true
        }
      };

      this._send(message);
      this._log(`📤 发送实时检测请求 #${id}: "${text.substring(0, 50)}..."`);

      // 超时处理（5秒）
      setTimeout(() => {
        if (this.pendingDetections.has(id)) {
          this.pendingDetections.delete(id);
          reject(new Error('检测超时'));
        }
      }, 5000);
    });
  }

  /**
   * 批量检测（利用 WebSocket 的持久连接优势）
   * @param {Array<string>} texts - 文本数组
   * @returns {Promise<Array<Object>>} 检测结果数组
   */
  async detectBatch(texts) {
    const results = [];
    
    // 并发发送所有请求（WebSocket 可以处理）
    const promises = texts.map((text, index) => 
      this.detectText(text, { batchIndex: index })
    );

    // 等待所有结果
    for (const promise of promises) {
      try {
        const result = await promise;
        results.push(result);
      } catch (error) {
        this._log('❌ 批量检测中的单个请求失败:', error);
        results.push({
          category: 'safe',
          confidence: 0,
          error: error.message
        });
      }
    }

    return results;
  }

  /**
   * 处理接收到的消息
   * @private
   */
  _handleMessage(data) {
    try {
      const message = JSON.parse(data);
      
      // 设置完成
      if (message.setupComplete) {
        this._log('✅ 初始化设置完成');
        this.setupComplete = true;
        return;
      }

      // 服务器响应
      if (message.serverContent?.modelTurn?.parts) {
        const parts = message.serverContent.modelTurn.parts;
        let responseText = '';

        parts.forEach(part => {
          if (part.text) {
            responseText += part.text;
          }
        });

        if (responseText) {
          this._processDetectionResponse(responseText);
        }
      }

    } catch (error) {
      this._log('❌ 解析消息失败:', error);
    }
  }

  /**
   * 处理检测响应
   * @private
   */
  _processDetectionResponse(responseText) {
    try {
      // 提取检测ID
      const idMatch = responseText.match(/检测ID[:：]\s*(\d+)/);
      if (!idMatch) {
        this._log('⚠️ 无法从响应中提取检测ID');
        return;
      }

      const id = parseInt(idMatch[1]);
      const pending = this.pendingDetections.get(id);
      
      if (!pending) {
        this._log(`⚠️ 未找到待处理的检测请求 #${id}`);
        return;
      }

      // 解析 JSON 响应
      const jsonMatch = responseText.match(/\{[\s\S]*"category"[\s\S]*\}/);
      let result;

      if (jsonMatch) {
        result = JSON.parse(jsonMatch[0]);
      } else {
        // 降级处理：简单关键词匹配
        result = this._fallbackParsing(responseText);
      }

      // 添加元数据
      result.responseTime = Date.now() - pending.timestamp;
      result.metadata = pending.metadata;

      this._log(`📥 收到检测结果 #${id}: ${result.category} (置信度: ${result.confidence})`);

      // 解析成功，调用 resolve
      this.pendingDetections.delete(id);
      pending.resolve(result);

    } catch (error) {
      this._log('❌ 处理检测响应失败:', error);
      
      // 降级处理
      const id = Array.from(this.pendingDetections.keys())[0];
      if (id) {
        const pending = this.pendingDetections.get(id);
        this.pendingDetections.delete(id);
        pending.resolve({
          category: 'safe',
          confidence: 0,
          error: error.message
        });
      }
    }
  }

  /**
   * 降级解析（当JSON解析失败时）
   * @private
   */
  _fallbackParsing(responseText) {
    const lowerText = responseText.toLowerCase();
    
    if (lowerText.includes('harmful') || lowerText.includes('有害')) {
      return { category: 'harmful', confidence: 0.7, reason: '关键词匹配' };
    }
    if (lowerText.includes('privacy') || lowerText.includes('隐私')) {
      return { category: 'privacy', confidence: 0.7, reason: '关键词匹配' };
    }
    if (lowerText.includes('sensitive') || lowerText.includes('敏感')) {
      return { category: 'sensitive', confidence: 0.7, reason: '关键词匹配' };
    }
    
    return { category: 'safe', confidence: 0.5, reason: '默认安全' };
  }

  /**
   * 底层发送方法
   * @private
   */
  _send(message) {
    if (!this.isConnected || !this.ws) {
      this._log('❌ WebSocket 未连接，无法发送消息');
      return;
    }

    try {
      this.ws.send(JSON.stringify(message));
    } catch (error) {
      this._log('❌ 发送消息失败:', error);
    }
  }

  /**
   * 等待设置完成
   * @private
   */
  async _waitForSetup(timeout = 10000) {
    const startTime = Date.now();
    while (!this.setupComplete) {
      if (Date.now() - startTime > timeout) {
        throw new Error('等待设置完成超时');
      }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  /**
   * 日志输出
   * @private
   */
  _log(...args) {
    if (this.config.enableDebugLogs) {
      console.log('[GeminiWS]', ...args);
    }
  }

  /**
   * 关闭连接
   */
  close() {
    if (this.ws) {
      this._log('🔌 正在关闭 WebSocket 连接...');
      this.config.autoReconnect = false; // 禁用自动重连
      this.ws.close();
      this.isConnected = false;
      this.setupComplete = false;
      
      // 清理待处理请求
      this.pendingDetections.forEach((pending, id) => {
        pending.reject(new Error('WebSocket 连接已关闭'));
      });
      this.pendingDetections.clear();
    }
  }

  /**
   * 设置配置
   */
  setConfig(config) {
    this.config = { ...this.config, ...config };
  }
}

// 导出（用于 content script）
if (typeof module !== 'undefined' && module.exports) {
  module.exports = GeminiWebSocketAPI;
}
