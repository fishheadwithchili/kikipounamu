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

// ASRClient is a client for existing ASR_server (Python FastAPI)
type ASRClient struct {
	baseURL    string
	httpClient *http.Client
}

// SubmitResponse is the response for task submission
type SubmitResponse struct {
	TaskID        string `json:"task_id"`
	Status        string `json:"status"`
	Position      int    `json:"position"`
	EstimatedWait int    `json:"estimated_wait"`
}

// TaskResult is the task result
type TaskResult struct {
	TaskID         string  `json:"task_id"`
	Status         string  `json:"status"`
	Text           string  `json:"text"`
	Duration       float64 `json:"duration"`
	ProcessingTime float64 `json:"processing_time"`
	Error          string  `json:"error,omitempty"`
}

// NewASRClient creates ASR client
func NewASRClient(baseURL string) *ASRClient {
	return &ASRClient{
		baseURL: baseURL,
		httpClient: &http.Client{
			Timeout: 120 * time.Second,
		},
	}
}

// SubmitAudio submits audio to ASR_server
func (c *ASRClient) SubmitAudio(audioData []byte, filename string) (*SubmitResponse, error) {
	// Create multipart form
	body := &bytes.Buffer{}
	writer := multipart.NewWriter(body)

	part, err := writer.CreateFormFile("audio", filename)
	if err != nil {
		return nil, fmt.Errorf("failed to create form file: %w", err)
	}

	if _, err := part.Write(audioData); err != nil {
		return nil, fmt.Errorf("failed to write audio data: %w", err)
	}

	if err := writer.Close(); err != nil {
		return nil, fmt.Errorf("failed to close writer: %w", err)
	}

	url := fmt.Sprintf("%s/api/v1/asr/submit", c.baseURL)
	req, err := http.NewRequest("POST", url, body)
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}
	req.Header.Set("Content-Type", writer.FormDataContentType())

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		bodyBytes, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("submit failed: %s", string(bodyBytes))
	}

	var result SubmitResponse
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("response decode failed: %w", err)
	}

	return &result, nil
}

// GetResult gets task result
func (c *ASRClient) GetResult(taskID string) (*TaskResult, error) {
	url := fmt.Sprintf("%s/api/v1/asr/result/%s", c.baseURL, taskID)

	resp, err := c.httpClient.Get(url)
	if err != nil {
		return nil, fmt.Errorf("request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusNotFound {
		return nil, fmt.Errorf("task not found: %s", taskID)
	}

	var result TaskResult
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("response decode failed: %w", err)
	}

	return &result, nil
}

// WaitForResult waits for task completion
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
			return nil, fmt.Errorf("recognition failed: %s", result.Error)
		default:
			// queued or processing, continue waiting
			time.Sleep(500 * time.Millisecond)
		}
	}

	return nil, fmt.Errorf("wait timeout")
}

// Recognize recognizes audio (submit and wait)
func (c *ASRClient) Recognize(audioData []byte) (string, float64, error) {
	var wavData []byte

	// Detect audio format
	if isWebM(audioData) {
		// WebM format, convert using FFmpeg
		converted, err := convertWebMToWAV(audioData)
		if err != nil {
			return "", 0, fmt.Errorf("WebM convert failed: %w", err)
		}
		wavData = converted
	} else {
		// Assume raw PCM, add WAV header
		wavData = addWAVHeader(audioData)
	}

	// Submit task
	submitResp, err := c.SubmitAudio(wavData, "chunk.wav")
	if err != nil {
		return "", 0, err
	}

	// Wait for result
	result, err := c.WaitForResult(submitResp.TaskID, 300*time.Second)
	if err != nil {
		return "", 0, err
	}

	return result.Text, result.Duration, nil
}

// IsReady checks if service is ready
func (c *ASRClient) IsReady() bool {
	url := fmt.Sprintf("%s/api/v1/health", c.baseURL)
	resp, err := c.httpClient.Get(url)
	if err != nil {
		return false
	}
	defer resp.Body.Close()
	return resp.StatusCode == http.StatusOK
}

// addWAVHeader adds WAV header for raw PCM
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

// isWebM checks if data is WebM
func isWebM(data []byte) bool {
	if len(data) < 4 {
		return false
	}
	// WebM file starts with 0x1A45DFA3 (EBML header)
	return data[0] == 0x1A && data[1] == 0x45 && data[2] == 0xDF && data[3] == 0xA3
}

// convertWebMToWAV converts WebM to WAV using FFmpeg
func convertWebMToWAV(webmData []byte) ([]byte, error) {
	// Create temp file for WebM
	tmpWebM, err := os.CreateTemp("", "audio_*.webm")
	if err != nil {
		return nil, fmt.Errorf("failed to create temp WebM file: %w", err)
	}
	defer os.Remove(tmpWebM.Name())

	if _, err := tmpWebM.Write(webmData); err != nil {
		tmpWebM.Close()
		return nil, fmt.Errorf("failed to write WebM data: %w", err)
	}
	tmpWebM.Close()

	// Create temp WAV file
	tmpWAV, err := os.CreateTemp("", "audio_*.wav")
	if err != nil {
		return nil, fmt.Errorf("failed to create temp WAV file: %w", err)
	}
	tmpWAVName := tmpWAV.Name()
	tmpWAV.Close()
	defer os.Remove(tmpWAVName)

	// Use FFmpeg: 16kHz, mono, 16-bit PCM
	cmd := exec.Command("ffmpeg",
		"-i", tmpWebM.Name(),
		"-ar", "16000", // Sample rate 16kHz
		"-ac", "1", // Mono
		"-sample_fmt", "s16", // 16-bit
		"-y", // Overwrite output file
		tmpWAVName,
	)

	var stderr bytes.Buffer
	cmd.Stderr = &stderr

	if err := cmd.Run(); err != nil {
		return nil, fmt.Errorf("FFmpeg failed: %w, stderr: %s", err, stderr.String())
	}

	// Read converted WAV file
	wavData, err := os.ReadFile(tmpWAVName)
	if err != nil {
		return nil, fmt.Errorf("failed to read WAV file: %w", err)
	}

	return wavData, nil
}
