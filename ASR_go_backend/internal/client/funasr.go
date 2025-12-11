package client

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"os"
	"os/exec"
	"time"
)

// ASRClient 调用现有的 ASR_server (Python FastAPI) 客户端
type ASRClient struct {
	baseURL    string
	httpClient *http.Client
}

// SubmitResponse 提交任务响应
type SubmitResponse struct {
	TaskID        string `json:"task_id"`
	Status        string `json:"status"`
	Position      int    `json:"position"`
	EstimatedWait int    `json:"estimated_wait"`
}

// TaskResult 任务结果
type TaskResult struct {
	TaskID         string  `json:"task_id"`
	Status         string  `json:"status"`
	Text           string  `json:"text"`
	Duration       float64 `json:"duration"`
	ProcessingTime float64 `json:"processing_time"`
	Error          string  `json:"error,omitempty"`
}

// NewASRClient 创建 ASR 客户端
func NewASRClient(baseURL string) *ASRClient {
	return &ASRClient{
		baseURL: baseURL,
		httpClient: &http.Client{
			Timeout: 120 * time.Second,
		},
	}
}

// SubmitAudio 提交音频到 ASR_server
func (c *ASRClient) SubmitAudio(audioData []byte, filename string) (*SubmitResponse, error) {
	// 创建 multipart form
	body := &bytes.Buffer{}
	writer := multipart.NewWriter(body)

	part, err := writer.CreateFormFile("audio", filename)
	if err != nil {
		return nil, fmt.Errorf("创建 form file 失败: %w", err)
	}

	if _, err := part.Write(audioData); err != nil {
		return nil, fmt.Errorf("写入音频数据失败: %w", err)
	}

	if err := writer.Close(); err != nil {
		return nil, fmt.Errorf("关闭 writer 失败: %w", err)
	}

	url := fmt.Sprintf("%s/api/v1/asr/submit", c.baseURL)
	req, err := http.NewRequest("POST", url, body)
	if err != nil {
		return nil, fmt.Errorf("创建请求失败: %w", err)
	}
	req.Header.Set("Content-Type", writer.FormDataContentType())

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("请求失败: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		bodyBytes, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("提交失败: %s", string(bodyBytes))
	}

	var result SubmitResponse
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("解析响应失败: %w", err)
	}

	return &result, nil
}

// GetResult 获取任务结果
func (c *ASRClient) GetResult(taskID string) (*TaskResult, error) {
	url := fmt.Sprintf("%s/api/v1/asr/result/%s", c.baseURL, taskID)

	resp, err := c.httpClient.Get(url)
	if err != nil {
		return nil, fmt.Errorf("请求失败: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusNotFound {
		return nil, fmt.Errorf("任务不存在: %s", taskID)
	}

	var result TaskResult
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("解析响应失败: %w", err)
	}

	return &result, nil
}

// WaitForResult 等待任务完成并返回结果
func (c *ASRClient) WaitForResult(taskID string, timeout time.Duration) (*TaskResult, error) {
	deadline := time.Now().Add(timeout)

	for time.Now().Before(deadline) {
		result, err := c.GetResult(taskID)
		if err != nil {
			return nil, err
		}

		switch result.Status {
		case "done":
			return result, nil
		case "failed":
			return nil, fmt.Errorf("识别失败: %s", result.Error)
		default:
			// queued 或 processing，继续等待
			time.Sleep(500 * time.Millisecond)
		}
	}

	return nil, fmt.Errorf("等待超时")
}

// Recognize 识别音频（提交并等待结果）
func (c *ASRClient) Recognize(audioData []byte) (string, float64, error) {
	var wavData []byte

	// 检测音频格式
	if isWebM(audioData) {
		// WebM 格式，使用 FFmpeg 转换
		converted, err := convertWebMToWAV(audioData)
		if err != nil {
			return "", 0, fmt.Errorf("WebM 转换失败: %w", err)
		}
		wavData = converted
	} else {
		// 假设是原始 PCM，添加 WAV 头
		wavData = addWAVHeader(audioData)
	}

	// 提交任务
	submitResp, err := c.SubmitAudio(wavData, "chunk.wav")
	if err != nil {
		return "", 0, err
	}

	// 等待结果
	result, err := c.WaitForResult(submitResp.TaskID, 300*time.Second)
	if err != nil {
		return "", 0, err
	}

	return result.Text, result.Duration, nil
}

