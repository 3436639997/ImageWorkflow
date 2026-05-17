# Polish product form and open-folder button

## Goal

两件事：
1. 重构产品表单 UI，分成「基本信息 / 颜色信息 / 高级（备注/映射）」三个区块，紧凑美观
2. 新增「打开文件夹」能力：产品页（新建产品按钮左侧入口，按当前选中产品打开 `new_products/<id>/`）和设置页（输出目录字段右侧打开 OUTPUT_DIR）

## Requirements

### 1. Go 后端：打开文件夹能力

`internal/system/service.go`：
- 新增 `OpenInFileManager(path string) error`
  - 解析为绝对路径并校验存在
  - 调用系统命令：Windows `explorer`、macOS `open`、Linux `xdg-open`
  - 不存在的话先创建目录（mkdir -p）
- 暴露给前端

### 2. 前端 system-client 扩展

- `core/system-client.ts` 新增 `openInFileManager(path: string)`

### 3. 产品页 UI 调整

`apps/web/src/pages/ProductsPage.tsx`：
- 「��品列表」标题右侧的按钮区改为：「打开文件夹」+「新建产品」两个按钮并排
  - 「打开文件夹」按钮在没选中产品时禁用
  - 点击后调用 `openInFileManager('new_products/<id>')`

### 4. 产品表单重构（Dialog 内）

分成 3 个区块（用 `Separator` 或卡片分隔）：

**A. 基本信息**
- 产品 ID（必填，新建时可填，编辑时只读）
- 产品名称
- 一级类目
- 关键词

**B. 颜色信息**
- 主推颜色
- 所有颜色（逗号分隔）
- 颜色 → 图片映射（JSON）
- 细节图数量

**C. 描述与备注**
- 产品描述（textarea）
- 备注（textarea）

视觉调整：
- Dialog 宽度合适（max-w-3xl）
- 区块标题用小标题（text-sm font-semibold + 顶部小间距）
- 字段分组用 grid-cols-2，部分宽字段跨列
- 表单滚动：内容多时 DialogContent 内部可滚动，避免超出屏幕

### 5. 设置页：输出目录加打开按钮

`apps/web/src/pages/SettingsPage.tsx`：
- 「输出目录」字段从 TextInput 改为 InputWithActions（已有组件），右侧加「打开」按钮
- 按钮调用 `openInFileManager(values.OUTPUT_DIR)`

## Acceptance Criteria

- [ ] 产品页「产品列表」头部有「打开文件夹」按钮
- [ ] 选中产品后点击该按钮，系统文件管理器打开对应 `new_products/<id>/`
- [ ] 未选中产品时按钮 disabled
- [ ] 设置页「输出目录」字段右侧有「打开」按钮
- [ ] 点击后系统文件管理器打开对应输出目录
- [ ] 产品表单 Dialog 视觉上有清晰的分区
- [ ] 产品表单在小屏幕能正常滚动
- [ ] Go 编译通过 + 前端 typecheck + production build 通过

## Out of Scope

- 不改产品列表项的样式
- 不改产品详情区右侧的图片缩略图布局
- 不增加新字段
- 不重写 settings 页其他部分

## Technical Notes

- Windows `explorer` 一定要用绝对路径，相对路径会有歧义
- 用 `os/exec` 跨平台启动文件管理器
- 路径校验：禁止 `..` 和绝对路径外的内容（可选，但 path 来自 Go 端的配置，相对安全）
- Dialog 内部滚动：在 DialogContent 上加 `max-h-[85vh] overflow-y-auto` 或类似
