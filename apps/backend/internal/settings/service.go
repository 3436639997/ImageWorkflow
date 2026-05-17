package settings

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"

	"ImageWorkflow/apps/backend/internal/workspace"
)

type Service struct {
	mu         sync.Mutex
	configPath string
	defaults   map[string]string
	groups     map[string]string
	secrets    map[string]bool
	workspace  *workspace.Resolver
}

type SettingItem struct {
	Key      string `json:"key"`
	Value    string `json:"value"`
	Secret   bool   `json:"secret"`
	HasValue bool   `json:"hasValue"`
	Group    string `json:"group"`
}

type ProbeResult struct {
	OK         bool   `json:"ok"`
	StatusCode int    `json:"statusCode"`
	Message    string `json:"message"`
	ModelCount int    `json:"modelCount"`
}

type ModelResult struct {
	OK      bool     `json:"ok"`
	Models  []string `json:"models"`
	Message string   `json:"message"`
}

type modelsEnvelope struct {
	Data []struct {
		ID string `json:"id"`
	} `json:"data"`
}

// PresetMeta is the public preset metadata (no secret values).
type PresetMeta struct {
	ID       string `json:"id"`
	Label    string `json:"label"`
	IsActive bool   `json:"is_active"`
}

// preset is the persisted preset shape.
type preset struct {
	ID     string            `json:"id"`
	Label  string            `json:"label"`
	Values map[string]string `json:"values"`
}

// envelope is the v2 settings.json shape.
type envelope struct {
	Version        int               `json:"version"`
	ActivePresetID string            `json:"active_preset_id"`
	Presets        []*preset         `json:"presets"`
	Global         map[string]string `json:"global"`
}

const (
	envelopeVersion  = 2
	maxPresets       = 5
	defaultPresetID  = "preset-1"
	defaultPresetLbl = "默认 OpenAI 兼容"
)

// globalKeys are persisted in envelope.Global rather than per-preset.
var globalKeys = map[string]bool{
	"WORKSPACE_DIR":               true,
	"JOB_TIMEOUT_SECONDS":         true,
	"API_REQUEST_TIMEOUT_SECONDS": true,
}

// presetKeys is the list of keys persisted per preset.
var presetKeys = []string{
	"ANALYSIS_API_BASE_URL",
	"ANALYSIS_API_KEY",
	"ANALYSIS_API_FALLBACK_BASE_URLS",
	"ANALYSIS_GEN_PROVIDER",
	"IMAGE_API_BASE_URL",
	"IMAGE_API_KEY",
	"IMAGE_API_URL",
	"IMAGE_GEN_PROVIDER",
	"IMAGE_API_FALLBACK_BASE_URLS",
	"ANALYSIS_MODEL",
	"IMAGE_MODEL",
	"ASPECT_RATIO",
	"FINAL_IMAGE_SIZE",
}

func NewService(ws *workspace.Resolver) *Service {
	configDir, err := os.UserConfigDir()
	if err != nil {
		configDir = "."
	}

	return &Service{
		configPath: filepath.Join(configDir, "imageworkflow", "settings.json"),
		workspace:  ws,
		defaults: map[string]string{
			"ANALYSIS_API_BASE_URL":           "",
			"ANALYSIS_API_KEY":                "",
			"ANALYSIS_API_FALLBACK_BASE_URLS": "",
			"ANALYSIS_GEN_PROVIDER":           "custom",
			"IMAGE_API_BASE_URL":              "",
			"IMAGE_API_KEY":                   "",
			"IMAGE_API_URL":                   "/v1/images/edits",
			"IMAGE_GEN_PROVIDER":              "custom",
			"IMAGE_API_FALLBACK_BASE_URLS":    "",
			"ANALYSIS_MODEL":                  "",
			"IMAGE_MODEL":                     "",
			"ASPECT_RATIO":                    "1:1",
			"FINAL_IMAGE_SIZE":                "1536x1536",
			"WORKSPACE_DIR":                   workspace.DefaultRoot(),
			"JOB_TIMEOUT_SECONDS":             "0",
			"API_REQUEST_TIMEOUT_SECONDS":     "0",
		},
		groups: map[string]string{
			"ANALYSIS_API_BASE_URL":           "gateway",
			"ANALYSIS_API_KEY":                "gateway",
			"ANALYSIS_API_FALLBACK_BASE_URLS": "gateway",
			"ANALYSIS_GEN_PROVIDER":           "gateway",
			"IMAGE_API_BASE_URL":              "gateway",
			"IMAGE_API_KEY":                   "gateway",
			"IMAGE_API_URL":                   "gateway",
			"IMAGE_GEN_PROVIDER":              "gateway",
			"IMAGE_API_FALLBACK_BASE_URLS":    "gateway",
			"ANALYSIS_MODEL":                  "model",
			"IMAGE_MODEL":                     "model",
			"ASPECT_RATIO":                    "output",
			"FINAL_IMAGE_SIZE":                "output",
			"WORKSPACE_DIR":                   "workspace",
			"JOB_TIMEOUT_SECONDS":             "workspace",
			"API_REQUEST_TIMEOUT_SECONDS":     "workspace",
		},
		secrets: map[string]bool{
			"ANALYSIS_API_KEY": true,
			"IMAGE_API_KEY":    true,
		},
	}
}

