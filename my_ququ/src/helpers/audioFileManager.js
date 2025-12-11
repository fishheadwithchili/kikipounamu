const fs = require('fs');
const path = require('path');
const { app } = require('electron');

class AudioFileManager {
  constructor(logger = null) {
    this.logger = logger || console;
    this.recordingsDir = null;
    this.maxRecordings = 10;
  }

  initialize() {
    try {
      this.recordingsDir = this.getRecordingsDirectory();
      
      if (!fs.existsSync(this.recordingsDir)) {
        fs.mkdirSync(this.recordingsDir, { recursive: true });
        this.logger.info && this.logger.info('创建录音文件夹:', this.recordingsDir);
      }
      
      return { success: true, path: this.recordingsDir };
    } catch (error) {
      this.logger.error && this.logger.error('初始化录音文件夹失败:', error);
      return { success: false, error: error.message };
    }
  }

  getRecordingsDirectory() {
    const isDev = process.env.NODE_ENV === 'development';
    
    if (isDev) {
      return path.join(__dirname, '..', '..', 'recordings');
    } else {
      return path.join(app.getPath('userData'), 'recordings');
    }
  }

  async saveRecording(audioBlob, timestamp) {
    try {
      if (!this.recordingsDir) {
        this.initialize();
      }

      const fileName = `${timestamp}_recording.wav`;
      const filePath = path.join(this.recordingsDir, fileName);
      
      this.logger.info && this.logger.info('保存录音文件:', filePath);

      let buffer;
      if (audioBlob instanceof ArrayBuffer) {
        buffer = Buffer.from(audioBlob);
      } else if (audioBlob instanceof Uint8Array) {
        buffer = Buffer.from(audioBlob);
      } else if (audioBlob.buffer) {
        buffer = Buffer.from(audioBlob.buffer);
      } else {
        throw new Error('不支持的音频数据类型');
      }

      await fs.promises.writeFile(filePath, buffer);

      const stats = await fs.promises.stat(filePath);
      this.logger.info && this.logger.info('录音文件已保存:', {
        path: filePath,
        size: stats.size
      });

      await this.cleanupOldRecordings();

      const relativePath = path.relative(
        path.join(this.recordingsDir, '..'),
        filePath
      );

      return {
        success: true,
        filePath: filePath,
        relativePath: `recordings/${fileName}`,
        size: stats.size
      };

    } catch (error) {
      this.logger.error && this.logger.error('保存录音文件失败:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async cleanupOldRecordings() {
    try {
      const recordings = await this.getRecordingsList();
      
      if (recordings.length > this.maxRecordings) {
        const toDelete = recordings.slice(this.maxRecordings);
        
        for (const recording of toDelete) {
          try {
            await fs.promises.unlink(recording.path);
            this.logger.info && this.logger.info('删除旧录音:', recording.name);
          } catch (err) {
            this.logger.warn && this.logger.warn('删除录音失败:', recording.name, err);
          }
        }
        
        this.logger.info && this.logger.info(`清理完成，保留最近 ${this.maxRecordings} 条录音`);
      }
      
      return { success: true };
      
    } catch (error) {
      this.logger.error && this.logger.error('清理旧录音失败:', error);
      return { success: false, error: error.message };
    }
  }

  async getRecordingsList() {
    try {
      if (!this.recordingsDir || !fs.existsSync(this.recordingsDir)) {
        return [];
      }

      const files = await fs.promises.readdir(this.recordingsDir);
      
      const recordings = [];
      for (const file of files) {
        if (!file.endsWith('.wav')) continue;
        
        const filePath = path.join(this.recordingsDir, file);
        try {
          const stats = await fs.promises.stat(filePath);
          recordings.push({
            name: file,
            path: filePath,
            size: stats.size,
            created_at: stats.birthtime
          });
        } catch (err) {
          this.logger.warn && this.logger.warn('读取录音文件信息失败:', file, err);
        }
      }

      recordings.sort((a, b) => b.created_at - a.created_at);
      
      return recordings;
      
    } catch (error) {
      this.logger.error && this.logger.error('获取录音列表失败:', error);
      return [];
    }
  }

  async deleteRecording(filePath) {
    try {
      await fs.promises.unlink(filePath);
      this.logger.info && this.logger.info('录音文件已删除:', filePath);
      return { success: true };
    } catch (error) {
      this.logger.error && this.logger.error('删除录音文件失败:', error);
      return { success: false, error: error.message };
    }
  }
}

module.exports = AudioFileManager;

