package pipeline

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"image"
	"image/jpeg"
	"net/http"
	"strings"
)

// ChatClient calls an OpenAI-compatible chat completion endpoint with optional
// image attachments (passed as base64 data URIs).
type ChatClient struct {
	BaseURL string
	APIKey  string
	Model   string
	HTTP    *http.Client
}

func NewChatClient(baseURL, apiKey, model string) *ChatClient {
	return &ChatClient{
		BaseURL: baseURL,
		APIKey:  apiKey,
		Model:   model,
		HTTP:    &http.Client{}, // timeout controlled via Config.RequestTimeout / job ctx
	}
}

type chatMessage struct {
	Role    string        `json:"role"`
	Content []chatContent `json:"content"`
}

type chatContent struct {
	Type     string         `json:"type"`
	Text     string         `json:"text,omitempty"`
	ImageURL *chatImageBlob `json:"image_url,omitempty"`
}

type chatImageBlob struct {
	URL string `json:"url"`
}

type chatRequest struct {
	Model    string        `json:"model"`
	Messages []chatMessage `json:"messages"`
	Stream   bool          `json:"stream"`
}

type chatResponseChoice struct {
	Message struct {
		Content          string `json:"content"`
		ReasoningContent string `json:"reasoning_content"`
		Reasoning        string `json:"reasoning"`
	} `json:"message"`
}

type chatResponse struct {
	Choices []chatResponseChoice    `json:"choices"`
	Error   *map[string]interface{} `json:"error,omitempty"`
}

// AnalyzeWithImages sends `images` and `instruction` to the chat completion
// endpoint and returns the model text content.
func (c *ChatClient) AnalyzeWithImages(ctx context.Context, images []image.Image, instruction string) (string, error) {
	if c.APIKey == "" {
		return "", fmt.Errorf("ANALYSIS_API_KEY 未配置")
	}
	if c.BaseURL == "" {
		return "", fmt.Errorf("ANALYSIS_API_BASE_URL 未配置")
	}
	if c.Model == "" {
		return "", fmt.Errorf("ANALYSIS_MODEL 未配置")
	}

	content := make([]chatContent, 0, len(images)+1)
	for _, img := range images {
		uri, err := imageToDataURI(img)
		if err != nil {
			return "", err
		}
		content = append(content, chatContent{
			Type:     "image_url",
			ImageURL: &chatImageBlob{URL: uri},
		})
	}
	content = append(content, chatContent{Type: "text", Text: instruction})

	body, err := json.Marshal(chatRequest{
		Model:    c.Model,
		Messages: []chatMessage{{Role: "user", Content: content}},
		Stream:   false,
	})
	if err != nil {
		return "", err
	}

	endpoint := strings.TrimRight(c.BaseURL, "/")
	if !strings.HasSuffix(endpoint, "/v1") {
		endpoint += "/v1"
	}
	endpoint += "/chat/completions"

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(body))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+c.APIKey)

	resp, err := c.HTTP.Do(req)
	if err != nil {
		return "", fmt.Errorf("analysis API 请求失败: %w", err)
	}
	defer resp.Body.Close()

	ctype := resp.Header.Get("content-type")
	if strings.Contains(ctype, "text/html") {
		return "", fmt.Errorf("analysis API 返回 HTML（status %d），Base URL 可能不正确", resp.StatusCode)
	}

	var payload chatResponse
	if err := json.NewDecoder(resp.Body).Decode(&payload); err != nil {
		return "", fmt.Errorf("analysis API 响应解析失败 (status %d): %w", resp.StatusCode, err)
	}
	if resp.StatusCode >= 400 || payload.Error != nil {
		return "", fmt.Errorf("analysis API 错误 status=%d body=%v", resp.StatusCode, payload.Error)
	}
	if len(payload.Choices) == 0 {
		return "", fmt.Errorf("analysis API 没有返回 choices")
	}
	msg := payload.Choices[0].Message
	if text := strings.TrimSpace(msg.Content); text != "" {
		return text, nil
	}
	if text := strings.TrimSpace(msg.ReasoningContent); text != "" {
		return text, nil
	}
	if text := strings.TrimSpace(msg.Reasoning); text != "" {
		return text, nil
	}
	return "", fmt.Errorf("analysis API 返回内容为空")
}

// Chat sends a text-only prompt to the chat completion endpoint (no images).
func (c *ChatClient) Chat(ctx context.Context, prompt string) (string, error) {
	if c.APIKey == "" {
		return "", fmt.Errorf("ANALYSIS_API_KEY 未配置")
	}
	if c.BaseURL == "" {
		return "", fmt.Errorf("ANALYSIS_API_BASE_URL 未配置")
	}
	if c.Model == "" {
		return "", fmt.Errorf("ANALYSIS_MODEL 未配置")
	}

	content := []chatContent{{Type: "text", Text: prompt}}
	body, err := json.Marshal(chatRequest{
		Model:    c.Model,
		Messages: []chatMessage{{Role: "user", Content: content}},
		Stream:   false,
	})
	if err != nil {
		return "", err
	}

	endpoint := strings.TrimRight(c.BaseURL, "/")
	if !strings.HasSuffix(endpoint, "/v1") {
		endpoint += "/v1"
	}
	endpoint += "/chat/completions"

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(body))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+c.APIKey)

	resp, err := c.HTTP.Do(req)
	if err != nil {
		return "", fmt.Errorf("analysis API 请求失败: %w", err)
	}
	defer resp.Body.Close()

	var payload chatResponse
	if err := json.NewDecoder(resp.Body).Decode(&payload); err != nil {
		return "", fmt.Errorf("analysis API 响应解析失败 (status %d): %w", resp.StatusCode, err)
	}
	if resp.StatusCode >= 400 || payload.Error != nil {
		return "", fmt.Errorf("analysis API 错误 status=%d body=%v", resp.StatusCode, payload.Error)
	}
	if len(payload.Choices) == 0 {
		return "", fmt.Errorf("analysis API 没有返回 choices")
	}
	msg := payload.Choices[0].Message
	if text := strings.TrimSpace(msg.Content); text != "" {
		return text, nil
	}
	if text := strings.TrimSpace(msg.ReasoningContent); text != "" {
		return text, nil
	}
	if text := strings.TrimSpace(msg.Reasoning); text != "" {
		return text, nil
	}
	return "", fmt.Errorf("analysis API 返回内容为空")
}

func imageToDataURI(img image.Image) (string, error) {
	var buf bytes.Buffer
	if err := jpeg.Encode(&buf, img, &jpeg.Options{Quality: 85}); err != nil {
		return "", fmt.Errorf("图片编码失败: %w", err)
	}
	return "data:image/jpeg;base64," + base64.StdEncoding.EncodeToString(buf.Bytes()), nil
}