// ApplyToWorkspace reads the persisted WORKSPACE_DIR (if any) and points the
// shared resolver at it. Falls back to the resolver's existing default when
// no value has been saved yet. Always ensures the directory tree exists.
func (s *Service) ApplyToWorkspace() error {
	values, err := s.load()
	if err != nil {
		return err
	}
	if s.workspace == nil {
		return nil
	}
	root := strings.TrimSpace(values["WORKSPACE_DIR"])
	if root == "" {
		root = workspace.DefaultRoot()
	}
	return s.workspace.SetRoot(root)
}

// ResolveAll returns the persisted settings as a map with secrets unmasked.
// Intended for backend services (e.g. the generation pipeline) that need the
// raw API keys. Never expose this directly to the frontend.
func (s *Service) ResolveAll() (map[string]string, error) {
	return s.load()
}

func (s *Service) GetSettings(reveal bool) ([]SettingItem, error) {
	values, err := s.load()
	if err != nil {
		return nil, err
	}
	return s.buildItems(values, reveal), nil
}

func (s *Service) buildItems(values map[string]string, reveal bool) []SettingItem {
	items := make([]SettingItem, 0, len(s.defaults))
	for key := range s.defaults {
		value := values[key]
		secret := s.secrets[key]
		items = append(items, SettingItem{
			Key:      key,
			Value:    s.renderValue(value, secret, reveal),
			Secret:   secret,
			HasValue: strings.TrimSpace(value) != "",
			Group:    s.groups[key],
		})
	}

	sort.Slice(items, func(i, j int) bool {
		if items[i].Group == items[j].Group {
			return items[i].Key < items[j].Key
		}
		return items[i].Group < items[j].Group
	})

	return items
}

func (s *Service) SaveSettings(values map[string]string) ([]SettingItem, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	current, err := s.loadLocked()
	if err != nil {
		return nil, err
	}

	for key := range s.defaults {
		if value, ok := values[key]; ok {
			current[key] = strings.TrimSpace(value)
		}
	}

	if err := s.persistLocked(current); err != nil {
		return nil, err
	}

	// If WORKSPACE_DIR changed, point the resolver at the new root.
	if s.workspace != nil {
		desired := strings.TrimSpace(current["WORKSPACE_DIR"])
		if desired == "" {
			desired = workspace.DefaultRoot()
		}
		if desired != s.workspace.Root() {
			if err := s.workspace.SetRoot(desired); err != nil {
				return nil, fmt.Errorf("应用工作目录失败: %w", err)
			}
		}
	}

	return s.buildItems(current, false), nil
}

func (s *Service) TestSettings(kind string, overrides map[string]string) (ProbeResult, error) {
	values, err := s.merge(overrides)
	if err != nil {
		return ProbeResult{}, err
	}

	baseURL, apiKey, err := endpointForKind(kind, values)
	if err != nil {
		return ProbeResult{OK: false, Message: err.Error()}, nil
	}

	models, statusCode, err := s.fetchModels(baseURL, apiKey)
	if err != nil {
		return ProbeResult{
			OK:         false,
			StatusCode: statusCode,
			Message:    err.Error(),
		}, nil
	}

	return ProbeResult{
		OK:         true,
		StatusCode: statusCode,
		Message:    "网关可用，模型列表读取成功。",
		ModelCount: len(models),
	}, nil
}

func (s *Service) FetchModels(kind string, overrides map[string]string) (ModelResult, error) {
	values, err := s.merge(overrides)
	if err != nil {
		return ModelResult{}, err
	}

	baseURL, apiKey, err := endpointForKind(kind, values)
	if err != nil {
		return ModelResult{OK: false, Message: err.Error(), Models: []string{}}, nil
	}

	models, _, err := s.fetchModels(baseURL, apiKey)
	if err != nil {
		return ModelResult{OK: false, Message: err.Error(), Models: []string{}}, nil
	}

	return ModelResult{
		OK:      true,
		Models:  models,
		Message: fmt.Sprintf("已拉取 %d 个模型。", len(models)),
	}, nil
}

