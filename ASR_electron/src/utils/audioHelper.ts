/**
 * Audio processing utilities
 */

/**
 * 将 Float32Array 音频数据转换为 WAV 格式
 * @param samples Float32 PCM 数据
 * @param sampleRate 采样率 (默认 16000)
 * @returns WAV 格式的 ArrayBuffer
 */
export function float32ToWav(samples: Float32Array, sampleRate: number = 16000): ArrayBuffer {
    const length = samples.length;
    const bytesPerSample = 2; // 16-bit
    const blockAlign = 1 * bytesPerSample; // Mono
    const byteRate = sampleRate * blockAlign;
    const dataSize = length * bytesPerSample;
    const bufferSize = 44 + dataSize;

    const buffer = new ArrayBuffer(bufferSize);
    const view = new DataView(buffer);

    const writeString = (offset: number, string: string) => {
        for (let i = 0; i < string.length; i++) {
            view.setUint8(offset + i, string.charCodeAt(i));
        }
    };

    // RIFF Header
    writeString(0, 'RIFF');
    view.setUint32(4, bufferSize - 8, true);
    writeString(8, 'WAVE');

    // fmt Chunk
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true);   // Subchunk1Size
    view.setUint16(20, 1, true);    // AudioFormat (1 = PCM)
    view.setUint16(22, 1, true);    // NumChannels (1 = Mono)
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, byteRate, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, 16, true);   // BitsPerSample

    // data Chunk
    writeString(36, 'data');
    view.setUint32(40, dataSize, true);

    // Data
    let offset = 44;
    for (let i = 0; i < length; i++) {
        const sample = Math.max(-1, Math.min(1, samples[i]));
        // Convert float to 16-bit PCM
        view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true);
        offset += 2;
    }

    return buffer;
}

/**
 * 将 Float32Array 转换为 Base64 字符串 (用于 IPC 传输)
 */
export function float32ToBase64(float32: Float32Array): string {
    const uint8 = new Uint8Array(float32.buffer);
    let binary = '';
    const len = uint8.byteLength;
    // Chunking to avoid stack overflow with large arrays
    const CHUNK_SIZE = 0x8000; // 32k
    for (let i = 0; i < len; i += CHUNK_SIZE) {
        binary += String.fromCharCode.apply(null, Array.from(uint8.subarray(i, i + CHUNK_SIZE)));
    }
    return window.btoa(binary);
}

/**
 * 将任意 ArrayBuffer 转换为 Base64 字符串
 */
export function arrayBufferToBase64(buffer: ArrayBuffer): string {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    // Chunking to avoid stack overflow
    const CHUNK_SIZE = 0x8000;
    for (let i = 0; i < len; i += CHUNK_SIZE) {
        binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + CHUNK_SIZE)));
    }
    return window.btoa(binary);
}
