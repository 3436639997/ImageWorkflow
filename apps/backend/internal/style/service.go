package style

import (
	"context"
	"encoding/base64"
	"fmt"
	"image"
	_ "image/jpeg"
	_ "image/png"
	"os"
	"path/filepath"
	"strings"
	"time"

	"ImageWorkflow/apps/backend/internal/pipeline"
	"ImageWorkflow/apps/backend/internal/settings"
	"ImageWorkflow/apps/backend/internal/workspace"

	"github.com/google/uuid"
)

var supportedImageExts = map[string]bool{
	".jpg": true, ".jpeg": true, ".png": true, ".webp": true,
}

// Service manages style reference sets.
type Service struct {
	ws       *workspace.Resolver
	storage  *storage
	settings *settings.Service
}

// NewService creates a new style service.
func NewService(ws *workspace.Resolver, set *settings.Service) *Service {
	return &Service{
		ws:       ws,
		storage:  newStorage(ws.Root()),
		settings: set,
	}
}

// ListStyles returns all style reference sets.
func (s *Service) ListStyles() ([]Style, error) {
	return s.storage.load()
}

// GetStyle returns a single style by ID.
func (s *Service) GetStyle(id string) (*Style, error) {
	styles, err := s.storage.load()
	if err != nil {
		return nil, err
	}

	for _, style := range styles {
		if style.ID == id {
			return &style, nil
		}
	}

	return nil, fmt.Errorf("风格套 %s 不存在", id)
}

// CreateStyle creates a new style reference set.
func (s *Service) CreateStyle(input StyleInput) (*Style, error) {
	if strings.TrimSpace(input.Name) == "" {
		return nil, fmt.Errorf("风格名称不能为空")
	}

	styles, err := s.storage.load()
	if err != nil {
		return nil, err
	}

	style := Style{
		ID:              uuid.New().String(),
		Name:            strings.TrimSpace(input.Name),
		Prompt:          strings.TrimSpace(input.Prompt),
		ReferenceImages: []string{},
		CreatedAt:       time.Now().UTC().Format(time.RFC3339),
	}

	styles = append(styles, style)
	if err := s.storage.save(styles); err != nil {
		return nil, err
	}

	return &style, nil
}

// UpdateStyle updates an existing style's metadata.
func (s *Service) UpdateStyle(id string, input StyleInput) (*Style, error) {
	if strings.TrimSpace(input.Name) == "" {
		return nil, fmt.Errorf("风格名称不能为空")
	}

	styles, err := s.storage.load()
	if err != nil {
		return nil, err
	}

	found := false
	var updated Style
	for i, style := range styles {
		if style.ID == id {
			styles[i].Name = strings.TrimSpace(input.Name)
			styles[i].Prompt = strings.TrimSpace(input.Prompt)
			updated = styles[i]
			found = true
			break
		}
	}

	if !found {
		return nil, fmt.Errorf("风格套 %s 不存在", id)
	}

	if err := s.storage.save(styles); err != nil {
		return nil, err
	}

	return &updated, nil
}

// DeleteStyle deletes a style and its associated images.
func (s *Service) DeleteStyle(id string) error {
	styles, err := s.storage.load()
	if err != nil {
		return err
	}

	found := false
	newStyles := make([]Style, 0, len(styles))
	for _, style := range styles {
		if style.ID == id {
			found = true
			continue
		}
		newStyles = append(newStyles, style)
	}

	if !found {
		return fmt.Errorf("风格套 %s 不存在", id)
	}

	if err := s.storage.save(newStyles); err != nil {
		return err
	}

	// Delete image directory
	imageDir := s.imageDir(id)
	if _, err := os.Stat(imageDir); err == nil {
		if err := os.RemoveAll(imageDir); err != nil {
			return fmt.Errorf("删除图片目录失败: %w", err)
		}
	}

	return nil
}

