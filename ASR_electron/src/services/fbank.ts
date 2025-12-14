/**
 * FunASR FSMN-VAD 特征提取器
 * 
 * 配置：
 * - 采样率：16kHz
 * - 窗口：25ms (400 samples)
 * - 步长：10ms (160 samples)
 * - Mel bins：80
 * - LFR: m=5, n=1 (每5帧取1帧，输入维度 80*5=400)
 */

// Mel 滤波器参数
const SAMPLE_RATE = 16000;
const FRAME_LENGTH_MS = 25;
const FRAME_SHIFT_MS = 10;
const N_MELS = 80;
const N_FFT = 512;
const LFR_M = 5;  // 每5帧拼接
const LFR_N = 1;

// 导出常量供流式处理器使用
export const FRAME_LENGTH = Math.floor(SAMPLE_RATE * FRAME_LENGTH_MS / 1000); // 400 samples = 25ms
export const FRAME_SHIFT = Math.floor(SAMPLE_RATE * FRAME_SHIFT_MS / 1000);   // 160 samples = 10ms
export const MEL_BINS = N_MELS;
export const LFR_CONTEXT = LFR_M;

/**
 * 提取 Fbank 特征
 */
export function extractFbank(audioData: Float32Array): Float32Array {
    // 1. 分帧
    const frames = frameSignal(audioData, FRAME_LENGTH, FRAME_SHIFT);
    if (frames.length === 0) return new Float32Array(0);

    // 2. 加 Hamming 窗
    const windowedFrames = frames.map(frame => applyHammingWindow(frame));

    // 3. FFT
    const powerSpectrum = windowedFrames.map(frame => computePowerSpectrum(frame, N_FFT));

    // 4. Mel 滤波器
    const melFilters = createMelFilterbank(N_FFT, SAMPLE_RATE, N_MELS);
    const melSpectrum = powerSpectrum.map(spectrum => applyMelFilterbank(spectrum, melFilters));

    // 5. 取对数
    const logMelSpectrum = melSpectrum.map(mel =>
        mel.map(v => Math.log(Math.max(v, 1e-10)))
    );

    // 6. LFR (Low Frame Rate) - 5帧拼接
    const lfrFeatures = applyLFR(logMelSpectrum, LFR_M, LFR_N);

    // 7. 转换为一维数组
    const result = new Float32Array(lfrFeatures.length * lfrFeatures[0].length);
    for (let i = 0; i < lfrFeatures.length; i++) {
        result.set(lfrFeatures[i], i * lfrFeatures[0].length);
    }

    return result;
}

/**
 * 分帧
 */
function frameSignal(signal: Float32Array, frameLength: number, frameShift: number): Float32Array[] {
    const frames: Float32Array[] = [];
    for (let i = 0; i + frameLength <= signal.length; i += frameShift) {
        frames.push(signal.slice(i, i + frameLength));
    }
    return frames;
}

/**
 * Hamming 窗
 */
function applyHammingWindow(frame: Float32Array): Float32Array {
    const result = new Float32Array(frame.length);
    for (let i = 0; i < frame.length; i++) {
        const window = 0.54 - 0.46 * Math.cos(2 * Math.PI * i / (frame.length - 1));
        result[i] = frame[i] * window;
    }
    return result;
}

/**
 * 计算功率谱 (使用简化的 DFT)
 */
function computePowerSpectrum(frame: Float32Array, nfft: number): Float32Array {
    // 补零到 nfft
    const padded = new Float32Array(nfft);
    padded.set(frame);

    // 简化的 DFT (可以用 FFT 优化)
    const spectrum = new Float32Array(nfft / 2 + 1);

    for (let k = 0; k <= nfft / 2; k++) {
        let real = 0;
        let imag = 0;
        for (let n = 0; n < nfft; n++) {
            const angle = -2 * Math.PI * k * n / nfft;
            real += padded[n] * Math.cos(angle);
            imag += padded[n] * Math.sin(angle);
        }
        spectrum[k] = (real * real + imag * imag) / nfft;
    }

    return spectrum;
}

/**
 * Hz 转 Mel
 */
function hzToMel(hz: number): number {
    return 2595 * Math.log10(1 + hz / 700);
}

/**
 * Mel 转 Hz
 */
function melToHz(mel: number): number {
    return 700 * (Math.pow(10, mel / 2595) - 1);
}

/**
 * 创建 Mel 滤波器组
 */
