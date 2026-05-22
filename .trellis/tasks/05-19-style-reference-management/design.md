# Technical Design: 多套可选风格参考管理与生成时选择

## Architecture Overview

```
Frontend (React)                Backend (Go)                    Storage
─────────────────              ──────────────────              ─────────────────
StylesPage                     style.Service                   <workspace>/styles/
  ├─ StyleList                   ├─ ListStyles()                 ├─ styles.json
  ├─ StyleFormDialog             ├─ GetStyle(id)                 └─ images/
  └─ StyleCard                   ├─ CreateStyle(input)               ├─ style-001/
                                 ├─ UpdateStyle(id, input)           │   ├─ ref1.jpg
GeneratePage                     ├─ DeleteStyle(id)                  │   └─ ref2.jpg
  └─ StyleSelector               └─ GenerateStylePrompt(...)         └─ style-002/
      (dropdown)                                                         └─ ...
                                 pipeline.LoadStylePrompt(id)
SettingsPage                     
  └─ DefaultStyleSelector        settings.Service
      (dropdown)                   └─ global.DEFAULT_STYLE_ID
```

## Data Model

### Style Entity

```go
// apps/backend/internal/style/types.go
type Style struct {
    ID              string   `json:"id"`
    Name            string   `json:"name"`
    Prompt          string   `json:"prompt"`
    ReferenceImages []string `json:"reference_images"`  // filenames only
    CreatedAt       string   `json:"created_at"`        // ISO 8601
}

type StyleInput struct {
    Name   string `json:"name"`
    Prompt string `json:"prompt"`
}
```

### Storage Layout

```
<workspace>/
  styles/
    styles.json          # 元数据索引
    images/
      style-001/         # 风格套 ID 对应的参考图目录
        ref1.jpg
        ref2.jpg
      style-002/
        ref1.jpg
```

**styles.json**:

```json
{
  "styles": [
    {
      "id": "style-001",
      "name": "简约白底",
      "prompt": "White background, square composition...",
      "reference_images": ["ref1.jpg", "ref2.jpg"],
      "created_at": "2026-05-19T14:30:00Z"
    }
  ]
}
```

## Backend Design

### 1. Style Service

**Location**: `apps/backend/internal/style/service.go`

```go
type Service struct {
    ws *workspace.Resolver
}

func NewService(ws *workspace.Resolver) *Service

// CRUD
func (s *Service) ListStyles() ([]Style, error)
func (s *Service) GetStyle(id string) (*Style, error)
func (s *Service) CreateStyle(input StyleInput) (*Style, error)
func (s *Service) UpdateStyle(id string, input StyleInput) (*Style, error)
func (s *Service) DeleteStyle(id string) error

// AI generation
func (s *Service) GenerateStylePrompt(description string, imagePaths []string) (string, error)

// Image management
func (s *Service) UploadImage(styleID string, filename string, data []byte) error
func (s *Service) DeleteImage(styleID string, filename string) error
```

**Implementation notes**:

- `styles.json` 读写用 `sync.RWMutex` 保护
- `CreateStyle` 生成 UUID v4 作为 ID
- `DeleteStyle` 同时删除 `images/<styleID>/` 目录
- `GenerateStylePrompt` 调用 `pipeline.AnalyzeStyle`（复用现有逻辑）

### 2. Pipeline Integration

**Modify**: `apps/backend/internal/pipeline/style.go`

```go
// 新增：根据风格套 ID 加载提示词
func LoadStylePrompt(ws *workspace.Resolver, styleID string) (string, error) {
    if styleID == "" {
        return FallbackGlobalStylePrompt(), nil
    }
    
    // 读 styles.json，找到对应风格套
    style, err := loadStyleByID(ws, styleID)
    if err != nil {
        return "", fmt.Errorf("风格套 %s 不存在: %w", styleID, err)
    }
    
    return style.Prompt, nil
}
```

**Modify**: `apps/backend/internal/pipeline/runner.go`

```go
// runAnalyzeStage 和 runGenerateStage 增加参数
func runAnalyzeStage(ctx context.Context, cfg *Config, logger *log.Logger, globalStyleID string) (map[string]interface{}, error) {
    // ...
    globalStyle, err := LoadStylePrompt(cfg.Workspace, globalStyleID)
    if err != nil {
        return nil, err
    }
    // ... 后续逻辑不变
}
```

**Modify**: `apps/backend/internal/job/service.go`

```go
// StartJob 增加 options 参数
type JobOptions struct {
    GlobalStyleID string `json:"global_style_id"`
}

func (s *Service) StartJob(kind, productID string, options JobOptions) (*Job, error) {
    // ... 将 options 传给 runner
}
```

### 3. Settings Integration

**Modify**: `apps/backend/internal/settings/service.go`

在 `defaultGlobalSettings` 增加：

