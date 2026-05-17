package pipeline

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"image"
	"image/png"
	"io"
	"mime/multipart"
	"net/http"
	"net/textproto"
	"strings"
)

// ImageClient calls an OpenAI-compatible /v1/images/edits endpoint.
type ImageClient struct {
	BaseURLs []string // primary first, then fallbacks
	APIKey   string
	Model    string
	URLPath  string // e.g. "/v1/images/edits"
	HTTP     *http.Client
}

func NewImageClient(primary, apiKey, model, urlPath string, fallbacks []string) *ImageClient {
	urls := []string{strings.TrimRight(primary, "/")}
	for _, fb := range fallbacks {
		fb = strings.TrimRight(strings.TrimSpace(fb), "/")
		if fb != "" && fb != urls[0] {
			urls = append(urls, fb)
		}
	}
	if urlPath == "" {
		urlPath = "/v1/images/edits"
	}
	if !strings.HasPrefix(urlPath, "/") && !strings.HasPrefix(urlPath, "http") {
		urlPath = "/" + urlPath
	}
	return &ImageClient{
		BaseURLs: urls,
		APIKey:   apiKey,
		Model:    model,
		URLPath:  urlPath,
		HTTP:     &http.Client{}, // timeout controlled via Config.RequestTimeout / job ctx
	}
}

type imageResponseItem struct {
	B64JSON  string `json:"b64_json,omitempty"`
	URL      string `json:"url,omitempty"`
	ImageURL string `json:"image_url,omitempty"`
}

type imageResponse struct {
	Data  []imageResponseItem    `json:"data"`
	Error map[string]interface{} `json:"error,omitempty"`
}

// EditImage uploads `source` to the image-edit endpoint with the prompt and
// returns the first generated image. Falls back across configured base URLs
// on transient failures.
func (c *ImageClient) EditImage(ctx context.Context, source image.Image, prompt string, size string) (image.Image, error) {
	if c.APIKey == "" {
		return nil, fmt.Errorf("IMAGE_API_KEY 未配置")
	}
	if len(c.BaseURLs) == 0 || c.BaseURLs[0] == "" {
		return nil, fmt.Errorf("IMAGE_API_BASE_URL 未配置")
	}
	if c.Model == "" {
		return nil, fmt.Errorf("IMAGE_MODEL 未配置")
	}

	var lastErr error
	for i, base := range c.BaseURLs {
		endpoint := buildImageEndpoint(base, c.URLPath)

		var body bytes.Buffer
		mw := multipart.NewWriter(&body)
		_ = mw.WriteField("model", c.Model)
		_ = mw.WriteField("prompt", prompt)
		_ = mw.WriteField("n", "1")
		_ = mw.WriteField("size", size)
		_ = mw.WriteField("response_format", "b64_json")

		// Most OpenAI-compatible image-edit endpoints (gpt-image-1, dall-e-2)
		// only accept PNG. Sending JPEG yields "unsupported image type".
		fw, err := createPNGFormFile(mw, "image", "source.png")
		if err != nil {
			return nil, err
		}
		if err := png.Encode(fw, source); err != nil {
			return nil, err
		}
		if err := mw.Close(); err != nil {
			return nil, err
		}

		req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, &body)
		if err != nil {
			lastErr = err
			continue
		}
		req.Header.Set("Authorization", "Bearer "+c.APIKey)
		req.Header.Set("Content-Type", mw.FormDataContentType())

		resp, err := c.HTTP.Do(req)
		if err != nil {
			lastErr = fmt.Errorf("image API 请求失败 (%s): %w", endpoint, err)
			if i < len(c.BaseURLs)-1 {
				continue
			}
			return nil, lastErr
		}

		raw, _ := io.ReadAll(resp.Body)
		resp.Body.Close()

		if resp.StatusCode >= 500 || resp.StatusCode == http.StatusTooManyRequests {
			lastErr = fmt.Errorf("image API 临时错误 status=%d body=%s", resp.StatusCode, truncate(string(raw), 300))
			if i < len(c.BaseURLs)-1 {
				continue
			}
			return nil, lastErr
		}

		var payload imageResponse
		if err := json.Unmarshal(raw, &payload); err != nil {
			return nil, fmt.Errorf("image API 响应解析失败 (status %d): %w", resp.StatusCode, err)
		}
		if resp.StatusCode >= 400 || payload.Error != nil {
			return nil, fmt.Errorf("image API 错误 status=%d body=%v", resp.StatusCode, payload.Error)
		}

		for _, item := range payload.Data {
			if item.B64JSON != "" {
				data, err := base64.StdEncoding.DecodeString(item.B64JSON)
				if err != nil {
					return nil, fmt.Errorf("image base64 解码失败: %w", err)
				}
				img, _, err := image.Decode(bytes.NewReader(data))
				if err != nil {
					return nil, fmt.Errorf("image 解码失败: %w", err)
				}
				return img, nil
			}
			imgURL := item.URL
			if imgURL == "" {
				imgURL = item.ImageURL
			}
			if imgURL != "" {
				img, err := downloadImage(ctx, c.HTTP, imgURL)
				if err != nil {
					return nil, err
				}
				return img, nil
			}
		}
		return nil, fmt.Errorf("image API 没有返回图片数据")
	}
	if lastErr == nil {
		lastErr = fmt.Errorf("image API 调用失败")
	}
	return nil, lastErr
}

func buildImageEndpoint(base, path string) string {
	base = strings.TrimRight(base, "/")
	if strings.HasPrefix(path, "http://") || strings.HasPrefix(path, "https://") {
		return path
	}
	if !strings.HasPrefix(path, "/") {
		path = "/" + path
	}
	return base + path
}

func downloadImage(ctx context.Context, client *http.Client, url string) (image.Image, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, err
	}
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		return nil, fmt.Errorf("下载图片失败 status=%d url=%s", resp.StatusCode, url)
	}
	img, _, err := image.Decode(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("解码图片失败: %w", err)
	}
	return img, nil
}

func truncate(s string, max int) string {
	if len(s) <= max {
		return s
	}
	return s[:max] + "..."
}

// createPNGFormFile is a CreateFormFile variant that sets Content-Type:
// image/png. Stdlib's CreateFormFile always stamps octet-stream, which some
// stricter image-edit gateways reject.
func createPNGFormFile(w *multipart.Writer, fieldname, filename string) (io.Writer, error) {
	h := make(textproto.MIMEHeader)
	h.Set("Content-Disposition", fmt.Sprintf(`form-data; name=%q; filename=%q`, fieldname, filename))
	h.Set("Content-Type", "image/png")
	return w.CreatePart(h)
}
