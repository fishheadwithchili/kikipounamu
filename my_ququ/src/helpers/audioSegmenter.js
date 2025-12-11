const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

class AudioSegmenter {
  constructor(logger = null) {
    this.logger = logger || console;
    this.segmentDuration = 180;
    this.ffmpegPath = null;
  }

  getFfmpegPath() {
    if (this.ffmpegPath) {
      return this.ffmpegPath;
    }

    try {
      const ffmpegStatic = require('ffmpeg-static');
      
      if (ffmpegStatic && fs.existsSync(ffmpegStatic)) {
        this.ffmpegPath = ffmpegStatic;
        this.logger.info && this.logger.info('使用 ffmpeg-static:', ffmpegStatic);
        return this.ffmpegPath;
      } else {
        this.logger.warn && this.logger.warn('ffmpeg-static 路径无效:', ffmpegStatic);
      }
    } catch (err) {
      this.logger.warn && this.logger.warn('无法加载 ffmpeg-static:', err.message);
    }

    const systemFfmpeg = 'ffmpeg';
    this.logger.info && this.logger.info('回退到系统 FFmpeg');
    this.ffmpegPath = systemFfmpeg;
    return this.ffmpegPath;
  }

  async getAudioDuration(audioFilePath) {
    return new Promise((resolve, reject) => {
      if (!fs.existsSync(audioFilePath)) {
        return reject(new Error(`音频文件不存在: ${audioFilePath}`));
      }

      this.logger.info && this.logger.info('检测音频时长:', audioFilePath);

      const ffmpeg = spawn(this.getFfmpegPath(), [
        '-i', audioFilePath,
        '-hide_banner'
      ], {
        windowsHide: true
      });

      let output = '';
      
      ffmpeg.stderr.on('data', (data) => {
        output += data.toString();
      });

      ffmpeg.on('close', () => {
        const durationMatch = output.match(/Duration: (\d{2}):(\d{2}):(\d{2}\.\d{2})/);
        
        if (durationMatch) {
          const hours = parseInt(durationMatch[1]);
          const minutes = parseInt(durationMatch[2]);
          const seconds = parseFloat(durationMatch[3]);
          const totalSeconds = hours * 3600 + minutes * 60 + seconds;
          
          this.logger.info && this.logger.info('音频时长:', totalSeconds, '秒');
          resolve(totalSeconds);
        } else {
          this.logger.warn && this.logger.warn('无法解析音频时长，FFmpeg输出:', output.substring(0, 500));
          resolve(0);
        }
      });

      ffmpeg.on('error', (error) => {
        this.logger.error && this.logger.error('FFmpeg进程错误:', error);
        reject(new Error(`FFmpeg执行失败: ${error.message}`));
      });
    });
  }

  shouldSegment(duration) {
    return duration > this.segmentDuration;
  }

  async segmentAudio(audioFilePath) {
    try {
      const duration = await this.getAudioDuration(audioFilePath);
      
      if (!this.shouldSegment(duration)) {
        return {
          success: true,
          needsSegmentation: false,
          duration: duration,
          segments: [{
            segmentPath: audioFilePath,
            startTime: 0,
            duration: duration,
            isOriginal: true
          }]
        };
      }

      const segmentCount = Math.ceil(duration / this.segmentDuration);
      const segments = [];
      
      this.logger.info && this.logger.info(`音频需要分段，总时长: ${duration}秒，分为 ${segmentCount} 段`);

      const tempDir = os.tmpdir();
      const uniqueId = crypto.randomUUID();

      for (let i = 0; i < segmentCount; i++) {
        const startTime = i * this.segmentDuration;
        const segmentPath = path.join(tempDir, `segment_${uniqueId}_${i}.wav`);
        
        await this.extractSegment(audioFilePath, startTime, this.segmentDuration, segmentPath);
        
        const actualDuration = await this.getAudioDuration(segmentPath);
        
        segments.push({
          segmentPath: segmentPath,
          startTime: startTime,
          duration: actualDuration,
          index: i,
          isOriginal: false
        });
        
        this.logger.info && this.logger.info(`分段 ${i+1}/${segmentCount} 创建完成:`, segmentPath);
      }

      return {
        success: true,
        needsSegmentation: true,
        totalDuration: duration,
        segmentCount: segmentCount,
        segments: segments
      };

    } catch (error) {
      this.logger.error && this.logger.error('音频分段失败:', error);
      return {
        success: false,
        error: error.message,
        needsSegmentation: false,
        segments: []
      };
    }
  }

  async extractSegment(inputPath, startTime, duration, outputPath) {
    return new Promise((resolve, reject) => {
      this.logger.info && this.logger.info(`提取音频段: ${startTime}秒 - ${startTime + duration}秒`);

      const ffmpeg = spawn(this.getFfmpegPath(), [
        '-i', inputPath,
        '-ss', startTime.toString(),
        '-t', duration.toString(),
        '-c', 'copy',
        '-y',
        outputPath
      ], {
        windowsHide: true
      });

      let stderr = '';
      
      ffmpeg.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      ffmpeg.on('close', (code) => {
        if (code === 0 && fs.existsSync(outputPath)) {
          resolve();
        } else {
          this.logger.error && this.logger.error('FFmpeg分段失败，输出:', stderr.substring(0, 500));
          reject(new Error(`FFmpeg分段失败，退出代码: ${code}`));
        }
      });

      ffmpeg.on('error', (error) => {
        reject(new Error(`FFmpeg进程错误: ${error.message}`));
      });
    });
  }

  async cleanupSegments(segments) {
    try {
      for (const segment of segments) {
        if (!segment.isOriginal && fs.existsSync(segment.segmentPath)) {
          try {
            await fs.promises.unlink(segment.segmentPath);
            this.logger.info && this.logger.info('清理分段文件:', segment.segmentPath);
          } catch (err) {
            this.logger.warn && this.logger.warn('清理分段文件失败:', segment.segmentPath, err);
          }
        }
      }
      
      return { success: true };
    } catch (error) {
      this.logger.error && this.logger.error('清理分段文件失败:', error);
      return { success: false, error: error.message };
    }
  }

  mergeTranscriptions(segmentResults) {
    try {
      if (!segmentResults || segmentResults.length === 0) {
        return {
          success: false,
          error: '没有可合并的转录结果'
        };
      }

      if (segmentResults.length === 1) {
        return {
          success: true,
          ...segmentResults[0]
        };
      }

      const mergedText = segmentResults.map(r => r.text || '').join('');
      const mergedRawText = segmentResults.map(r => r.raw_text || '').join('');

      const totalConfidence = segmentResults.reduce((sum, r) => sum + (r.confidence || 0), 0);
      const avgConfidence = totalConfidence / segmentResults.length;

      const totalDuration = segmentResults.reduce((sum, r) => sum + (r.duration || 0), 0);

      this.logger.info && this.logger.info('转录结果合并完成:', {
        segmentCount: segmentResults.length,
        totalLength: mergedText.length,
        avgConfidence: avgConfidence.toFixed(2)
      });

      return {
        success: true,
        text: mergedText,
        raw_text: mergedRawText,
        confidence: avgConfidence,
        duration: totalDuration,
        language: segmentResults[0]?.language || 'zh-CN',
        segmentCount: segmentResults.length
      };

    } catch (error) {
      this.logger.error && this.logger.error('合并转录结果失败:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }
}

module.exports = AudioSegmenter;

