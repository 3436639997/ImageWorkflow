# 保存卡死与 base URL 自动补全 v1

## Goal

修复两个用户报告的 bug：
1. 点击「保存设置」一直显示"保存中..."不返回，前端卡死
2. base URL 必须手动加 `/v1` 才能正常拉模型，应该自动补齐

## Bug 1: 保存死锁

**根因**：`apps/backend/internal/settings/service.go:128-148`

```go
func (s *Service) SaveSettings(values map[string]string) ([]SettingItem, error) {
    s.mu.Lock()
    defer s.mu.Unlock()
    // ... persist ...
    return s.GetSettings(false)  // ← GetSettings 内部 s.load() → s.mu.Lock() 死锁
}
```

`SaveSettings` 已持有 mutex，最后调用的 `GetSettings(false)` 会进入 `load()` → `loadLocked()`，期间 `load()` 会再次 `s.mu.Lock()` 导致死锁。前端 Wails 调用永远等不到返回，所以一直显示"保存中..."。

**修复**：让 `SaveSettings` 返回前自己组装结果（或调用一个不加锁的 inner method），不要再调一遍走完整锁的 `GetSettings`。

## Bug 2: base URL 自动补全 /v1

**根因**：后端 `endpointForKind` / `fetchModels` 直接拿 base URL 拼 `/models`。输入 `https://hub.example.com` 会拼成 `https://hub.example.com/models`，但实际网关的 OpenAI 兼容路径是 `/v1/models`。

**修复策略**（参考老项目 `backend/routes/settings.py:81-84`）：拉取模型/测试连接时，如果 base URL 不以 `/v1` 结尾，则按 `<base>/v1/models` → `<base>/models` 顺序尝试，谁返回 200 用谁。

不修改用户输入的 base URL（保留用户填什么是什么），只在请求时智能匹配两种路径。

## Requirements

### Bug 1
- `SaveSettings` 修复死锁，调用立即返回最新 settings 列表
- 前端能正常收到结果，"保存设置"按钮按预期显示"保存中…"→ 完成

### Bug 2
- `TestSettings` 和 `FetchModels` 先尝试 `<base>/v1/models`（如果 base 不以 `/v1` 结尾），失败再试 `<base>/models`
- base 已包含 `/v1`：只试 `<base>/models`
- base URL 末尾的 `/` 容错（trim trailing slash）
- 用户输入 `https://hub.example.com` 也能正确拉到模型列表

## Acceptance Criteria

- [ ] 点击"保存设置"，按钮变"保存中..."后短时间内恢复，并显示成功提示
- [ ] settings.json 文件被正确写入用户配置目录
- [ ] 输入 `https://hub.example.com`（无 /v1）后点"测试分析网关"，能正常返回 ok
- [ ] 输入 `https://hub.example.com`（无 /v1）后点"刷新"模型，能正常拉到模型列表
- [ ] 已经填了 `/v1` 的用户行为不变（仍然正常工作）
- [ ] Go 编译通过，前端 typecheck 通过

## Out of Scope

- 不修改用户填写的 base URL 内容（不写回数据库）
- 不改变前端 UI
- 不引入额外的 URL 验证规则

## Technical Notes

- `service.go` 中可以提取一个 `getSettingsLocked(reveal bool)` 私有方法供 `SaveSettings` 复用
- 测试连接和拉模型：参考老项目 `backend/routes/settings.py:81-127` 和 `:138-158` 的 attempts 模式