function createMelFilterbank(nfft: number, sampleRate: number, nMels: number): Float32Array[] {
    const lowFreq = 0;
    const highFreq = sampleRate / 2;

    const lowMel = hzToMel(lowFreq);
    const highMel = hzToMel(highFreq);

    // Mel 刻度上均匀分布的点
    const melPoints = new Float32Array(nMels + 2);
    for (let i = 0; i < nMels + 2; i++) {
        melPoints[i] = lowMel + (highMel - lowMel) * i / (nMels + 1);
    }

    // 转回 Hz
    const hzPoints = melPoints.map(m => melToHz(m));

    // 转为 FFT bin 索引
    const binPoints = hzPoints.map(hz => Math.floor((nfft + 1) * hz / sampleRate));

    // 创建滤波器
    const filters: Float32Array[] = [];
    const nBins = nfft / 2 + 1;

    for (let i = 0; i < nMels; i++) {
        const filter = new Float32Array(nBins);
        const start = binPoints[i];
        const center = binPoints[i + 1];
        const end = binPoints[i + 2];

        // 上升沿
        for (let j = start; j < center; j++) {
            filter[j] = (j - start) / (center - start);
        }
        // 下降沿
        for (let j = center; j < end; j++) {
            filter[j] = (end - j) / (end - center);
        }

        filters.push(filter);
    }

    return filters;
}

/**
 * 应用 Mel 滤波器
 */
function applyMelFilterbank(spectrum: Float32Array, filters: Float32Array[]): Float32Array {
    const result = new Float32Array(filters.length);
    for (let i = 0; i < filters.length; i++) {
        let sum = 0;
        for (let j = 0; j < spectrum.length; j++) {
            sum += spectrum[j] * filters[i][j];
        }
        result[i] = sum;
    }
    return result;
}

/**
 * Low Frame Rate - 帧拼接
 * m=5: 拼接 5 帧
 * n=1: 步长 1 帧
 */
function applyLFR(features: Float32Array[], m: number, n: number): Float32Array[] {
    if (features.length === 0) return [];

    const featureDim = features[0].length;
    const numFrames = Math.ceil(features.length / n);
    const result: Float32Array[] = [];

    for (let i = 0; i < numFrames; i++) {
        const lfrFrame = new Float32Array(featureDim * m);
        for (let j = 0; j < m; j++) {
            const frameIdx = Math.min(i * n + j, features.length - 1);
            lfrFrame.set(features[frameIdx], j * featureDim);
        }
        result.push(lfrFrame);
    }

    return result;
}

/**
 * 应用 CMVN (Cepstral Mean and Variance Normalization)
 */
export function applyCMVN(
    features: Float32Array,
    means: Float32Array,
    scales: Float32Array
): Float32Array {
    const result = new Float32Array(features.length);
    const featureDim = means.length;

    for (let i = 0; i < features.length; i++) {
        const dimIdx = i % featureDim;
        result[i] = (features[i] + means[dimIdx]) * scales[dimIdx];
    }

    return result;
}

/**
 * 解析 vad.mvn 文件内容
 */
export function parseCMVN(mvnContent: string): { means: Float32Array; scales: Float32Array } {
    const lines = mvnContent.split('\n');
    let means: Float32Array | null = null;
    let scales: Float32Array | null = null;

    const findData = (startIndex: number): Float32Array | null => {
        for (let i = startIndex; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue; // Skip empty lines

            const match = line.match(/\[([\s\S]*?)\]/);
            if (match) {
                const values = match[1].trim().split(/\s+/).map(Number);
                return new Float32Array(values);
            }
            // If we hit another tag or something else that isn't data, stop? 
            // Actually, the file format seems to be Tag -> Data. 
            // If we hit another tag, we probably missed the data.
            if (line.startsWith('<')) return null;
        }
        return null;
    };

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();

        if (line.includes('<AddShift>')) {
            means = findData(i + 1);
        }

        if (line.includes('<Rescale>')) {
            scales = findData(i + 1);
        }
    }

    if (!means || !scales) {
        throw new Error('Failed to parse CMVN file');
    }

    return { means, scales };
}

// ============ 流式处理函数 (Streaming Processing Functions) ============

// 预计算的 Mel 滤波器缓存
let cachedMelFilters: Float32Array[] | null = null;

/**
 * 获取或创建 Mel 滤波器（缓存）
 */
function getMelFilters(): Float32Array[] {
    if (!cachedMelFilters) {
        cachedMelFilters = createMelFilterbank(N_FFT, SAMPLE_RATE, N_MELS);
    }
    return cachedMelFilters;
}

/**
 * 从 PCM 数据计算 Log Mel 帧（不应用 LFR）
 * 用于流式处理：调用者负责管理样本缓冲
 * 
 * @param audioData PCM Float32 数据
 * @returns Log Mel 帧数组，每帧 80 维
 */
