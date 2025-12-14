/**
 * FunASR FSMN-VAD ONNX 推理器
 * 
 * 使用阿里达摩院的 FSMN-VAD 模型进行语音活动检测
 * 
 * 流式处理说明：
 * - 维护 sample buffer：累积 PCM 样本，只处理完整帧，保留 overlap
 * - 维护 feature buffer：累积 Log Mel 特征帧，用于 LFR 上下文
 * - 模型 cache：FSMN 隐藏状态，跨块保持
 */
import * as ort from 'onnxruntime-web';
import {
    applyCMVN,
    parseCMVN,
    computeLogMelFrames,

    FRAME_LENGTH,
    FRAME_SHIFT,
    LFR_CONTEXT
} from './fbank';

interface VADSegment {
    start: number;  // 开始时间 (ms)
    end: number;    // 结束时间 (ms)
}

interface VADConfig {
    speechThreshold: number;      // 语音概率阈值
    silenceThreshold: number;     // 静音概率阈值
    minSpeechDurationMs: number;  // 最小语音段时长
    minSilenceDurationMs: number; // 最小静音时长（触发分块）
}

const DEFAULT_CONFIG: VADConfig = {
    speechThreshold: 0.5,
    silenceThreshold: 0.35,
    minSpeechDurationMs: 200,
    minSilenceDurationMs: 500,
};

export class FunASRVAD {
    private session: ort.InferenceSession | null = null;
    private cmvnMeans: Float32Array | null = null;
    private cmvnScales: Float32Array | null = null;
    private config: VADConfig;
    private isReady = false;

    // 调试日志回调 (用于写入文件)
    private debugLog: ((msg: string) => void) | null = null;

    // FSMN 模型隐藏状态缓存
    private cache: Record<string, Float32Array> = {};

    // ========== 流式缓冲区 (Streaming Buffers) ==========
    // Sample Buffer: 累积 PCM 样本，保留 overlap
    private sampleBuffer: Float32Array = new Float32Array(0);
    // Feature Buffer: 累积 Log Mel 帧，用于 LFR 上下文
    private featureBuffer: Float32Array[] = [];
    // 已处理的 LFR 帧数（用于计算新特征的起始索引）
    private processedLFRFrames: number = 0;

    constructor(config: Partial<VADConfig> = {}) {
        this.config = { ...DEFAULT_CONFIG, ...config };
    }

    /**
     * 设置调试日志回调
     */
    setDebugLogger(logger: (msg: string) => void): void {
        this.debugLog = logger;
    }

    private log(msg: string): void {
        if (this.debugLog) {
            this.debugLog(msg);
        }
        console.log(msg);
    }

    /**
     * 初始化 VAD 模型
     */
    async init(modelPath: string = '/models/model.onnx', mvnPath: string = '/models/vad.mvn'): Promise<void> {
        try {
            console.log('🔄 加载 FunASR VAD 模型...');

            // 配置 WASM 路径 (Electron 环境下需要明确指定)
            ort.env.wasm.wasmPaths = '/onnx/';

            // 加载 ONNX 模型
            this.session = await ort.InferenceSession.create(modelPath, {
                executionProviders: ['wasm'],
                graphOptimizationLevel: 'all',
            });

            // 加载 CMVN 参数
            const mvnResponse = await fetch(mvnPath);
            const mvnContent = await mvnResponse.text();
            const { means, scales } = parseCMVN(mvnContent);
            this.cmvnMeans = means;
            this.cmvnScales = scales;

            // [DEBUG] Verify CMVN stats
            const meansSum = means.reduce((a, b) => a + b, 0);
            const scalesSum = scales.reduce((a, b) => a + b, 0);
            console.log(`📊 [VAD Init] CMVN Loaded: MeansSum=${meansSum.toFixed(2)}, ScalesSum=${scalesSum.toFixed(2)}, Dim=${means.length}`);

            // 获取模型输入/输出信息
            console.log('📊 模型输入:', this.session.inputNames);
            console.log('📊 模型输出:', this.session.outputNames);
            console.log('📊 输出数量:', this.session.outputNames.length);

            // 如果有多个输出，打印所有输出名称
            for (let i = 0; i < this.session.outputNames.length; i++) {
                console.log(`📊 输出[${i}]: ${this.session.outputNames[i]}`);
            }

            this.isReady = true;
            console.log('✅ FunASR VAD 模型加载完成');

        } catch (error) {
            console.error('❌ FunASR VAD 模型加载失败:', error);
            throw error;
        }
    }

