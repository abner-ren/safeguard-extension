/**
 * SafeGuard Logger - 日志管理工具
 * 用于记录和保存图片识别等关键操作的日志
 */

class Logger {
  constructor() {
    this.logs = [];
    this.maxLogsInMemory = 100; // 内存中最多保留100条日志
    this.logFilePath = null; // 日志文件路径（将在使用时创建）
  }

  /**
   * 记录图片识别日志
   * @param {Object} logData - 日志数据
   * @param {string} logData.imageUrl - 图片 URL
   * @param {string} logData.result - 识别结果 (safe/privacy/sensitive/harmful)
   * @param {number} logData.confidence - 置信度
   * @param {string} logData.provider - AI 提供商 (gemini/qwen/deepseek)
   * @param {number} logData.processingTime - 处理时间（毫秒）
   * @param {string} logData.error - 错误信息（如有）
   */
  logImageDetection(logData) {
    const logEntry = {
      timestamp: new Date().toISOString(),
      type: 'image_detection',
      ...logData
    };
    
    this.logs.push(logEntry);
    
    // 保持内存中日志数量限制
    if (this.logs.length > this.maxLogsInMemory) {
      this.logs.shift();
    }
    
    // 输出到控制台
    console.log('[SafeGuard Logger] 图片检测:', {
      url: logData.imageUrl?.substring(0, 100),
      result: logData.result,
      provider: logData.provider,
      time: `${logData.processingTime}ms`
    });
    
    // 保存到文件（异步）
    this._saveToFile(logEntry);
  }

  /**
   * 记录文本检测日志（可选）
   * @param {Object} logData - 日志数据
   */
  logTextDetection(logData) {
    const logEntry = {
      timestamp: new Date().toISOString(),
      type: 'text_detection',
      ...logData
    };
    
    this.logs.push(logEntry);
    
    if (this.logs.length > this.maxLogsInMemory) {
      this.logs.shift();
    }
    
    console.log('[SafeGuard Logger] 文本检测:', {
      textCount: logData.textCount,
      result: logData.result,
      provider: logData.provider
    });
    
    // 暂不保存文本检测到文件（避免文件过大）
  }

  /**
   * 保存日志到文件（通过 Background Service Worker）
   * @private
   */
  async _saveToFile(logEntry) {
    try {
      await chrome.runtime.sendMessage({
        action: 'saveLog',
        logEntry: logEntry
      });
    } catch (error) {
      console.error('[SafeGuard Logger] 保存日志失败:', error);
    }
  }

  /**
   * 获取所有内存中的日志
   * @returns {Array} 日志数组
   */
  getLogs() {
    return this.logs;
  }

  /**
   * 清空内存中的日志
   */
  clearLogs() {
    this.logs = [];
    console.log('[SafeGuard Logger] 已清空内存日志');
  }

  /**
   * 导出日志为 JSON 字符串
   * @returns {string} JSON 格式的日志
   */
  exportLogs() {
    return JSON.stringify(this.logs, null, 2);
  }

  /**
   * 下载日志文件
   */
  async downloadLogs() {
    try {
      const response = await chrome.runtime.sendMessage({
        action: 'downloadLogs'
      });
      
      if (response.success) {
        console.log('[SafeGuard Logger] 日志已下载');
      } else {
        console.error('[SafeGuard Logger] 下载日志失败:', response.error);
      }
    } catch (error) {
      console.error('[SafeGuard Logger] 下载日志失败:', error);
    }
  }
}

// 导出单例
const logger = new Logger();
export default logger;