func (s *Service) merge(overrides map[string]string) (map[string]string, error) {
	values, err := s.load()
	if err != nil {
		return nil, err
	}
	for key, value := range overrides {
		if _, ok := s.defaults[key]; ok {
			values[key] = strings.TrimSpace(value)
		}
	}
	return values, nil
}

func (s *Service) load() (map[string]string, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.loadLocked()
}

func (s *Service) loadLocked() (map[string]string, error) {
	env, err := s.loadEnvelopeLocked()
	if err != nil {
		return nil, err
	}
	return s.flatten(env), nil
}

// loadEnvelopeLocked reads or migrates the v2 envelope. It always returns a
// usable envelope with at least one preset and a valid active id.
func (s *Service) loadEnvelopeLocked() (*envelope, error) {
	env := s.newDefaultEnvelope()

	data, err := os.ReadFile(s.configPath)
	if err != nil {
		if os.IsNotExist(err) {
			return env, nil
		}
		return nil, err
	}

	// Try v2 first.
	var v2 envelope
	if err := json.Unmarshal(data, &v2); err == nil && v2.Version >= envelopeVersion && len(v2.Presets) > 0 {
		// Sanitize values: keep only known keys.
		for _, p := range v2.Presets {
			p.Values = filterMap(p.Values, presetKeys)
		}
		v2.Global = filterMapKeys(v2.Global, globalKeys)
		// Make sure active is valid.
		if !envContainsPreset(&v2, v2.ActivePresetID) {
			v2.ActivePresetID = v2.Presets[0].ID
		}
		return &v2, nil
	}

	// Migrate v1 (flat map).
	var v1 map[string]string
	if err := json.Unmarshal(data, &v1); err == nil && v1 != nil {
		def := env.Presets[0]
		for _, key := range presetKeys {
			if v, ok := v1[key]; ok {
				def.Values[key] = strings.TrimSpace(v)
			}
		}
		for key := range globalKeys {
			if v, ok := v1[key]; ok {
				env.Global[key] = strings.TrimSpace(v)
			}
		}
		return env, nil
	}

	// Unknown format → start fresh with default.
	return env, nil
}

func (s *Service) newDefaultEnvelope() *envelope {
	return &envelope{
		Version:        envelopeVersion,
		ActivePresetID: defaultPresetID,
		Presets: []*preset{
			{ID: defaultPresetID, Label: defaultPresetLbl, Values: s.newDefaultPresetValues()},
		},
		Global: map[string]string{
			"WORKSPACE_DIR": workspace.DefaultRoot(),
		},
	}
}

func (s *Service) newDefaultPresetValues() map[string]string {
	out := map[string]string{}
	for _, k := range presetKeys {
		out[k] = s.defaults[k]
	}
	return out
}

// flatten returns a flat key→value map combining the active preset + global.
// Missing values fall back to defaults.
func (s *Service) flatten(env *envelope) map[string]string {
	out := make(map[string]string, len(s.defaults))
	// start with defaults
	for k, v := range s.defaults {
		out[k] = v
	}
	// override with global
	for k, v := range env.Global {
		out[k] = v
	}
	// override with active preset
	if active := s.findPreset(env, env.ActivePresetID); active != nil {
		for k, v := range active.Values {
			out[k] = v
		}
	}
	return out
}

func (s *Service) findPreset(env *envelope, id string) *preset {
	for _, p := range env.Presets {
		if p.ID == id {
			return p
		}
	}
	return nil
}

func envContainsPreset(env *envelope, id string) bool {
	for _, p := range env.Presets {
		if p.ID == id {
			return true
		}
	}
	return false
}

func (s *Service) persistLocked(values map[string]string) error {
	env, err := s.loadEnvelopeLocked()
	if err != nil {
		return err
	}
	active := s.findPreset(env, env.ActivePresetID)
	if active == nil {
		// Should not happen, but recover by re-pointing.
		if len(env.Presets) == 0 {
			env.Presets = []*preset{{ID: defaultPresetID, Label: defaultPresetLbl, Values: s.newDefaultPresetValues()}}
		}
		env.ActivePresetID = env.Presets[0].ID
		active = env.Presets[0]
	}
	for _, key := range presetKeys {
		if v, ok := values[key]; ok {
			active.Values[key] = strings.TrimSpace(v)
		}
	}
	for key := range globalKeys {
		if v, ok := values[key]; ok {
			env.Global[key] = strings.TrimSpace(v)
		}
	}
	return s.writeEnvelopeLocked(env)
}

