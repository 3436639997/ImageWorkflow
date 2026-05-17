package manifest

import (
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"

	"github.com/xuri/excelize/v2"

	"ImageWorkflow/apps/backend/internal/workspace"
)

// Column headers in the Excel manifest. Must match the legacy ImageWorkflow project.
var headers = []string{
	"编号文件夹",
	"产品名称",
	"一级类目",
	"产品描述",
	"关键词",
	"颜色",
	"主推颜色",
	"颜色图片映射",
	"细节图数量",
	"备注",
}

const sheetName = "Sheet1"

type ManifestRow struct {
	ProductID         string `json:"product_id"`
	Name              string `json:"name"`
	Category          string `json:"category"`
	Description       string `json:"description"`
	Keywords          string `json:"keywords"`
	ColorsText        string `json:"colors_text"`
	HeroColor         string `json:"hero_color"`
	ColorImageMap     string `json:"color_image_map"`
	DetailImageCount  int    `json:"detail_image_count"`
	Notes             string `json:"notes"`
}

type Service struct {
	mu        sync.Mutex
	workspace *workspace.Resolver
}

func NewService(ws *workspace.Resolver) *Service {
	return &Service{workspace: ws}
}

func (s *Service) Path() string {
	return s.workspace.ManifestPath()
}

func (s *Service) ListRows() ([]ManifestRow, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.readAllLocked()
}

func (s *Service) GetRow(productID string) (*ManifestRow, error) {
	productID = strings.TrimSpace(productID)
	if productID == "" {
		return nil, fmt.Errorf("product_id is required")
	}
	rows, err := s.ListRows()
	if err != nil {
		return nil, err
	}
	for i := range rows {
		if rows[i].ProductID == productID {
			return &rows[i], nil
		}
	}
	return nil, nil
}

func (s *Service) UpsertRow(row ManifestRow) (ManifestRow, error) {
	row.ProductID = strings.TrimSpace(row.ProductID)
	if row.ProductID == "" {
		return ManifestRow{}, fmt.Errorf("product_id is required")
	}
	if row.DetailImageCount <= 0 {
		row.DetailImageCount = 2
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	rows, err := s.readAllLocked()
	if err != nil {
		return ManifestRow{}, err
	}

	replaced := false
	for i := range rows {
		if rows[i].ProductID == row.ProductID {
			rows[i] = row
			replaced = true
			break
		}
	}
	if !replaced {
		rows = append(rows, row)
	}

	if err := s.writeAllLocked(rows); err != nil {
		return ManifestRow{}, err
	}
	return row, nil
}

func (s *Service) DeleteRow(productID string) error {
	productID = strings.TrimSpace(productID)
	if productID == "" {
		return fmt.Errorf("product_id is required")
	}
	s.mu.Lock()
	defer s.mu.Unlock()

	rows, err := s.readAllLocked()
	if err != nil {
		return err
	}
	out := rows[:0]
	for _, r := range rows {
		if r.ProductID != productID {
			out = append(out, r)
		}
	}
	return s.writeAllLocked(out)
}

func (s *Service) readAllLocked() ([]ManifestRow, error) {
	path := s.workspace.ManifestPath()
	if _, err := os.Stat(path); os.IsNotExist(err) {
		return []ManifestRow{}, nil
	}

	f, err := excelize.OpenFile(path)
	if err != nil {
		return nil, fmt.Errorf("打开 manifest 失败: %w", err)
	}
	defer f.Close()

	sheet := f.GetSheetName(0)
	if sheet == "" {
		return []ManifestRow{}, nil
	}

	raw, err := f.GetRows(sheet)
	if err != nil {
		return nil, fmt.Errorf("读取 manifest 失败: %w", err)
	}
	if len(raw) <= 1 {
		return []ManifestRow{}, nil
	}

	headerIndex := indexHeaders(raw[0])
	rows := make([]ManifestRow, 0, len(raw)-1)
	for _, r := range raw[1:] {
		row := parseRow(r, headerIndex)
		if row.ProductID == "" {
			continue
		}
		rows = append(rows, row)
	}
	return rows, nil
}

func (s *Service) writeAllLocked(rows []ManifestRow) error {
	path := s.workspace.ManifestPath()
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil && filepath.Dir(path) != "." {
		return err
	}

	f := excelize.NewFile()
	defer f.Close()

	sheet := f.GetSheetName(0)
	if sheet == "" {
		sheet = sheetName
		if _, err := f.NewSheet(sheet); err != nil {
			return err
		}
	}

	headerRow := make([]any, len(headers))
	for i, h := range headers {
		headerRow[i] = h
	}
	if err := f.SetSheetRow(sheet, "A1", &headerRow); err != nil {
		return fmt.Errorf("写入表头失败: %w", err)
	}

	for i, row := range rows {
		cellRef, err := excelize.CoordinatesToCellName(1, i+2)
		if err != nil {
			return err
		}
		values := []any{
			row.ProductID,
			row.Name,
			row.Category,
			row.Description,
			row.Keywords,
			row.ColorsText,
			row.HeroColor,
			row.ColorImageMap,
			strconv.Itoa(row.DetailImageCount),
			row.Notes,
		}
		if err := f.SetSheetRow(sheet, cellRef, &values); err != nil {
			return fmt.Errorf("写入行 %d 失败: %w", i+2, err)
		}
	}

	if err := f.SaveAs(path); err != nil {
		return fmt.Errorf("保存 manifest 失败: %w", err)
	}
	return nil
}

func indexHeaders(headerRow []string) map[string]int {
	idx := map[string]int{}
	for i, h := range headerRow {
		idx[strings.TrimSpace(h)] = i
	}
	return idx
}

func parseRow(cells []string, idx map[string]int) ManifestRow {
	get := func(name string) string {
		i, ok := idx[name]
		if !ok || i >= len(cells) {
			return ""
		}
		return strings.TrimSpace(cells[i])
	}
	detailCount := 2
	if v := get("细节图数量"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			detailCount = n
		}
	}
	return ManifestRow{
		ProductID:        get("编号文件夹"),
		Name:             get("产品名称"),
		Category:         get("一级类目"),
		Description:      get("产品描述"),
		Keywords:         get("关键词"),
		ColorsText:       get("颜色"),
		HeroColor:        get("主推颜色"),
		ColorImageMap:    get("颜色图片映射"),
		DetailImageCount: detailCount,
		Notes:            get("备注"),
	}
}