```go
"DEFAULT_STYLE_ID": "",  // 空字符串表示"不使用"
```

## Frontend Design

### 1. Type Definitions

**Location**: `apps/web/src/core/types.ts`

```ts
export type Style = {
  id: string
  name: string
  prompt: string
  reference_images: string[]
  created_at: string
}

export type StyleInput = {
  name: string
  prompt: string
}

export type TopPage = "products" | "styles" | "cache" | "settings"
```

### 2. Style Client

**Location**: `apps/web/src/core/style-client.ts`

```ts
import { ListStyles, GetStyle, CreateStyle, UpdateStyle, DeleteStyle, GenerateStylePrompt, UploadStyleImage, DeleteStyleImage } from "../wailsjs/wailsjs/go/style/Service"
import type { Style, StyleInput } from "./types"

export const styleClient = {
  list: () => ListStyles(),
  get: (id: string) => GetStyle(id),
  create: (input: StyleInput) => CreateStyle(input),
  update: (id: string, input: StyleInput) => UpdateStyle(id, input),
  delete: (id: string) => DeleteStyle(id),
  generatePrompt: (description: string, imagePaths: string[]) => GenerateStylePrompt(description, imagePaths),
  uploadImage: (styleID: string, filename: string, data: string) => UploadStyleImage(styleID, filename, data),
  deleteImage: (styleID: string, filename: string) => DeleteStyleImage(styleID, filename),
}
```

### 3. Styles Page

**Location**: `apps/web/src/pages/StylesPage.tsx`

```tsx
export function StylesPage() {
  const [styles, setStyles] = useState<Style[]>([])
  const [createOpen, setCreateOpen] = useState(false)
  const [editingStyle, setEditingStyle] = useState<Style | null>(null)
  
  // ... CRUD logic
  
  return (
    <div className="p-5">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">风格参考</h1>
        <Button onClick={() => setCreateOpen(true)}>新建风格</Button>
      </div>
      
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {styles.map(style => (
          <StyleCard
            key={style.id}
            style={style}
            onEdit={() => setEditingStyle(style)}
            onDelete={() => deleteStyle(style.id)}
          />
        ))}
      </div>
      
      <StyleFormDialog
        open={createOpen || editingStyle !== null}
        mode={editingStyle ? "edit" : "create"}
        initialStyle={editingStyle}
        onOpenChange={(open) => { ... }}
        onSaved={() => { ... }}
      />
    </div>
  )
}
```

### 4. Style Form Dialog

**Location**: `apps/web/src/pages/StyleFormDialog.tsx`

```tsx
export function StyleFormDialog({ open, mode, initialStyle, onOpenChange, onSaved }) {
  const [name, setName] = useState("")
  const [prompt, setPrompt] = useState("")
  const [images, setImages] = useState<File[]>([])
  const [generating, setGenerating] = useState(false)
  
  async function handleGeneratePrompt() {
    setGenerating(true)
    try {
      // 上传图片到临时位置，获取路径
      const paths = await uploadTempImages(images)
      const generated = await styleClient.generatePrompt(prompt, paths)
      setPrompt(generated)  // 填充到文本框
    } finally {
      setGenerating(false)
    }
  }
  
  async function handleSave() {
    const input = { name, prompt }
    if (mode === "create") {
      const created = await styleClient.create(input)
      // 上传参考图
      for (const file of images) {
        const data = await readAsBase64(file)
        await styleClient.uploadImage(created.id, file.name, data)
      }
      onSaved(created.id)
    } else {
      await styleClient.update(initialStyle.id, input)
      // TODO: 处理图片增删
      onSaved(initialStyle.id)
    }
  }
  
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{mode === "create" ? "新建风格" : "编辑风格"}</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4">
          <FormField label="风格名称" required>
            <Input value={name} onChange={e => setName(e.target.value)} />
          </FormField>
          
          <FormField label="风格提示词" hint="可以直接输入，或上传参考图后点击「AI 生成」">
            <Textarea rows={8} value={prompt} onChange={e => setPrompt(e.target.value)} />
          </FormField>
          
          <FormField label="参考图片（可选）">
            <input type="file" multiple accept="image/*" onChange={e => setImages(Array.from(e.target.files))} />
            {/* TODO: 图片预览 + 删除 */}
          </FormField>
        </div>
        
        <DialogFooter>
          <Button variant="outline" onClick={handleGeneratePrompt} disabled={generating || images.length === 0}>
            {generating ? "生成中..." : "AI 生成风格提示词"}
          </Button>
          <Button onClick={handleSave}>保存</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
```

### 5. Style Selector in GeneratePage

**Location**: `apps/web/src/pages/GeneratePage.tsx`