    /**
     * 检测语音活动 (流式处理)
     * @param audioData 16kHz 单声道 Float32 音频数据
     * @returns 语音概率 (0-1)，如果积攒的音频不足以产生新帧，返回 0
     */
    async detect(audioData: Float32Array): Promise<number> {
        if (!this.isReady || !this.session || !this.cmvnMeans || !this.cmvnScales) {
            throw new Error('VAD 模型未初始化');
        }

        // 1. 拼接 Sample Buffer
        const newBuffer = new Float32Array(this.sampleBuffer.length + audioData.length);
        newBuffer.set(this.sampleBuffer);
        newBuffer.set(audioData, this.sampleBuffer.length);

        // 2. 计算可生成的完整帧数
        // 每一帧长 400 (25ms), 步长 160 (10ms)
        // 能够生成的帧数 N满足: (N-1)*160 + 400 <= total_samples
        const numNewFrames = Math.floor((newBuffer.length - FRAME_LENGTH) / FRAME_SHIFT) + 1;

        if (numNewFrames <= 0) {
            // 数据不足一帧，仅更新 buffer
            this.sampleBuffer = newBuffer;
            return -1; // 返回 -1 表示数据不足，无法判断（区别于 0 概率）
        }

        // 3. 提取用于计算特征的有效音频片段
        // 我们只处理完整帧，剩余的样本留给下一次
        const processedSampleCount = (numNewFrames - 1) * FRAME_SHIFT + FRAME_LENGTH;
        const processAudio = newBuffer.slice(0, processedSampleCount);

        // 更新 sample buffer: 去掉已经“完全消耗”并产生帧移的部分
        // 实际上，每产生一帧，我们“前进”了 FRAME_SHIFT。
        // 我们保留的数据应该是：newBuffer.slice(numNewFrames * FRAME_SHIFT)
        // 为什么？因为第 N+1 帧需要从 N * FRAME_SHIFT 开始，长度 FRAME_LENGTH。
        // 只要 buffer 里有 FRAME_LENGTH 长度的数据，就能产生下一帧。
        this.sampleBuffer = newBuffer.slice(numNewFrames * FRAME_SHIFT);

        // 使用 fbank.ts 中导出的流式函数 computeLogMelFrames
        const logMelFrames = computeLogMelFrames(processAudio);


        if (logMelFrames.length === 0) return -1;

        // 4. 更新 Feature Buffer (存储未归一化的 LogMel 帧)
        this.featureBuffer.push(...logMelFrames);

        // 5. 计算 LFR 特征
        // LFR 需要 5 帧上下文 (LFR_Context=5)
        // 我们需要从上次处理到的位置继续计算
        // 所有的 available frames = this.featureBuffer
        // 上次处理了 this.processedLFRFrames 个 LFR 输出
        // 每一个 LFR 输出消耗 1 个 shift (LFR_N=1)。
        // 但是 LFR 需要 T+LFR_M-1 个帧才能产生 T 个输出？
        // 不，LFR 只要有 5 帧就能产生第 1 个 output。有 6 帧产生第 2 个...
        // Output[i] needs Input[i...i+4]

        const startIndex = this.processedLFRFrames;

        // 能够产生的 LFR 帧数
        // 假设 featureBuffer 长度为 L。我们需要 idx, idx+1... idx+4 存在
        // 最后可用的 idx 满足 idx + 4 < L  => idx < L - 4
        // 所以能产生的最大索引是 L - 5。 总共能产生 L - 4 个？
        // 等等，FunASR 的 LFR 是拼接。
        // 让我们复用 computeLFRFromFrames 的逻辑，它会 clamp。
        // 但是流式处理不应该 clamp 到未来，而应该等待未来。
        // 只有当有足够的未来帧时才计算。
        // 修正逻辑：只有当 buffer 中有足够的帧（至少 LFR_CONTEXT 帧）时才开始计算

        // 实际每次我们只需要计算 *新* 产生的 LFR 帧
        // 新增了 logMelFrames.length 个基础帧。
        // 我们尝试从 processedLFRFrames 开始计算，直到无法满足 5 帧上下文为止(或者使用 clamp 策略，但流式最好不要 clamp 未来)
        // 观看原 `applyLFR` 实现：它对末尾进行了 clamp (复制最后一帧)。
        // 这在流式中是危险的，因为可能会导致"预测未来"是静止的。
        // 严谨的做法：等待。
        // 但是为了保持简单且跟原逻辑一致（原逻辑是实时），我们暂且允许 clamp，如果不允许 clamp 会导致延迟增加 (4帧 = 40ms)。
        // 考虑到 40ms 延迟可以接受，我们采用 "等待模式"，即不 clamp 最后几帧，留作 buffer。

        // 修正：我们重新实现一个简单的 check
        // 需要 Input[t + 0] ... Input[t + 4]
        // 所以我们需要 featureBuffer.length >= t + 5
        const maxLfrIndex = this.featureBuffer.length - LFR_CONTEXT;

        if (maxLfrIndex < startIndex) {
            // 数据不够产生新的 LFR 帧 (无 padding)
            // 此时不进行推理，等待更多数据
            return -1; // 返回 -1 表示数据不足
        }

        // 截取需要计算的部分
        // 为了计算 [startIndex ... maxLfrIndex] 的 LFR，我们需要 featureBuffer
        // 我们直接调用 computeLFRFromFrames, 但是告诉它只计算到 maxLfrIndex
        // 我们需要手动 slice 吗？ 
        // computeLFRFromFrames 会计算所有 start 到 end。
        // 我们自己手动实现循环吧，更可控。

        const lfrFeatures: Float32Array[] = [];
        const featureDim = 80; // Mel dim

        for (let i = startIndex; i <= maxLfrIndex; i++) {
            const lfrFrame = new Float32Array(featureDim * LFR_CONTEXT);
            for (let j = 0; j < LFR_CONTEXT; j++) {
                lfrFrame.set(this.featureBuffer[i + j], j * featureDim);
            }
            lfrFeatures.push(lfrFrame);
        }

        this.processedLFRFrames += lfrFeatures.length;

        // 清理 Feature Buffer
        // 我们只需要保留最后 LFR_CONTEXT - 1 个帧供下次使用
        // 也就是 processedLFRFrames 指向的那个位置的前面 4 个
        // 新的 start index 将是 this.processedLFRFrames
        // 我们需要保留 this.featureBuffer[this.processedLFRFrames ... ] 以及前面 4 个?
        // 不，processedLFRFrames 是指"下一个要计算的 LFR 索引"。
        // 计算 Output[next] 需要 Input[next] ... Input[next+4]
        // 所以我们需要保留 Input[next] 及其之后的所有帧。
        // 以前的帧 (0 ... next-1) 可以丢弃吗？ 是的。
        // 让我们执行清理以防止内存泄漏
        const keepIndex = this.processedLFRFrames;
        if (keepIndex > 0) {
            this.featureBuffer = this.featureBuffer.slice(keepIndex);
            this.processedLFRFrames = 0; // 重置索引，因为 buffer 被切断了
        }

        if (lfrFeatures.length === 0) return -1;

        // 6. 应用 CMVN 到 LFR 特征 (400维)
        const cmvnFeatures = lfrFeatures.map(frame =>
            applyCMVN(frame, this.cmvnMeans!, this.cmvnScales!)
        );

        // 7. 准备 ONNX 输入
        const numInferFrames = cmvnFeatures.length;
        const totalDim = 400; // 80 * 5
        const inputDataArray = new Float32Array(numInferFrames * totalDim);

        // Debug: Check first frame stats (Increased sampling to 5% for debug)
        if (numInferFrames > 0 && Math.random() < 0.05) {
            const firstFrame = cmvnFeatures[0];
            let min = Infinity, max = -Infinity, avg = 0;
            for (let val of firstFrame) {
                if (val < min) min = val;
                if (val > max) max = val;
                avg += val;
            }
            avg /= firstFrame.length;
            console.log(`📊 [VAD Input Test] Shape=${numInferFrames}x${totalDim}, Min=${min.toFixed(4)}, Max=${max.toFixed(4)}, Avg=${avg.toFixed(4)}`);
        }

        for (let k = 0; k < numInferFrames; k++) {
            inputDataArray.set(cmvnFeatures[k], k * totalDim);
        }

        const inputTensor = new ort.Tensor('float32', inputDataArray, [1, numInferFrames, totalDim]);

        // 8. 运行推理
        const feeds: Record<string, ort.Tensor> = {};
        feeds[this.session.inputNames[0]] = inputTensor;

        // 处理 Cache (FSMN 状态)
        const CACHE_SHAPE: [number, number, number, number] = [1, 128, 19, 1];
        const CACHE_SIZE = 1 * 128 * 19 * 1;

        for (let i = 1; i < this.session.inputNames.length; i++) {
            const inputName = this.session.inputNames[i];
            if (this.cache[inputName]) {
                feeds[inputName] = new ort.Tensor('float32', this.cache[inputName], CACHE_SHAPE);
            } else {
                feeds[inputName] = new ort.Tensor('float32', new Float32Array(CACHE_SIZE), CACHE_SHAPE);
            }
        }

        const results = await this.session.run(feeds);

        // 9. 更新 Cache
        for (let i = 1; i < this.session.outputNames.length; i++) {
            const outputKey = this.session.outputNames[i];
            if (i < this.session.inputNames.length) {
                const inputKey = this.session.inputNames[i];
                this.cache[inputKey] = results[outputKey].data as Float32Array;
            }
        }

        // 10. 解析结果
        const outputName = this.session.outputNames[0];
        const outputData = results[outputName].data as Float32Array;

        // [DEBUG] 输出模型原始数据到文件日志
        this.log(`[VAD-Model] dims=[${results[outputName].dims}], len=${outputData.length}, first6=[${Array.from(outputData.slice(0, 6)).map(v => v.toFixed(4)).join(', ')}]`);


        let speechProb = 0;

        // ⚠️ FALLBACK: 当前 ONNX 模型缺少分类层，248 维输出无法正确解析
        // 使用振幅阈值检测作为临时解决方案
        // 未来需要获取完整的 FSMN-VAD 模型或使用 Silero VAD

        const outputDim = 248;
        const numFrames = Math.floor(outputData.length / outputDim);

        if (numFrames > 0) {
            // 方案：使用每帧所有维度的平均值作为活动度指标
            for (let f = 0; f < numFrames; f++) {
                const frameStart = f * outputDim;
                let frameSum = 0;
                for (let d = 0; d < outputDim; d++) {
                    frameSum += Math.abs(outputData[frameStart + d]);
                }
                const frameAvg = frameSum / outputDim;

                // 使用阈值：平均值 > 0.01 认为是语音
                // 并用 sigmoid 平滑
                const logit = (frameAvg - 0.015) * 200; // 以 0.015 为中心，放大差异
                const frameSpeechProb = 1 / (1 + Math.exp(-logit));
                speechProb += frameSpeechProb;
            }

            const finalProb = speechProb / numFrames;
            this.log(`[VAD-AmplitudeFallback] numFrames=${numFrames}, avgProb=${finalProb.toFixed(4)}`);
            return finalProb;
        } else {
            this.log(`[VAD-Error] No frames in output`);
            return 0;
        }
    }

