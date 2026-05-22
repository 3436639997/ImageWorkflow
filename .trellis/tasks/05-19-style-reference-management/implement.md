# Implementation Plan: 多套可选风格参考管理与生成时选择

## Implementation Order

按依赖关系分 4 个阶段：

1. **后端基础** — style service + storage
2. **后端集成** — pipeline + job + settings
3. **前端基础** — types + client + styles page
4. **前端集成** — generate page + settings page

---

## Phase 1: 后端基础 (Backend Foundation)

### 1.1 创建 style package

- [ ] 创建 `apps/backend/internal/style/` 目录
- [ ] 创建 `types.go`：定义 `Style` / `StyleInput` 结构体
- [ ] 创建 `service.go`：实现 `Service` 结构体 + CRUD 方法
- [ ] 创建 `storage.go`：实现 `styles.json` 读写逻辑（带 `sync.RWMutex`）

**验证**：
```bash
cd apps/backend
go build ./internal/style
```

### 1.2 实现 style.Service CRUD

- [ ] `ListStyles() ([]Style, error)` — 读 `styles.json`，返回所有风格套
- [ ] `GetStyle(id string) (*Style, error)` — 根据 ID 查找
- [ ] `CreateStyle(input StyleInput) (*Style, error)` — 生成 UUID，写入 `styles.json`
- [ ] `UpdateStyle(id string, input StyleInput) (*Style, error)` — 更新元数据
- [ ] `DeleteStyle(id string) error` — 删除元数据 + `images/<id>/` 目录

**验证**：
```bash
cd apps/backend/internal/style
go test -v
```

### 1.3 实现图片管理

- [ ] `UploadImage(styleID, filename string, data []byte) error` — 写入 `<workspace>/styles/images/<styleID>/<filename>`
- [ ] `DeleteImage(styleID, filename string) error` — 删除文件
- [ ] `ListImages(styleID string) ([]string, error)` — 列出风格套的所有图片

**验证**：手动测试上传/删除

### 1.4 实现 AI 生成

- [ ] `GenerateStylePrompt(description string, imagePaths []string) (string, error)`
- [ ] 复用 `pipeline.AnalyzeStyle`（传入 description + 图片）
- [ ] 返回生成的提示词

**验证**：
```bash
# 手动调用，传入测试图片路径
```

---

## Phase 2: 后端集成 (Backend Integration)

### 2.1 修改 pipeline/style.go

- [ ] 新增 `LoadStylePrompt(ws *workspace.Resolver, styleID string) (string, error)`
- [ ] 如果 `styleID == ""`，返回 `FallbackGlobalStylePrompt()`
- [ ] 否则读 `styles.json`，找到对应风格套，返回 `prompt`
- [ ] 如果找不到，返回错误

**验证**：
```bash
cd apps/backend/internal/pipeline
go test -run TestLoadStylePrompt
```

### 2.2 修改 pipeline/runner.go

- [ ] `runAnalyzeStage` 增加参数 `globalStyleID string`
- [ ] 调用 `LoadStylePrompt(cfg.Workspace, globalStyleID)` 替代 `LoadOrAnalyzeGlobalStyle`
- [ ] `runGenerateStage` 同样修改
- [ ] 删除旧的 `LoadOrAnalyzeGlobalStyle` / `LoadOrAnalyzeCategoryStyle` 调用

**验证**：
```bash
cd apps/backend
go build ./...
```

### 2.3 修改 job/service.go

- [ ] 定义 `JobOptions` 结构体：`GlobalStyleID string`
- [ ] `StartJob` 方法增加 `options JobOptions` 参数
- [ ] 将 `options.GlobalStyleID` 传给 runner

**验证**：
```bash
cd apps/backend/internal/job
go test -v
```

### 2.4 修改 settings/service.go

- [ ] 在 `defaultGlobalSettings` 增加 `"DEFAULT_STYLE_ID": ""`

**验证**：
```bash
# 启动 wails dev，检查设置页是否有新字段
```

### 2.5 Wails 绑定

- [ ] 在 `apps/backend/app.go` 注册 `style.Service`
- [ ] 运行 `wails dev` 生成前端绑定

**验证**：
```bash
cd apps/backend
wails dev
# 检查 apps/web/src/wailsjs/wailsjs/go/style/ 是否生成
```

---

## Phase 3: 前端基础 (Frontend Foundation)

### 3.1 类型定义

- [ ] 修改 `apps/web/src/core/types.ts`：
  - 增加 `Style` / `StyleInput` 类型
  - 修改 `TopPage` 类型：增加 `"styles"`

**验证**：
```bash
cd apps/web
pnpm exec tsc --noEmit
```

### 3.2 Style Client

- [ ] 创建 `apps/web/src/core/style-client.ts`
- [ ] 封装 wailsjs 的 style service 方法

**验证**：
```bash
pnpm exec tsc --noEmit
```

### 3.3 Styles Page

- [ ] 创建 `apps/web/src/pages/StylesPage.tsx`
- [ ] 实现风格套列表（卡片式）
- [ ] 实现新建/编辑/删除操作

**验证**：
```bash
pnpm --filter web dev
# 手动访问 http://localhost:34115，切到"风格参考"页
```