```tsx
export function GeneratePage({ productId }) {
  const [styles, setStyles] = useState<Style[]>([])
  const [selectedStyleID, setSelectedStyleID] = useState<string>("")
  
  useEffect(() => {
    // 加载风格列表
    styleClient.list().then(setStyles)
    
    // 读取当前产品的风格选择（localStorage）
    const saved = localStorage.getItem(`product-${productId}-style-selection`)
    if (saved) {
      setSelectedStyleID(saved)
    } else {
      // 读取默认风格（从 settings）
      settingsClient.getAll().then(settings => {
        const defaultID = settings.find(s => s.key === "DEFAULT_STYLE_ID")?.value || ""
        setSelectedStyleID(defaultID)
      })
    }
  }, [productId])
  
  useEffect(() => {
    // 保存选择到 localStorage
    if (selectedStyleID !== undefined) {
      localStorage.setItem(`product-${productId}-style-selection`, selectedStyleID)
    }
  }, [selectedStyleID, productId])
  
  async function startJob(kind: JobKind) {
    await jobClient.start(kind, productId, { globalStyleID: selectedStyleID })
  }
  
  return (
    <div>
      <Collapsible>
        <CollapsibleTrigger>风格选择</CollapsibleTrigger>
        <CollapsibleContent>
          <Select value={selectedStyleID} onValueChange={setSelectedStyleID}>
            <SelectItem value="">不使用</SelectItem>
            {styles.map(s => (
              <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
            ))}
          </Select>
        </CollapsibleContent>
      </Collapsible>
      
      {/* 原有的生成按钮 */}
      <Button onClick={() => startJob("analyze")}>仅分析</Button>
      <Button onClick={() => startJob("generate")}>分析并生图</Button>
    </div>
  )
}
```

### 6. Default Style in SettingsPage

**Location**: `apps/web/src/pages/SettingsPage.tsx`

在"生成配置"区域增加：

```tsx
<FormField label="默认风格" hint="新产品第一次生成时使用的风格">
  <Select value={defaultStyleID} onValueChange={setDefaultStyleID}>
    <SelectItem value="">不使用</SelectItem>
    {styles.map(s => (
      <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
    ))}
  </Select>
</FormField>
```

## Migration & Compatibility

### Backward Compatibility

- 旧的 `<workspace>/images/` 目录不受影响（现有代码已经 fallback 到硬编码）
- 新增的 `<workspace>/styles/` 目录不会与现有数据冲突
- 如果 `styles.json` 不存在，`ListStyles` 返回空数组
- 如果 `DEFAULT_STYLE_ID` 为空或风格套不存在，fallback 到硬编码

### Data Migration

无需迁移。用户从 v1.1 升级到 v1.2 后：
- 第一次打开"风格参考"页，看到空列表
- 可以开始创建风格套
- 生成时默认仍使用硬编码提示词（`DEFAULT_STYLE_ID` 为空）

## Error Handling

1. **风格套不存在**：
   - 前端选择了一个已删除的风格套 ID
   - 后端返回错误："风格套 xxx 不存在"
   - 前端 toast 错误，fallback 到"不使用"

2. **AI 生成失败**：
   - `GenerateStylePrompt` 调用 ANALYSIS_API 失败
   - 返回错误给前端
   - 前端 toast 错误，用户可以手动输入提示词

3. **图片上传失败**：
   - 磁盘空间不足 / 权限问题
   - 返回错误，前端 toast
   - 风格套仍然创建成功（只是没有参考图）

## Performance Considerations

- `styles.json` 文件大小：假设 100 个风格套，每个提示词 500 字符，总计 ~50KB，可接受
- 图片存储：每个风格套最多 10 张参考图，每张 2MB，单个风格套最多 20MB
- 前端加载：`ListStyles` 只返回元数据，不包含图片 base64，性能无问题

## Security Considerations

- 风格套 ID 用 UUID，不可预测
- 图片上传时校验文件类型（`.jpg / .png / .webp`）
- 提示词长度限制（最多 5000 字符）
- 风格套名称长度限制（最多 100 字符）

## Testing Strategy

### Backend Unit Tests

- `style.Service.CreateStyle` / `UpdateStyle` / `DeleteStyle`
- `pipeline.LoadStylePrompt` 的 fallback 逻辑

### Frontend Manual Tests

- 创建风格套（纯文本 / AI 生成 / 上传图片）
- 编辑风格套
- 删除风格套
- 生成时选择风格套
- 设置默认风格
- 删除风格套后，生成时 fallback 到"不使用"

## Rollback Plan

如果上线后发现严重问题：

1. **前端回滚**：
   - 隐藏"风格参考"页（从侧边栏移除）
   - 隐藏"生成"tab 的风格选择面板
   - 隐藏"设置"页的默认风格配置

2. **后端回滚**：
   - `LoadStylePrompt` 始终返回 `FallbackGlobalStylePrompt()`
   - 不影响现有生成流程

3. **数据保留**：
   - `<workspace>/styles/` 目录保留，不删除
   - 用户数据不丢失，修复后可以继续使用