func (s *Service) writeEnvelopeLocked(env *envelope) error {
	if err := os.MkdirAll(filepath.Dir(s.configPath), 0o755); err != nil {
		return err
	}
	data, err := json.MarshalIndent(env, "", "  ")
	if err != nil {
		return err
	}
	tmp := s.configPath + ".tmp"
	if err := os.WriteFile(tmp, data, 0o600); err != nil {
		return err
	}
	return os.Rename(tmp, s.configPath)
}

func filterMap(m map[string]string, keys []string) map[string]string {
	out := make(map[string]string, len(keys))
	for _, k := range keys {
		if v, ok := m[k]; ok {
			out[k] = v
		}
	}
	return out
}

func filterMapKeys(m map[string]string, allow map[string]bool) map[string]string {
	out := map[string]string{}
	for k, v := range m {
		if allow[k] {
			out[k] = v
		}
	}
	return out
}

func (s *Service) renderValue(value string, secret bool, reveal bool) string {
	if !secret || reveal {
		return value
	}
	if strings.TrimSpace(value) == "" {
		return ""
	}
	return "****************"
}

func endpointForKind(kind string, values map[string]string) (string, string, error) {
	var prefix string
	switch kind {
	case "analysis":
		prefix = "ANALYSIS"
	case "image":
		prefix = "IMAGE"
	default:
		return "", "", fmt.Errorf("unsupported kind: %s", kind)
	}

	baseURL := strings.TrimSpace(values[prefix+"_API_BASE_URL"])
	apiKey := strings.TrimSpace(values[prefix+"_API_KEY"])
	if baseURL == "" {
		return "", "", fmt.Errorf("请先填写 %s API Base URL", strings.ToLower(prefix))
	}
	if apiKey == "" {
		return "", "", fmt.Errorf("请先填写 %s API Key", strings.ToLower(prefix))
	}
	if !strings.HasPrefix(baseURL, "http://") && !strings.HasPrefix(baseURL, "https://") {
		return "", "", fmt.Errorf("Base URL 必须以 http:// 或 https:// 开头")
	}
	return baseURL, apiKey, nil
}

func (s *Service) fetchModels(baseURL string, apiKey string) ([]string, int, error) {
	base := strings.TrimRight(baseURL, "/")

	// Try /v1/models first if base doesn't already end with /v1, then fallback to /models.
	// This lets users enter "https://hub.example.com" without /v1 and still work.
	candidates := []string{}
	if !strings.HasSuffix(base, "/v1") {
		candidates = append(candidates, base+"/v1/models")
	}
	candidates = append(candidates, base+"/models")

	client := &http.Client{Timeout: 8 * time.Second}
	var lastStatus int
	type attemptErr struct {
		url string
		err string
	}
	var attempts []attemptErr

	for _, modelsURL := range candidates {
		req, err := http.NewRequestWithContext(context.Background(), http.MethodGet, modelsURL, nil)
		if err != nil {
			attempts = append(attempts, attemptErr{modelsURL, fmt.Sprintf("创建请求失败: %v", err)})
			continue
		}
		req.Header.Set("Authorization", "Bearer "+apiKey)
		req.Header.Set("Accept", "application/json")

		resp, err := client.Do(req)
		if err != nil {
			attempts = append(attempts, attemptErr{modelsURL, fmt.Sprintf("连接失败: %v", err)})
			continue
		}

		if resp.StatusCode < 200 || resp.StatusCode >= 300 {
			lastStatus = resp.StatusCode
			attempts = append(attempts, attemptErr{modelsURL, fmt.Sprintf("HTTP %d", resp.StatusCode)})
			resp.Body.Close()
			// 401/403 won't be fixed by trying another path; bail out.
			if resp.StatusCode == 401 || resp.StatusCode == 403 {
				return nil, resp.StatusCode, fmt.Errorf("认证失败 (HTTP %d) @ %s", resp.StatusCode, modelsURL)
			}
			continue
		}

		var payload modelsEnvelope
		if err := json.NewDecoder(resp.Body).Decode(&payload); err != nil {
			resp.Body.Close()
			lastStatus = resp.StatusCode
			attempts = append(attempts, attemptErr{modelsURL, fmt.Sprintf("解析失败: %v", err)})
			continue
		}
		resp.Body.Close()

		models := make([]string, 0, len(payload.Data))
		for _, item := range payload.Data {
			id := strings.TrimSpace(item.ID)
			if id != "" {
				models = append(models, id)
			}
		}
		sort.Strings(models)

		return models, resp.StatusCode, nil
	}

	// All attempts failed — report each one so user can see what was tried.
	parts := make([]string, 0, len(attempts))
	for _, a := range attempts {
		parts = append(parts, fmt.Sprintf("%s → %s", a.url, a.err))
	}
	return nil, lastStatus, fmt.Errorf("尝试失败: %s", strings.Join(parts, "; "))
}

