/**
 * 实时内容检测器
 * 专门用于低延迟场景（弹幕、直播评论、即时消息）
 */

class RealtimeDetector {
  constructor(settings = {}) {
    this.settings = settings;
    this.wsAPI = null;
    this.isEnabled = settings.enableRealtimeDetection || false;
    this.connectionAttempts = 0;
    this.maxConnectionAttempts = 3;
    
    // 本地快速过滤规则
    this.blacklistPatterns = [
      /赌博|博彩|开户|下注|竞猜/,
      /色情|约炮|裸聊|援交|约会/,
      /枪支|毒品|大麻|海洛因|冰毒/,
      /诈骗|刷单|兼职.*日赚|免费领取.*福利/,
      /加微信|加QQ|私聊.*详谈/,
      /(\d{3}[-.\s]?\d{4}[-.\s]?\d{4})|(\d{11})/  // 手机号
    ];
    
    // 统计
    this.stats = {
      totalDetected: 0,
      localBlocked: 0,
      wsBlocked: 0,
      avgResponseTime: 0,
      errors: 0
    };
    
    this._log('🚀 实时检测器已初始化');
  }

  /**
   * 启动实时检测
   */
  async start() {
    if (!this.isEnabled) {
      this._log('⚠️ 实时检测未启用');
      return false;
    }

    try {
      this._log('🔌 正在启动 WebSocket 连接...');
      
      // 通过 background 请求 WebSocket 连接
      const response = await chrome.runtime.sendMessage({
        action: 'startRealtimeDetection',
        settings: this.settings
      });

      if (response.success) {
        this._log('✅ WebSocket 连接已建立');
        return true;
      } else {
        throw new Error(response.error || '连接失败');
      }

    } catch (error) {
      this._log('❌ 启动实时检测失败:', error);
      this.connectionAttempts++;
      
      // 重试逻辑
      if (this.connectionAttempts < this.maxConnectionAttempts) {
        this._log(`🔄 ${2000}ms 后重试...`);
        setTimeout(() => this.start(), 2000);
      }
      
      return false;
    }
  }

  /**
   * 检测单条内容（快速路径）
   * @param {string} text - 待检测文本
   * @param {HTMLElement} element - DOM元素
   * @param {Object} options - 选项
   * @returns {Promise<Object>} 检测结果
   */
  async detect(text, element, options = {}) {
    this.stats.totalDetected++;

    // 第一层：本地快速过滤（0延迟）
    const localResult = this._localQuickFilter(text);
    if (localResult.shouldBlock) {
      this.stats.localBlocked++;
      this._log(`🚫 本地规则拦截: ${text.substring(0, 30)}...`);
      return localResult;
    }

    // 第二层：WebSocket 实时检测（低延迟）
    if (this.isEnabled) {
      try {
        const startTime = Date.now();
        
        const response = await chrome.runtime.sendMessage({
          action: 'detectRealtimeText',
          text: text,
          metadata: {
            elementId: options.elementId,
            url: window.location.href
          }
        });

        const responseTime = Date.now() - startTime;
        this._updateAvgResponseTime(responseTime);

        if (response.success) {
          const result = this._processWSResult(response.result);
          
          if (result.shouldBlock) {
            this.stats.wsBlocked++;
            this._log(`🚫 WebSocket 拦截 (${responseTime}ms): ${text.substring(0, 30)}...`);
          }
          
          return result;
        }

      } catch (error) {
        this._log('❌ WebSocket 检测失败:', error);
        this.stats.errors++;
      }
    }

    // 降级：返回安全
    return {
      shouldBlock: false,
      category: 'safe',
      confidence: 0,
      source: 'fallback'
    };
  }

  /**
   * 本地快速过滤
   * @private
   */
  _localQuickFilter(text) {
    // 检查黑名单关键词
    for (const pattern of this.blacklistPatterns) {
      if (pattern.test(text)) {
        return {
          shouldBlock: true,
          category: 'harmful',
          confidence: 1.0,
          source: 'local',
          reason: '命中本地黑名单规则'
        };
      }
    }

    return {
      shouldBlock: false,
      category: 'safe',
      confidence: 0,
      source: 'local'
    };
  }

  /**
   * 处理 WebSocket 检测结果
   * @private
   */
  _processWSResult(result) {
    // 将 AI 返回的结果转换为标准格式
    const shouldBlock = result.category !== 'safe' && result.confidence >= 0.6;

    return {
      shouldBlock: shouldBlock,
      category: result.category,
      confidence: result.confidence,
      reason: result.reason,
      source: 'websocket',
      responseTime: result.responseTime
    };
  }

  /**
   * 更新平均响应时间
   * @private
   */
  _updateAvgResponseTime(newTime) {
    const total = this.stats.totalDetected;
    this.stats.avgResponseTime = 
      (this.stats.avgResponseTime * (total - 1) + newTime) / total;
  }

  /**
   * 批量检测（用于页面初次加载）
   * @param {Array<{text: string, element: HTMLElement}>} items
   * @returns {Promise<Array<Object>>}
   */
  async detectBatch(items) {
    const results = [];

    // 并发处理（利用 WebSocket 的优势）
    const promises = items.map(item => this.detect(item.text, item.element));
    
    for (const promise of promises) {
      try {
        const result = await promise;
        results.push(result);
      } catch (error) {
        this._log('❌ 批量检测失败:', error);
        results.push({
          shouldBlock: false,
          category: 'safe',
          confidence: 0,
          error: error.message
        });
      }
    }

    return results;
  }

  /**
   * 停止实时检测
   */
  async stop() {
    try {
      await chrome.runtime.sendMessage({
        action: 'stopRealtimeDetection'
      });
      this._log('🛑 实时检测已停止');
    } catch (error) {
      this._log('❌ 停止实时检测失败:', error);
    }
  }

  /**
   * 获取统计信息
   */
  getStats() {
    return {
      ...this.stats,
      blockRate: this.stats.totalDetected > 0 
        ? ((this.stats.localBlocked + this.stats.wsBlocked) / this.stats.totalDetected * 100).toFixed(2) + '%'
        : '0%',
      avgResponseTime: Math.round(this.stats.avgResponseTime) + 'ms'
    };
  }

  /**
   * 重置统计
   */
  resetStats() {
    this.stats = {
      totalDetected: 0,
      localBlocked: 0,
      wsBlocked: 0,
      avgResponseTime: 0,
      errors: 0
    };
  }

  /**
   * 日志输出
   * @private
   */
  _log(...args) {
    if (this.settings.enableDebugLogs) {
      console.log('[RealtimeDetector]', ...args);
    }
  }
}

// 导出
if (typeof module !== 'undefined' && module.exports) {
  module.exports = RealtimeDetector;
}
