package product

import (
	"encoding/base64"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"

	"ImageWorkflow/apps/backend/internal/manifest"
	"ImageWorkflow/apps/backend/internal/workspace"
)

var supportedImageExts = map[string]bool{
	".jpg": true, ".jpeg": true, ".png": true, ".webp": true, ".bmp": true,
}

var outputImageExts = map[string]bool{
	".png": true, ".jpg": true, ".jpeg": true, ".webp": true,
}

type Product struct {
	ProductID        string `json:"product_id"`
	Name             string `json:"name"`
	Category         string `json:"category"`
	Description      string `json:"description"`
	Keywords         string `json:"keywords"`
	ColorsText       string `json:"colors_text"`
	HeroColor        string `json:"hero_color"`
	ColorImageMap    string `json:"color_image_map"`
	DetailImageCount int    `json:"detail_image_count"`
	Notes            string `json:"notes"`
	ImageCount       int    `json:"image_count"`
	HasPlan          bool   `json:"has_plan"`
	OutputCount      int    `json:"output_count"`
}

type ProductImage struct {
	Filename string `json:"filename"`
	Size     int64  `json:"size"`
}

type ProductDetail struct {
	Product
	Images []ProductImage `json:"images"`
}

type Service struct {
	workspace *workspace.Resolver
	manifest  *manifest.Service
}

func NewService(ws *workspace.Resolver, m *manifest.Service) *Service {
	return &Service{
		workspace: ws,
		manifest:  m,
	}
}

// PLACEHOLDER_APPEND_2

func (s *Service) ListProducts() ([]Product, error) {
	rows, err := s.manifest.ListRows()
	if err != nil {
		return nil, err
	}
	byID := map[string]manifest.ManifestRow{}
	for _, row := range rows {
		byID[row.ProductID] = row
	}

	// Also include folders that are not in the manifest yet (orphan products).
	entries, err := os.ReadDir(s.workspace.ProductRoot())
	if err != nil && !os.IsNotExist(err) {
		return nil, err
	}
	for _, entry := range entries {
		if !entry.IsDir() || strings.HasPrefix(entry.Name(), ".") {
			continue
		}
		id := entry.Name()
		if _, ok := byID[id]; !ok {
			byID[id] = manifest.ManifestRow{ProductID: id, DetailImageCount: 2}
		}
	}

	products := make([]Product, 0, len(byID))
	for _, row := range byID {
		products = append(products, s.hydrate(row))
	}
	sort.Slice(products, func(i, j int) bool {
		return products[i].ProductID < products[j].ProductID
	})
	return products, nil
}

func (s *Service) GetProduct(productID string) (ProductDetail, error) {
	productID = safeID(productID)
	if productID == "" {
		return ProductDetail{}, fmt.Errorf("product_id is required")
	}

	row, err := s.manifest.GetRow(productID)
	if err != nil {
		return ProductDetail{}, err
	}
	if row == nil {
		row = &manifest.ManifestRow{ProductID: productID, DetailImageCount: 2}
	}

	images, err := s.listImages(s.workspace.ProductFolder(productID))
	if err != nil && !os.IsNotExist(err) {
		return ProductDetail{}, err
	}

	return ProductDetail{
		Product: s.hydrate(*row),
		Images:  images,
	}, nil
}

func (s *Service) SaveProduct(payload Product) (ProductDetail, error) {
	id := safeID(payload.ProductID)
	if id == "" {
		return ProductDetail{}, fmt.Errorf("product_id is required")
	}
	folder := s.workspace.ProductFolder(id)
	if err := os.MkdirAll(folder, 0o755); err != nil {
		return ProductDetail{}, err
	}

	row := manifest.ManifestRow{
		ProductID:        id,
		Name:             strings.TrimSpace(payload.Name),
		Category:         strings.TrimSpace(payload.Category),
		Description:      strings.TrimSpace(payload.Description),
		Keywords:         strings.TrimSpace(payload.Keywords),
		ColorsText:       strings.TrimSpace(payload.ColorsText),
		HeroColor:        strings.TrimSpace(payload.HeroColor),
		ColorImageMap:    strings.TrimSpace(payload.ColorImageMap),
		DetailImageCount: payload.DetailImageCount,
		Notes:            strings.TrimSpace(payload.Notes),
	}
	if _, err := s.manifest.UpsertRow(row); err != nil {
		return ProductDetail{}, err
	}
	return s.GetProduct(id)
}

func (s *Service) DeleteProduct(productID string) error {
	id := safeID(productID)
	if id == "" {
		return fmt.Errorf("product_id is required")
	}
	if err := s.manifest.DeleteRow(id); err != nil {
		return err
	}
	folder := s.workspace.ProductFolder(id)
	if _, err := os.Stat(folder); err == nil {
		if err := os.RemoveAll(folder); err != nil {
			return err
		}
	}
	return nil
}

