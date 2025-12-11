#!/usr/bin/env node

/**
 * VAD 自动化测试脚本
 * 使用测试音频文件验证 VAD 的检测和切分能力
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// VAD 配置 (与 useVADRecording.ts 保持一致)
const VAD_CONFIG = {
    speechThreshold: 0.1,
    silenceThreshold: 0.35,
    minSpeechDurationMs: 200,
    minSilenceDurationMs: 500,
};

const SAMPLE_RATE = 16000;
const BUFFER_SIZE = 2048;
const BUFFER_SIZE_MS = Math.floor(BUFFER_SIZE * 1000 / SAMPLE_RATE);

console.log('════════════════════════════════════════════════════════');
console.log('         VAD 自动化测试 - 音频文件模式');
console.log('════════════════════════════════════════════════════════\n');

// 读取 WAV 文件并提取 PCM 数据
function readWavFile(filePath) {
    console.log(`📂 读取音频文件: ${filePath}`);

    const buffer = fs.readFileSync(filePath);

    // 简单 WAV 解析 (假设标准格式)
    const dataOffset = 44; // 标准 WAV 头部大小
    const pcmData = buffer.slice(dataOffset);

    // 转换为 Float32Array (假设是 16-bit PCM)
    const samples = new Int16Array(
        pcmData.buffer,
        pcmData.byteOffset,
        pcmData.byteLength / 2
    );

    const float32 = new Float32Array(samples.length);
    for (let i = 0; i < samples.length; i++) {
        float32[i] = samples[i] / 32768.0; // 归一化到 [-1, 1]
    }

    const durationSec = float32.length / SAMPLE_RATE;
    console.log(`✅ 音频加载完成: ${float32.length} 样本, ${durationSec.toFixed(2)}秒\n`);

    return float32;
}

// 模拟 VAD 检测 (简化版，使用能量检测)
function simpleVAD(audioChunk) {
    // 计算 RMS 能量
    let sum = 0;
    for (let i = 0; i < audioChunk.length; i++) {
        sum += audioChunk[i] * audioChunk[i];
    }
    const rms = Math.sqrt(sum / audioChunk.length);

    // 简单的能量到概率映射
    // RMS > 0.05 → 高语音概率
    // RMS < 0.01 → 低语音概率
    let speechProb;
    if (rms > 0.05) {
        speechProb = 0.8;
    } else if (rms > 0.02) {
        speechProb = 0.5;
    } else if (rms > 0.01) {
        speechProb = 0.2;
    } else {
        speechProb = 0.05;
    }

    return { speechProb, rms };
}

// 执行 VAD 测试
async function testVAD(audioData) {
    console.log('🎯 开始 VAD 测试...\n');
    console.log(`配置信息:`);
    console.log(`  - 语音阈值: ${VAD_CONFIG.speechThreshold}`);
    console.log(`  - 静音阈值: ${VAD_CONFIG.silenceThreshold}`);
    console.log(`  - 最小静音时长: ${VAD_CONFIG.minSilenceDurationMs}ms`);
    console.log(`  - 缓冲区大小: ${BUFFER_SIZE} (${BUFFER_SIZE_MS}ms)\n`);

    console.log('────────────────────────────────────────────────────────\n');

    let speechBuffer = [];
    let silenceFrames = 0;
    let speechFrames = 0;
    let isSpeaking = false;
    let chunkCount = 0;

    const totalFrames = Math.floor(audioData.length / BUFFER_SIZE);
    let lastLogTime = Date.now();

    for (let i = 0; i < totalFrames; i++) {
        const start = i * BUFFER_SIZE;
        const end = Math.min(start + BUFFER_SIZE, audioData.length);
        const chunk = audioData.slice(start, end);

        if (chunk.length < BUFFER_SIZE) break;

        // 模拟 VAD 检测
        const { speechProb, rms } = simpleVAD(chunk);

        // 每秒输出一次进度
        const now = Date.now();
        if (now - lastLogTime > 1000) {
            const progress = ((i / totalFrames) * 100).toFixed(1);
            const currentTime = (i * BUFFER_SIZE / SAMPLE_RATE).toFixed(1);
            console.log(`⏱️  进度: ${progress}% | 时间: ${currentTime}s | RMS: ${rms.toFixed(4)} | 概率: ${speechProb.toFixed(3)} | 切片: ${chunkCount}`);
            lastLogTime = now;
        }

        if (speechProb >= VAD_CONFIG.speechThreshold) {
            // 检测到语音
            speechFrames++;
            silenceFrames = 0;

            if (!isSpeaking && speechFrames >= 2) {
                isSpeaking = true;
                const timestamp = (i * BUFFER_SIZE / SAMPLE_RATE).toFixed(2);
                console.log(`\n🔊 [${timestamp}s] 开始说话 (prob=${speechProb.toFixed(3)}, rms=${rms.toFixed(4)})`);
            }

            speechBuffer.push(chunk);

        } else if (speechProb < VAD_CONFIG.silenceThreshold) {
            // 检测到静音
            silenceFrames++;
            speechFrames = 0;

            // VAD 模式：始终缓冲
            speechBuffer.push(chunk);

            // 检查是否需要切分
            const silenceDurationMs = silenceFrames * BUFFER_SIZE_MS;
            if (silenceDurationMs >= VAD_CONFIG.minSilenceDurationMs && isSpeaking) {
                const timestamp = (i * BUFFER_SIZE / SAMPLE_RATE).toFixed(2);
                console.log(`🔇 [${timestamp}s] 检测到静音 ${silenceDurationMs}ms，执行切分`);

                if (speechBuffer.length > 0) {
                    const totalSamples = speechBuffer.reduce((sum, buf) => sum + buf.length, 0);
                    const durationSec = (totalSamples / SAMPLE_RATE).toFixed(2);
                    const sizeKB = (totalSamples * 4 / 1024).toFixed(1);

                    chunkCount++;
                    console.log(`✂️  音频块 #${chunkCount} | ${totalSamples} 样本 | ${durationSec}s | ${sizeKB}KB\n`);

                    speechBuffer = [];
                    silenceFrames = 0;
                }

                isSpeaking = false;
            }
        }
    }

    // 处理剩余缓冲
    if (speechBuffer.length > 0) {
        const totalSamples = speechBuffer.reduce((sum, buf) => sum + buf.length, 0);
        const durationSec = (totalSamples / SAMPLE_RATE).toFixed(2);
        const sizeKB = (totalSamples * 4 / 1024).toFixed(1);

        chunkCount++;
        console.log(`\n✂️  [最后] 音频块 #${chunkCount} | ${totalSamples} 样本 | ${durationSec}s | ${sizeKB}KB`);
    }

    console.log('\n────────────────────────────────────────────────────────');
    console.log(`\n✅ 测试完成！`);
    console.log(`   总切片数: ${chunkCount}`);
    console.log(`   总帧数: ${totalFrames}`);
    console.log(`   音频时长: ${(audioData.length / SAMPLE_RATE).toFixed(2)}s\n`);
}

// 主函数
async function main() {
    const audioPath = process.argv[2] || '/home/tiger/Projects/ASR_pc_front/recording/long_audio_test.wav';

    if (!fs.existsSync(audioPath)) {
        console.error(`❌ 音频文件不存在: ${audioPath}`);
        process.exit(1);
    }

    try {
        const audioData = readWavFile(audioPath);
        await testVAD(audioData);
    } catch (err) {
        console.error('❌ 测试失败:', err);
        process.exit(1);
    }
}

main().catch(console.error);
