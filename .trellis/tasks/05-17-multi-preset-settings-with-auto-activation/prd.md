# Multi-preset settings with auto-activation

## Goal

把"预设"从前端 localStorage 提到后端，作为真正的配置档案：用户可以维护最多 5 套独立 API 配置，切换预设 = 切换 pipeline 实际使用的 API。当前问题是预设只存前端、保存设置只持久化最后一次编辑值，pipeline 永远只看到一个版本。

## Background

当前实现：
- 前端 `localStorage` 存预设列表 + 当前 active id
- 修改字段 → 自动写入当前预设（前端 state）
- 「保存设置」→ 后端 `settings.json` 写入当前 values
- 切换预设 → 前端 state 切换，但**后端 settings.json 不变**

这导致 pipeline 实际用的永远是上次「保存设置」时的值，预设切换没意义。

## Requirements

### 1. 数据模型变更

后端 `settings.json` 改为：
```json
{
  "version": 2,
  "active_preset_id": "preset-1",
  "presets": [
    {
      "id": "preset-1",
      "label": "默认 OpenAI 兼容",
      "values": { "ANALYSIS_API_BASE_URL": "...", "ANALYSIS_API_KEY": "...", ... }
    },
    ...
  ],
  "global": {
    "WORKSPACE_DIR": "..."  // 不属于预设的全局字段
  }
}
```

字段分类：
- **Per-preset**：`ANALYSIS_*`, `IMAGE_*`, `ANALYSIS_MODEL`, `IMAGE_MODEL`, `ASPECT_RATIO`, `FINAL_IMAGE_SIZE`
- **Global**：`WORKSPACE_DIR`（一处不会跟着预设切）

### 2. Settings service 重构

`internal/settings/service.go`：
- `GetSettings(reveal)` 返回当前 active preset 的 values + global，前端无感知（兼容现有 UI）
- 新增预设管理 API：
  - `ListPresets() []PresetMeta` — 返回 `[{id, label, hasValue}]`，不含 secret 值
  - `GetActivePresetID() string`
  - `SetActivePreset(id) []SettingItem` — 切换 + 自动持久化 + 返回新 values
  - `CreatePreset(label) Preset` — 新建空预设；超过 5 个返回错误
  - `RenamePreset(id, label) error`
  - `DeletePreset(id) error` — 删除非 active 的（active 不能删）；少于 1 个不能删
- `SaveSettings(values)` 写入**当前 active preset** 的 values

### 3. 前端 SettingsPage 重构

- 顶部预设栏：
  - 当前预设列表（按钮组）+「+ 新建」按钮（已达 5 个时禁用）
  - 选中态高亮
  - hover 出现「重命名 / 删除」小按钮
- 切换预设逻辑：
  - 如果 `dirty=true` → 弹 confirm「当前预设有未保存修改，切换会丢弃。继续？」
  - 否则直接切换：调 `settingsClient.activate(id)` → 后端持久化 + 返回新 values → 更新 UI
- 删除最后一个预设按钮禁用（保留至少 1 个）
- 删除当前 active 预设时给出错误提示
- 不再用 localStorage

### 4. Pipeline 使用 active preset 配置

`runner.go` 的 `resolveConfig` 调 `settings.ResolveAll()` — 这个 API 不变，但内部从 active preset 取值。所有 runner 自动用上新逻辑。

### 5. 数据迁移

启动时检测 `settings.json`：
- 如果是旧格式（直接的 key→value map）→ 包装成 v2，作为单一预设 `default`，默认 active
- 旧字段 `WORKSPACE_DIR` 放到 `global` 区
- 写回新格式

## Acceptance Criteria

- [ ] 设置页顶部能看到预设按钮 + 「新建」按钮
- [ ] 新建预设最多 5 个（超过禁用按钮）
- [ ] 切换预设时 dirty=true 弹确认，否则直接切
- [ ] 切换后后端 settings.json 的 active_preset_id 立即更新
- [ ] 修改字段 + 保存 → 写入当前 active 预设的 values
- [ ] 重命名预设按钮可用
- [ ] 删除非 active 预设可用；删除 active 提示错误；剩 1 个时禁用删除
- [ ] WORKSPACE_DIR 不跟随预设切换
- [ ] Pipeline runner 用当前 active preset 的 API 配置
- [ ] 旧的 settings.json 升级到 v2 后所有原值落到 default 预设
- [ ] Go 编译 + 前端 build 通过

## Out of Scope

- 导入/导出预设
- 预设排序
- 跨设备同步
- 预设级别的自定义颜色/图标
- 预设之间的字段复制（用户可以手动复制粘贴）

## Technical Notes

- 后端 PresetMeta 不返回真实 secret，只 hasValue
- 前端 `useConfirm` 复用现有 hook
- Service 内部加 mu 保证 atomic preset 切换 + 写文件
- atomic 写文件复用之前 `WriteCacheFile` 的 tmp+rename 模式
- 旧版 localStorage `fashion-ai-gateway-presets-v2` 清掉（或忽略）

## Decision (ADR-lite)

**Context**：预设可以纯前端 localStorage 存
**Decision**：放后端 settings.json。pipeline 是后端逻辑，预设必须从后端取，不然要做前端 → 后端的 sync 协议
**Consequences**：settings.json 结构变化，需要做 v1→v2 迁移；多了几个后端 API