// IsReady 检查服务是否就绪
func (c *ASRClient) IsReady() bool {
	url := fmt.Sprintf("%s/api/v1/health", c.baseURL)
	resp, err := c.httpClient.Get(url)
	if err != nil {
		return false
	}
	defer resp.Body.Close()
	return resp.StatusCode == http.StatusOK
}

// addWAVHeader 为 raw PCM 添加 WAV 头 (16kHz, 16bit, mono)
func addWAVHeader(pcm []byte) []byte {
	header := make([]byte, 44)
	dataSize := len(pcm)
	totalSize := dataSize + 36

	// RIFF/WAVE header
	copy(header[0:4], []byte("RIFF"))
	putUint32(header[4:8], uint32(totalSize))
	copy(header[8:12], []byte("WAVE"))

	// fmt chunk
	copy(header[12:16], []byte("fmt "))
	putUint32(header[16:20], 16)    // Subchunk1Size (16 for PCM)
	putUint16(header[20:22], 1)     // AudioFormat (1 for PCM)
	putUint16(header[22:24], 1)     // NumChannels (1 for Mono)
	putUint32(header[24:28], 16000) // SampleRate (16000)
	putUint32(header[28:32], 32000) // ByteRate (16000 * 1 * 16/8)
	putUint16(header[32:34], 2)     // BlockAlign (1 * 16/8)
	putUint16(header[34:36], 16)    // BitsPerSample (16)

	// data chunk
	copy(header[36:40], []byte("data"))
	putUint32(header[40:44], uint32(dataSize))

	return append(header, pcm...)
}

func putUint32(b []byte, v uint32) {
	b[0] = byte(v)
	b[1] = byte(v >> 8)
	b[2] = byte(v >> 16)
	b[3] = byte(v >> 24)
}

func putUint16(b []byte, v uint16) {
	b[0] = byte(v)
	b[1] = byte(v >> 8)
}

// isWebM 检测是否为 WebM 格式
func isWebM(data []byte) bool {
	if len(data) < 4 {
		return false
	}
	// WebM 文件以 0x1A45DFA3 (EBML header) 开头
	return data[0] == 0x1A && data[1] == 0x45 && data[2] == 0xDF && data[3] == 0xA3
}

// convertWebMToWAV 使用 FFmpeg 将 WebM 转换为 WAV
func convertWebMToWAV(webmData []byte) ([]byte, error) {
	// 创建临时文件存储 WebM 数据
	tmpWebM, err := os.CreateTemp("", "audio_*.webm")
	if err != nil {
		return nil, fmt.Errorf("创建临时 WebM 文件失败: %w", err)
	}
	defer os.Remove(tmpWebM.Name())

	if _, err := tmpWebM.Write(webmData); err != nil {
		tmpWebM.Close()
		return nil, fmt.Errorf("写入 WebM 数据失败: %w", err)
	}
	tmpWebM.Close()

	// 创建临时 WAV 文件
	tmpWAV, err := os.CreateTemp("", "audio_*.wav")
	if err != nil {
		return nil, fmt.Errorf("创建临时 WAV 文件失败: %w", err)
	}
	tmpWAVName := tmpWAV.Name()
	tmpWAV.Close()
	defer os.Remove(tmpWAVName)

	// 使用 FFmpeg 转换：16kHz, mono, 16-bit PCM
	cmd := exec.Command("ffmpeg",
		"-i", tmpWebM.Name(),
		"-ar", "16000", // 采样率 16kHz
		"-ac", "1", // 单声道
		"-sample_fmt", "s16", // 16-bit
		"-y", // 覆盖输出文件
		tmpWAVName,
	)

	var stderr bytes.Buffer
	cmd.Stderr = &stderr

	if err := cmd.Run(); err != nil {
		return nil, fmt.Errorf("FFmpeg 转换失败: %w, stderr: %s", err, stderr.String())
	}

	// 读取转换后的 WAV 文件
	wavData, err := os.ReadFile(tmpWAVName)
	if err != nil {
		return nil, fmt.Errorf("读取 WAV 文件失败: %w", err)
	}

	return wavData, nil
}