    /**
     * 处理音频流，返回语音段
     */
    async processAudio(audioData: Float32Array): Promise<VADSegment[]> {
        if (!this.isReady) {
            throw new Error('VAD 模型未初始化');
        }

        const segments: VADSegment[] = [];
        const frameShiftMs = 10;
        const windowMs = 200; // 每次处理 200ms

        const samplesPerWindow = Math.floor(16000 * windowMs / 1000);
        const samplesPerShift = Math.floor(16000 * frameShiftMs / 1000);

        let isSpeaking = false;
        let speechStart = 0;
        let silenceFrames = 0;
        let speechFrames = 0;

        for (let i = 0; i + samplesPerWindow <= audioData.length; i += samplesPerShift) {
            const window = audioData.slice(i, i + samplesPerWindow);
            const speechProb = await this.detect(window);
            const currentTimeMs = Math.floor(i * 1000 / 16000);

            if (speechProb >= this.config.speechThreshold) {
                speechFrames++;
                silenceFrames = 0;

                if (!isSpeaking && speechFrames * frameShiftMs >= this.config.minSpeechDurationMs) {
                    isSpeaking = true;
                    speechStart = currentTimeMs - this.config.minSpeechDurationMs;
                }
            } else if (speechProb < this.config.silenceThreshold) {
                silenceFrames++;
                speechFrames = 0;

                if (isSpeaking && silenceFrames * frameShiftMs >= this.config.minSilenceDurationMs) {
                    segments.push({
                        start: speechStart,
                        end: currentTimeMs,
                    });
                    isSpeaking = false;
                }
            }
        }

        // 处理末尾的语音段
        if (isSpeaking) {
            segments.push({
                start: speechStart,
                end: Math.floor(audioData.length * 1000 / 16000),
            });
        }

        return segments;
    }

    /**
     * 重置状态
     */
    reset(): void {
        this.cache = {};
        this.sampleBuffer = new Float32Array(0);
        this.featureBuffer = [];
        this.processedLFRFrames = 0;
    }

    /**
     * 检查是否就绪
     */
    get ready(): boolean {
        return this.isReady;
    }
}