// UploadImage uploads a reference image for a style.
func (s *Service) UploadImage(styleID string, filename string, data string) error {
	// Validate style exists
	style, err := s.GetStyle(styleID)
	if err != nil {
		return err
	}

	// Validate filename
	name := safeFilename(filename)
	if name == "" {
		return fmt.Errorf("文件名无效")
	}
	ext := strings.ToLower(filepath.Ext(name))
	if !supportedImageExts[ext] {
		return fmt.Errorf("不支持的图片格式: %s", ext)
	}

	// Decode base64
	bytes, err := base64.StdEncoding.DecodeString(data)
	if err != nil {
		return fmt.Errorf("图片数据解码失败: %w", err)
	}

	// Write file
	imageDir := s.imageDir(styleID)
	if err := os.MkdirAll(imageDir, 0o755); err != nil {
		return fmt.Errorf("创建图片目录失败: %w", err)
	}

	dest := filepath.Join(imageDir, name)
	if err := os.WriteFile(dest, bytes, 0o644); err != nil {
		return fmt.Errorf("写入图片失败: %w", err)
	}

	// Update style metadata
	styles, err := s.storage.load()
	if err != nil {
		return err
	}

	for i, st := range styles {
		if st.ID == styleID {
			// Check if image already in list
			exists := false
			for _, img := range st.ReferenceImages {
				if img == name {
					exists = true
					break
				}
			}
			if !exists {
				styles[i].ReferenceImages = append(styles[i].ReferenceImages, name)
			}
			break
		}
	}

	if err := s.storage.save(styles); err != nil {
		return err
	}

	_ = style // used for validation
	return nil
}

// DeleteImage deletes a reference image from a style.
func (s *Service) DeleteImage(styleID string, filename string) error {
	// Validate style exists
	_, err := s.GetStyle(styleID)
	if err != nil {
		return err
	}

	name := safeFilename(filename)
	if name == "" {
		return fmt.Errorf("文件名无效")
	}

	// Delete file
	imagePath := filepath.Join(s.imageDir(styleID), name)
	if _, err := os.Stat(imagePath); err == nil {
		if err := os.Remove(imagePath); err != nil {
			return fmt.Errorf("删除图片失败: %w", err)
		}
	}

	// Update style metadata
	styles, err := s.storage.load()
	if err != nil {
		return err
	}

	for i, st := range styles {
		if st.ID == styleID {
			newImages := make([]string, 0, len(st.ReferenceImages))
			for _, img := range st.ReferenceImages {
				if img != name {
					newImages = append(newImages, img)
				}
			}
			styles[i].ReferenceImages = newImages
			break
		}
	}

	return s.storage.save(styles)
}

// ListImages returns all reference image filenames for a style.
func (s *Service) ListImages(styleID string) ([]string, error) {
	style, err := s.GetStyle(styleID)
	if err != nil {
		return nil, err
	}

	return style.ReferenceImages, nil
}

// imageDir returns the directory path for a style's images.
func (s *Service) imageDir(styleID string) string {
	return filepath.Join(s.ws.Root(), "styles", "images", styleID)
}

// GenerateStylePrompt uses AI to generate a style prompt from description and optional reference images.
func (s *Service) GenerateStylePrompt(description string, imagePaths []string) (string, error) {
	if strings.TrimSpace(description) == "" {
		return "", fmt.Errorf("请输入风格描述")
	}

	// Resolve current API settings
	values, err := s.settings.ResolveAll()
	if err != nil {
		return "", fmt.Errorf("读取设置失败: %w", err)
	}
	baseURL := values["ANALYSIS_API_BASE_URL"]
	apiKey := values["ANALYSIS_API_KEY"]
	model := values["ANALYSIS_MODEL"]
	if apiKey == "" {
		return "", fmt.Errorf("ANALYSIS_API_KEY 未配置，请先在设置页配置分析接口")
	}

	chatClient := pipeline.NewChatClient(baseURL, apiKey, model)

	// Load images (optional)
	images := make([]image.Image, 0, len(imagePaths))
	for _, path := range imagePaths {
		img, err := openImage(path)
		if err != nil {
			continue
		}
		images = append(images, img)
	}

	instructions := strings.TrimSpace(description)

	ctx := context.Background()

	if len(images) == 0 {
		// Pure text mode: use chat without images
		prompt := fmt.Sprintf(`Based on the following style description, write ONE concise image generation prompt (under 100 words) that captures this visual style for product photography. Output ONLY the prompt, nothing else.

Style description: %s`, instructions)
		result, err := chatClient.Chat(ctx, prompt)
		if err != nil {
			return "", fmt.Errorf("AI 生成失败: %w", err)
		}
		return result, nil
	}

	// With images: use AnalyzeStyle
	prompt, err := pipeline.AnalyzeStyle(ctx, chatClient, images, instructions)
	if err != nil {
		return "", fmt.Errorf("AI 生成失败: %w", err)
	}

	return prompt, nil
}

func openImage(path string) (image.Image, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer f.Close()

	img, _, err := image.Decode(f)
	if err != nil {
		return nil, fmt.Errorf("图片解码失败: %w", err)
	}
	return img, nil
}

func safeFilename(name string) string {
	name = strings.TrimSpace(name)
	if name == "" || strings.Contains(name, "..") || strings.ContainsAny(name, `/\`) {
		return ""
	}
	return name
}