export function computeLogMelFrames(audioData: Float32Array): Float32Array[] {
    // 🔧 FIX: Scale from Web Audio API range [-1, 1] to 16-bit PCM range [-32768, 32767]
    // FunASR FSMN-VAD model expects audio data in 16-bit integer magnitude
    const scaledData = new Float32Array(audioData.length);
    for (let i = 0; i < audioData.length; i++) {
        scaledData[i] = audioData[i] * 32768;
    }

    // [DEBUG] Check input amplitude range (now showing scaled values)
    if (Math.random() < 0.02) {
        let min = Infinity, max = -Infinity;
        let sum = 0;
        const limit = Math.min(scaledData.length, 100);
        for (let i = 0; i < limit; i++) {
            if (scaledData[i] < min) min = scaledData[i];
            if (scaledData[i] > max) max = scaledData[i];
            sum += Math.abs(scaledData[i]);
        }
        if (sum > 100) {
            console.log(`📊 [fbank Input SCALED] len=${scaledData.length}, range=[${min.toFixed(0)}, ${max.toFixed(0)}]`);
        }
    }

    // 1. 分帧 (使用缩放后的数据)
    const frames = frameSignal(scaledData, FRAME_LENGTH, FRAME_SHIFT);
    if (frames.length === 0) return [];

    // 2. 加 Hamming 窗
    const windowedFrames = frames.map(frame => applyHammingWindow(frame));

    // 3. FFT -> 功率谱
    const powerSpectrum = windowedFrames.map(frame => computePowerSpectrum(frame, N_FFT));

    // 4. Mel 滤波器
    const melFilters = getMelFilters();
    const melSpectrum = powerSpectrum.map(spectrum => applyMelFilterbank(spectrum, melFilters));

    // 5. 取对数
    const logMelSpectrum = melSpectrum.map(mel => {
        const logMel = new Float32Array(mel.length);
        for (let i = 0; i < mel.length; i++) {
            logMel[i] = Math.log(Math.max(mel[i], 1e-10));
        }
        return logMel;
    });

    // [DEBUG FORCED] 每次都打印 LogMel 范围验证缩放生效
    if (logMelSpectrum.length > 0) {
        const sample = logMelSpectrum[0];
        let min = Infinity, max = -Infinity;
        for (let i = 0; i < sample.length; i++) {
            if (sample[i] < min) min = sample[i];
            if (sample[i] > max) max = sample[i];
        }
        console.log(`📊 [fbank LogMel] frames=${logMelSpectrum.length}, range=[${min.toFixed(2)}, ${max.toFixed(2)}]`);
    }

    return logMelSpectrum;
}

/**
 * 计算给定样本数能产生多少完整帧
 */
export function countCompleteFrames(sampleCount: number): number {
    if (sampleCount < FRAME_LENGTH) return 0;
    return Math.floor((sampleCount - FRAME_LENGTH) / FRAME_SHIFT) + 1;
}

/**
 * 计算处理 N 帧后剩余的样本数
 */
export function calculateRemainder(sampleCount: number, frameCount: number): number {
    if (frameCount === 0) return sampleCount;
    // 每帧移动 FRAME_SHIFT 个样本，返回最后一帧开始位置之后的剩余样本
    const lastFrameStart = (frameCount - 1) * FRAME_SHIFT;
    return sampleCount - lastFrameStart - FRAME_SHIFT;
}

/**
 * 从连续的 Log Mel 帧流计算 LFR 特征
 * 
 * @param allFrames 所有可用的 Log Mel 帧（包括历史帧）
 * @param startIndex 开始计算 LFR 的帧索引
 * @returns LFR 特征帧数组，每帧 400 维 (80 * 5)
 */
export function computeLFRFromFrames(
    allFrames: Float32Array[],
    startIndex: number = 0
): Float32Array[] {
    if (allFrames.length === 0) return [];

    const featureDim = allFrames[0].length; // 80
    const m = LFR_M; // 5
    const result: Float32Array[] = [];

    // 从 startIndex 开始，每帧生成一个 LFR 特征
    for (let i = startIndex; i < allFrames.length; i++) {
        const lfrFrame = new Float32Array(featureDim * m);

        for (let j = 0; j < m; j++) {
            // 使用 clamp：如果超出范围，使用边界帧
            const frameIdx = Math.min(i + j, allFrames.length - 1);
            lfrFrame.set(allFrames[frameIdx], j * featureDim);
        }

        result.push(lfrFrame);
    }

    return result;
}