func (s *Service) UploadProductImage(productID string, filename string, data string) (ProductImage, error) {
	id := safeID(productID)
	if id == "" {
		return ProductImage{}, fmt.Errorf("product_id is required")
	}
	name := safeFilename(filename)
	if name == "" {
		return ProductImage{}, fmt.Errorf("filename is required")
	}
	ext := strings.ToLower(filepath.Ext(name))
	if !supportedImageExts[ext] {
		return ProductImage{}, fmt.Errorf("不支持的图片格式: %s", ext)
	}

	bytes, err := base64.StdEncoding.DecodeString(data)
	if err != nil {
		return ProductImage{}, fmt.Errorf("图片数据解码失败: %w", err)
	}

	folder := s.workspace.ProductFolder(id)
	if err := os.MkdirAll(folder, 0o755); err != nil {
		return ProductImage{}, err
	}
	dest := filepath.Join(folder, name)
	if err := os.WriteFile(dest, bytes, 0o644); err != nil {
		return ProductImage{}, err
	}
	info, err := os.Stat(dest)
	if err != nil {
		return ProductImage{}, err
	}
	return ProductImage{Filename: name, Size: info.Size()}, nil
}

func (s *Service) UploadProductImageFromPath(productID string, srcPath string) (ProductImage, error) {
	id := safeID(productID)
	if id == "" {
		return ProductImage{}, fmt.Errorf("product_id is required")
	}
	name := safeFilename(filepath.Base(srcPath))
	if name == "" {
		return ProductImage{}, fmt.Errorf("filename is required")
	}
	ext := strings.ToLower(filepath.Ext(name))
	if !supportedImageExts[ext] {
		return ProductImage{}, fmt.Errorf("不支持的图片格式: %s", ext)
	}

	data, err := os.ReadFile(srcPath)
	if err != nil {
		return ProductImage{}, fmt.Errorf("读取源文件失败: %w", err)
	}

	folder := s.workspace.ProductFolder(id)
	if err := os.MkdirAll(folder, 0o755); err != nil {
		return ProductImage{}, err
	}
	dest := filepath.Join(folder, name)
	if err := os.WriteFile(dest, data, 0o644); err != nil {
		return ProductImage{}, err
	}
	info, err := os.Stat(dest)
	if err != nil {
		return ProductImage{}, err
	}
	return ProductImage{Filename: name, Size: info.Size()}, nil
}

func (s *Service) DeleteProductImage(productID string, filename string) error {
	id := safeID(productID)
	name := safeFilename(filename)
	if id == "" || name == "" {
		return fmt.Errorf("product_id and filename are required")
	}
	path := filepath.Join(s.workspace.ProductFolder(id), name)
	if _, err := os.Stat(path); err != nil {
		if os.IsNotExist(err) {
			return nil
		}
		return err
	}
	return os.Remove(path)
}

func (s *Service) hydrate(row manifest.ManifestRow) Product {
	imageCount := s.countImages(s.workspace.ProductFolder(row.ProductID))
	detailCount := row.DetailImageCount
	if detailCount <= 0 {
		detailCount = 2
	}
	return Product{
		ProductID:        row.ProductID,
		Name:             row.Name,
		Category:         row.Category,
		Description:      row.Description,
		Keywords:         row.Keywords,
		ColorsText:       row.ColorsText,
		HeroColor:        row.HeroColor,
		ColorImageMap:    row.ColorImageMap,
		DetailImageCount: detailCount,
		Notes:            row.Notes,
		ImageCount:       imageCount,
		HasPlan:          s.hasPlan(row.ProductID),
		OutputCount:      s.countOutputs(row.ProductID),
	}
}

func (s *Service) countImages(folder string) int {
	entries, err := os.ReadDir(folder)
	if err != nil {
		return 0
	}
	count := 0
	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}
		ext := strings.ToLower(filepath.Ext(entry.Name()))
		if supportedImageExts[ext] {
			count++
		}
	}
	return count
}

func (s *Service) listImages(folder string) ([]ProductImage, error) {
	entries, err := os.ReadDir(folder)
	if err != nil {
		return nil, err
	}

	var images []ProductImage
	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}
		ext := strings.ToLower(filepath.Ext(entry.Name()))
		if !supportedImageExts[ext] {
			continue
		}
		info, err := entry.Info()
		if err != nil {
			continue
		}
		images = append(images, ProductImage{
			Filename: entry.Name(),
			Size:     info.Size(),
		})
	}

	sort.Slice(images, func(i, j int) bool {
		return images[i].Filename < images[j].Filename
	})

	if images == nil {
		images = []ProductImage{}
	}
	return images, nil
}

func (s *Service) hasPlan(productID string) bool {
	planFile := filepath.Join(s.workspace.CacheDir(), "generation_plan_"+productID+".json")
	_, err := os.Stat(planFile)
	return err == nil
}

func (s *Service) countOutputs(productID string) int {
	folder := s.workspace.OutputFolder(productID)
	entries, err := os.ReadDir(folder)
	if err != nil {
		return 0
	}
	count := 0
	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}
		ext := strings.ToLower(filepath.Ext(entry.Name()))
		if outputImageExts[ext] {
			count++
		}
	}
	return count
}

func safeID(id string) string {
	id = strings.TrimSpace(id)
	if id == "" || strings.Contains(id, "..") || strings.ContainsAny(id, `/\`) {
		return ""
	}
	return id
}

func safeFilename(name string) string {
	name = strings.TrimSpace(name)
	if name == "" || strings.Contains(name, "..") || strings.ContainsAny(name, `/\`) {
		return ""
	}
	return name
}