### 3.4 Style Form Dialog

- [ ] 创建 `apps/web/src/pages/StyleFormDialog.tsx`
- [ ] 表单字段：名称、提示词、参考图片
- [ ] "AI 生成风格提示词"按钮
- [ ] "保存"按钮

**验证**：
```bash
# 手动测试创建/编辑风格套
```

### 3.5 Style Card

- [ ] 创建 `apps/web/src/pages/StyleCard.tsx`
- [ ] 显示风格套名称、提示词预览、参考图缩略图
- [ ] 编辑/删除按钮

**验证**：
```bash
# 手动测试卡片交互
```

---

## Phase 4: 前端集成 (Frontend Integration)

### 4.1 修改 App.tsx

- [ ] 修改 `TopPage` 类型，增加 `"styles"`
- [ ] 修改侧边栏顺序：产品 / **风格参考** / 缓存 / 设置
- [ ] 路由：`topPage === "styles"` 时渲染 `<StylesPage />`

**验证**：
```bash
pnpm wails:dev
# 检查侧边栏是否有"风格参考"项
```

### 4.2 修改 app-sidebar.tsx

- [ ] 在 `SidebarMenu` 增加"风格参考"菜单项
- [ ] 图标：使用 `Palette` 或 `Sparkles`
- [ ] 位置：产品和缓存之间

**验证**：
```bash
# 手动点击侧边栏"风格参考"，检查是否跳转
```

### 4.3 修改 GeneratePage.tsx

- [ ] 增加 `StyleSelector` 组件（可折叠面板 + 下拉框）
- [ ] 从 `styleClient.list()` 加载风格列表
- [ ] 从 localStorage 读取当前产品的风格选择
- [ ] 如果 localStorage 没有，从 settings 读取 `DEFAULT_STYLE_ID`
- [ ] 选择后保存到 localStorage
- [ ] 调用 `jobClient.start` 时传入 `{ globalStyleID }`

**验证**：
```bash
# 手动测试：
# 1. 选择风格套
# 2. 点击"仅分析"
# 3. 检查后端日志是否使用了对应的风格提示词
```

### 4.4 修改 job-client.ts

- [ ] `start` 方法增加 `options?: { globalStyleID?: string }` 参数
- [ ] 调用 wailsjs 的 `StartJob(kind, productID, options)`

**验证**：
```bash
pnpm exec tsc --noEmit
```

### 4.5 修改 SettingsPage.tsx

- [ ] 在"生成配置"区域增加"默认风格"下拉框
- [ ] 从 `styleClient.list()` 加载风格列表
- [ ] 读取 `DEFAULT_STYLE_ID` 设置项
- [ ] 保存时更新 `DEFAULT_STYLE_ID`

**验证**：
```bash
# 手动测试：
# 1. 设置默认风格
# 2. 创建新产品
# 3. 打开"生成" tab，检查是否自动选中默认风格
```

---

## Validation Commands

### 后端

```bash
cd apps/backend
go vet ./...
go build ./...
go test ./internal/style -v
```

### 前端

```bash
cd apps/web
pnpm exec tsc --noEmit
pnpm build
pnpm lint
```

### 集成测试

```bash
pnpm wails:dev
```

**手动测试清单**：

1. [ ] 创建风格套（纯文本）
2. [ ] 创建风格套（上传参考图 + AI 生成）
3. [ ] 编辑风格套
4. [ ] 删除风格套
5. [ ] 在"生成" tab 选择风格套
6. [ ] 点击"仅分析"，检查后端日志是否使用了对应的风格提示词
7. [ ] 选择"不使用"，检查是否 fallback 到硬编码
8. [ ] 设置默认风格
9. [ ] 创建新产品，检查是否自动使用默认风格
10. [ ] 删除风格套后，生成时检查是否报错并 fallback

---

## Risky Files / Rollback Points

### 高风险文件

- `apps/backend/internal/pipeline/runner.go` — 修改了核心生成流程
- `apps/backend/internal/job/service.go` — 修改了 job 调度接口

**Rollback 策略**：

如果 Phase 2 出现问题，可以：
1. 保留 `style.Service`（不影响现有功能）
2. 回滚 `runner.go` / `job/service.go` 的修改
3. 前端隐藏"风格参考"页和风格选择面板

### 低风险文件

- `apps/web/src/pages/StylesPage.tsx` — 新增页面，不影响现有功能
- `apps/web/src/core/style-client.ts` — 新增 client，不影响现有功能

---

## Follow-up Checks Before `task.py start`

- [ ] PRD 的 Acceptance Criteria 是否完整？
- [ ] Design.md 是否覆盖了所有关键决策？
- [ ] Implement.md 的步骤是否可执行？
- [ ] 是否有遗漏的依赖（shadcn 组件、Go 包）？
- [ ] 是否需要更新 `.gitignore`（`<workspace>/styles/` 不应入库）？

---

## Notes

- `<workspace>/styles/` 目录应该被 `.gitignore` 忽略（用户数据，不入库）
- 但 `styles.json` 的结构应该在文档里说明（方便用户手动备份）
- 如果用户删除了 `styles.json`，下次启动会自动创建空文件