// --- Preset management API ---

// ListPresets returns all presets (without secret values).
func (s *Service) ListPresets() ([]PresetMeta, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	env, err := s.loadEnvelopeLocked()
	if err != nil {
		return nil, err
	}
	out := make([]PresetMeta, 0, len(env.Presets))
	for _, p := range env.Presets {
		out = append(out, PresetMeta{
			ID:       p.ID,
			Label:    p.Label,
			IsActive: p.ID == env.ActivePresetID,
		})
	}
	return out, nil
}

// SetActivePreset switches the active preset and returns the freshly resolved
// SettingItems for the new active preset.
func (s *Service) SetActivePreset(id string) ([]SettingItem, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	env, err := s.loadEnvelopeLocked()
	if err != nil {
		return nil, err
	}
	if !envContainsPreset(env, id) {
		return nil, fmt.Errorf("预设不存在: %s", id)
	}
	env.ActivePresetID = id
	if err := s.writeEnvelopeLocked(env); err != nil {
		return nil, err
	}
	return s.buildItems(s.flatten(env), false), nil
}

// CreatePreset adds a new empty preset. Returns metadata for all presets.
func (s *Service) CreatePreset(label string) ([]PresetMeta, error) {
	label = strings.TrimSpace(label)
	if label == "" {
		label = "未命名预设"
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	env, err := s.loadEnvelopeLocked()
	if err != nil {
		return nil, err
	}
	if len(env.Presets) >= maxPresets {
		return nil, fmt.Errorf("预设已达上限 %d 个", maxPresets)
	}
	newID := nextPresetID(env.Presets)
	env.Presets = append(env.Presets, &preset{
		ID:     newID,
		Label:  label,
		Values: s.newDefaultPresetValues(),
	})
	if err := s.writeEnvelopeLocked(env); err != nil {
		return nil, err
	}
	return s.metasFromEnvelope(env), nil
}

// RenamePreset updates the label of a preset.
func (s *Service) RenamePreset(id, label string) ([]PresetMeta, error) {
	label = strings.TrimSpace(label)
	if label == "" {
		return nil, fmt.Errorf("名称不能为空")
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	env, err := s.loadEnvelopeLocked()
	if err != nil {
		return nil, err
	}
	target := s.findPreset(env, id)
	if target == nil {
		return nil, fmt.Errorf("预设不存在: %s", id)
	}
	target.Label = label
	if err := s.writeEnvelopeLocked(env); err != nil {
		return nil, err
	}
	return s.metasFromEnvelope(env), nil
}

// DeletePreset removes a preset. Cannot delete the active preset or the last
// remaining preset.
func (s *Service) DeletePreset(id string) ([]PresetMeta, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	env, err := s.loadEnvelopeLocked()
	if err != nil {
		return nil, err
	}
	if len(env.Presets) <= 1 {
		return nil, fmt.Errorf("至少保留一个预设")
	}
	if env.ActivePresetID == id {
		return nil, fmt.Errorf("不能删除当前正在使用的预设，请先切换到其他预设")
	}
	idx := -1
	for i, p := range env.Presets {
		if p.ID == id {
			idx = i
			break
		}
	}
	if idx < 0 {
		return nil, fmt.Errorf("预设不存在: %s", id)
	}
	env.Presets = append(env.Presets[:idx], env.Presets[idx+1:]...)
	if err := s.writeEnvelopeLocked(env); err != nil {
		return nil, err
	}
	return s.metasFromEnvelope(env), nil
}

func (s *Service) metasFromEnvelope(env *envelope) []PresetMeta {
	out := make([]PresetMeta, 0, len(env.Presets))
	for _, p := range env.Presets {
		out = append(out, PresetMeta{
			ID:       p.ID,
			Label:    p.Label,
			IsActive: p.ID == env.ActivePresetID,
		})
	}
	return out
}

// nextPresetID returns "preset-<n>" with the smallest free n >= 1.
func nextPresetID(existing []*preset) string {
	used := map[string]bool{}
	for _, p := range existing {
		used[p.ID] = true
	}
	for i := 1; i <= maxPresets+5; i++ {
		id := fmt.Sprintf("preset-%d", i)
		if !used[id] {
			return id
		}
	}
	return fmt.Sprintf("preset-%d", time.Now().UnixNano())
}
