#!/usr/bin/env node

/**
 * FunASR VAD 真实模型自动化测试
 * 直接在 Node.js 环境中运行，使用真实的 ONNX 模型
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as ort from 'onnxruntime-node';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// VAD 配置
const VAD_CONFIG = {
    speechThreshold: 0.1,
    silenceThreshold: 0.35,
    minSpeechDurationMs: 200,
    minSilenceDurationMs: 500,
};

const SAMPLE_RATE = 16000;
const BUFFER_SIZE = 2048;
const BUFFER_SIZE_MS = Math.floor(BUFFER_SIZE * 1000 / SAMPLE_RATE);

console.log('\n╔════════════════════════════════════════════════════════╗');
console.log('║     FunASR VAD 真实模型测试 (ONNX Runtime Node)       ║');
console.log('╚════════════════════════════════════════════════════════╝\n');

// 读取 WAV 文件
function readWavFile(filePath) {
    console.log(`📂 读取音频文件: ${filePath}`);

    const buffer = fs.readFileSync(filePath);
    const dataOffset = 44;
    const pcmData = buffer.slice(dataOffset);

    const samples = new Int16Array(
        pcmData.buffer,
        pcmData.byteOffset,
        pcmData.byteLength / 2
    );

    const float32 = new Float32Array(samples.length);
    for (let i = 0; i < samples.length; i++) {
        float32[i] = samples[i] / 32768.0;
    }

    const durationSec = float32.length / SAMPLE_RATE;
    const sizeMB = (buffer.length / 1024 / 1024).toFixed(2);
    console.log(`✅ 音频加载完成:`);
    console.log(`   - 样本数: ${float32.length.toLocaleString()}`);
    console.log(`   - 时长: ${durationSec.toFixed(2)}秒`);
    console.log(`   - 文件大小: ${sizeMB}MB\n`);

    return float32;
}

// 读取 CMVN 文件
function loadCMVN(cmvnPath) {
    console.log(`📊 加载 CMVN 归一化参数: ${cmvnPath}`);

    const content = fs.readFileSync(cmvnPath, 'utf-8');
    const lines = content.trim().split('\n');

    if (lines.length < 2) {
        throw new Error('Invalid CMVN file format');
    }

    const parseLine = (line) => {
        const values = line.trim().split(/\s+/).slice(1);
        return values.map(v => parseFloat(v));
    };

    const means = parseLine(lines[0]);
    const vars = parseLine(lines[1]);

    console.log(`✅ CMVN 加载完成: ${means.length} 维特征\n`);

    return { means, vars };
}

// 提取 Fbank 特征 (简化版，与浏览器版本一致)
function extractFbank(audioChunk, numMels = 80) {
    // 这里使用简化的能量特征作为占位
    // 实际应用中会使用完整的 Fbank 实现
    const feature = new Float32Array(numMels);

    // 计算能量分布
    let totalEnergy = 0;
    for (let i = 0; i < audioChunk.length; i++) {
        totalEnergy += audioChunk[i] * audioChunk[i];
    }

    // 简化的频谱能量分布
    for (let i = 0; i < numMels; i++) {
        const start = Math.floor(i * audioChunk.length / numMels);
        const end = Math.floor((i + 1) * audioChunk.length / numMels);

        let binEnergy = 0;
        for (let j = start; j < end; j++) {
            binEnergy += audioChunk[j] * audioChunk[j];
        }

        feature[i] = binEnergy / (end - start);
    }

    return feature;
}

// 应用 CMVN 归一化
function applyCMVN(feature, cmvn) {
    const normalized = new Float32Array(feature.length);
    for (let i = 0; i < feature.length; i++) {
        const mean = cmvn.means[i] || 0;
        const variance = cmvn.vars[i] || 1;
        normalized[i] = (feature[i] - mean) / Math.sqrt(variance);
    }
    return normalized;
}

// VAD 推理类
class FunASRVADNode {
    constructor(config) {
        this.config = config;
        this.session = null;
        this.cmvn = null;
        this.cache = null;
        this.cacheSize = 5; // LFR 5 frames
    }

    async init(modelPath, cmvnPath) {
        console.log('🔄 初始化 FunASR VAD 模型...');
        console.log(`   - 模型路径: ${modelPath}`);
        console.log(`   - CMVN 路径: ${cmvnPath}`);

        // 加载 CMVN
        this.cmvn = loadCMVN(cmvnPath);

        // 加载 ONNX 模型
        console.log('🔄 加载 ONNX 模型...');
        this.session = await ort.InferenceSession.create(modelPath);

        console.log('✅ ONNX 模型加载完成');
        console.log(`   - 输入节点: ${this.session.inputNames.join(', ')}`);
        console.log(`   - 输出节点: ${this.session.outputNames.join(', ')}\n`);

        // 初始化缓存
        this.cache = {
            features: [],
            fsmn: {}
        };
    }

    async detect(audioChunk) {
        // 提取特征
        const feature = extractFbank(audioChunk);

        // 应用 CMVN
        const normalized = applyCMVN(feature, this.cmvn);

        // 添加到缓存
        this.cache.features.push(normalized);

        // 保持缓存大小
        if (this.cache.features.length > this.cacheSize) {
            this.cache.features.shift();
        }

        // 如果缓存未满，返回低概率
        if (this.cache.features.length < this.cacheSize) {
            return 0.0;
        }

        // 构建输入张量 [1, 5, 80]
        const inputData = new Float32Array(1 * this.cacheSize * 80);
        for (let i = 0; i < this.cacheSize; i++) {
            inputData.set(this.cache.features[i], i * 80);
        }

        const inputTensor = new ort.Tensor('float32', inputData, [1, this.cacheSize, 80]);

        // 准备所有输入 (包括 cache)
        const feeds = {};
        feeds[this.session.inputNames[0]] = inputTensor; // 'speech'

        // FSMN Cache inputs (in_cache0, in_cache1, in_cache2, in_cache3)
        const CACHE_SHAPE = [1, 128, 19, 1];
        const CACHE_SIZE = 1 * 128 * 19 * 1;

        for (let i = 1; i < this.session.inputNames.length; i++) {
            const inputName = this.session.inputNames[i];
            if (this.cache.fsmn[inputName]) {
                feeds[inputName] = new ort.Tensor('float32', this.cache.fsmn[inputName], CACHE_SHAPE);
            } else {
                feeds[inputName] = new ort.Tensor('float32', new Float32Array(CACHE_SIZE), CACHE_SHAPE);
            }
        }

        // 运行推理
        const results = await this.session.run(feeds);

        // 更新 FSMN Cache
        for (let i = 1; i < this.session.outputNames.length; i++) {
            const outputKey = this.session.outputNames[i];
            if (i < this.session.inputNames.length) {
                const inputKey = this.session.inputNames[i];
                this.cache.fsmn[inputKey] = results[outputKey].data;
            }
        }

        // 获取语音概率
        const output = results[this.session.outputNames[0]];
        const outputData = output.data;

        // 输出 shape [1, numFrames, 2] => [silence_prob, speech_prob]
        // 取平均语音概率
        let speechProb = 0;
        const numFrames = this.cacheSize;

        if (outputData.length === numFrames * 2) {
            for (let i = 0; i < outputData.length; i += 2) {
                speechProb += outputData[i + 1]; // speech_prob at index 1
            }
            return speechProb / numFrames;
        } else {
            // Fallback
            for (let i = 0; i < outputData.length; i++) {
                speechProb += outputData[i];
            }
            return speechProb / outputData.length;
        }
    }

    reset() {
        this.cache = {
            features: [],
            fsmn: {}
        };
    }
}

// 执行 VAD 测试
async function testVAD(audioData, modelPath, cmvnPath) {
    console.log('═'.repeat(60));
    console.log('🎯 开始 VAD 测试\n');

    console.log('配置信息:');
    console.log(`  - 语音阈值: ${VAD_CONFIG.speechThreshold}`);
    console.log(`  - 静音阈值: ${VAD_CONFIG.silenceThreshold}`);
    console.log(`  - 最小静音时长: ${VAD_CONFIG.minSilenceDurationMs}ms`);
    console.log(`  - 缓冲区大小: ${BUFFER_SIZE} (${BUFFER_SIZE_MS}ms)\n`);

    // 初始化 VAD
    const vad = new FunASRVADNode(VAD_CONFIG);
    await vad.init(modelPath, cmvnPath);

    console.log('═'.repeat(60));
    console.log('\n开始处理音频...\n');

    let speechBuffer = [];
    let silenceFrames = 0;
    let speechFrames = 0;
    let isSpeaking = false;
    let chunkCount = 0;
    const chunks = [];

    const totalFrames = Math.floor(audioData.length / BUFFER_SIZE);
    let lastProgressUpdate = Date.now();
    let processedFrames = 0;

    for (let i = 0; i < totalFrames; i++) {
        const start = i * BUFFER_SIZE;
        const end = Math.min(start + BUFFER_SIZE, audioData.length);
        const chunk = audioData.slice(start, end);

        if (chunk.length < BUFFER_SIZE) break;

        // VAD 检测
        const speechProb = await vad.detect(chunk);

        processedFrames++;

        // 每秒更新一次进度
        const now = Date.now();
        if (now - lastProgressUpdate > 1000) {
            const progress = (processedFrames / totalFrames * 100).toFixed(1);
            const currentTime = (i * BUFFER_SIZE / SAMPLE_RATE).toFixed(1);
            process.stdout.write(`\r⏱️  进度: ${progress}% | 时间: ${currentTime}s | 切片: ${chunkCount}   `);
            lastProgressUpdate = now;
        }

        if (speechProb >= VAD_CONFIG.speechThreshold) {
            // 语音
            speechFrames++;
            silenceFrames = 0;

            if (!isSpeaking && speechFrames >= 2) {
                isSpeaking = true;
                const timestamp = (i * BUFFER_SIZE / SAMPLE_RATE).toFixed(2);
                console.log(`\n🔊 [${timestamp}s] 开始说话 (prob=${speechProb.toFixed(3)})`);
            }

            speechBuffer.push(chunk);

        } else if (speechProb < VAD_CONFIG.silenceThreshold) {
            // 静音
            silenceFrames++;
            speechFrames = 0;

            // VAD 模式：始终缓冲
            speechBuffer.push(chunk);

            // 检查是否需要切分
            const silenceDurationMs = silenceFrames * BUFFER_SIZE_MS;
            if (silenceDurationMs >= VAD_CONFIG.minSilenceDurationMs && isSpeaking) {
                const timestamp = (i * BUFFER_SIZE / SAMPLE_RATE).toFixed(2);

                if (speechBuffer.length > 0) {
                    const totalSamples = speechBuffer.reduce((sum, buf) => sum + buf.length, 0);
                    const durationSec = (totalSamples / SAMPLE_RATE).toFixed(2);
                    const sizeKB = (totalSamples * 4 / 1024).toFixed(1);

                    chunkCount++;
                    console.log(`🔇 [${timestamp}s] 检测到静音 ${silenceDurationMs}ms，执行切分`);
                    console.log(`✂️  音频块 #${chunkCount} | ${totalSamples} 样本 | ${durationSec}s | ${sizeKB}KB\n`);

                    chunks.push({
                        index: chunkCount,
                        timestamp: parseFloat(timestamp),
                        samples: totalSamples,
                        duration: parseFloat(durationSec),
                        sizeKB: parseFloat(sizeKB)
                    });

                    speechBuffer = [];
                    silenceFrames = 0;
                }

                isSpeaking = false;
            }
        }
    }

    console.log('\n');

    // 处理剩余缓冲
    if (speechBuffer.length > 0) {
        const totalSamples = speechBuffer.reduce((sum, buf) => sum + buf.length, 0);
        const durationSec = (totalSamples / SAMPLE_RATE).toFixed(2);
        const sizeKB = (totalSamples * 4 / 1024).toFixed(1);

        chunkCount++;
        console.log(`✂️  [最后] 音频块 #${chunkCount} | ${totalSamples} 样本 | ${durationSec}s | ${sizeKB}KB\n`);

        chunks.push({
            index: chunkCount,
            timestamp: 0,
            samples: totalSamples,
            duration: parseFloat(durationSec),
            sizeKB: parseFloat(sizeKB)
        });
    }

    // 显示总结
    console.log('═'.repeat(60));
    console.log('\n✅ 测试完成！\n');
    console.log(`统计信息:`);
    console.log(`  - 总切片数: ${chunkCount}`);
    console.log(`  - 总帧数: ${totalFrames.toLocaleString()}`);
    console.log(`  - 音频时长: ${(audioData.length / SAMPLE_RATE).toFixed(2)}秒`);

    if (chunks.length > 0) {
        const avgDuration = chunks.reduce((sum, c) => sum + c.duration, 0) / chunks.length;
        const minDuration = Math.min(...chunks.map(c => c.duration));
        const maxDuration = Math.max(...chunks.map(c => c.duration));

        console.log(`\n切片统计:`);
        console.log(`  - 平均时长: ${avgDuration.toFixed(2)}秒`);
        console.log(`  - 最短时长: ${minDuration.toFixed(2)}秒`);
        console.log(`  - 最长时长: ${maxDuration.toFixed(2)}秒`);
    }

    console.log('\n' + '═'.repeat(60) + '\n');

    return chunks;
}

// 主函数
async function main() {
    const audioPath = process.argv[2] || '/home/tiger/Projects/ASR_pc_front/recording/long_audio_test.wav';
    const modelPath = path.join(__dirname, 'public/models/model.onnx');
    const cmvnPath = path.join(__dirname, 'public/models/vad.mvn');

    // 检查文件
    if (!fs.existsSync(audioPath)) {
        console.error(`❌ 音频文件不存在: ${audioPath}`);
        process.exit(1);
    }

    if (!fs.existsSync(modelPath)) {
        console.error(`❌ 模型文件不存在: ${modelPath}`);
        process.exit(1);
    }

    if (!fs.existsSync(cmvnPath)) {
        console.error(`❌ CMVN 文件不存在: ${cmvnPath}`);
        process.exit(1);
    }

    try {
        const audioData = readWavFile(audioPath);
        const chunks = await testVAD(audioData, modelPath, cmvnPath);

        console.log(`\n✅ 测试成功完成！共检测到 ${chunks.length} 个语音片段。\n`);

    } catch (err) {
        console.error('\n❌ 测试失败:', err);
        console.error(err.stack);
        process.exit(1);
    }
}

main().catch(console.error);
