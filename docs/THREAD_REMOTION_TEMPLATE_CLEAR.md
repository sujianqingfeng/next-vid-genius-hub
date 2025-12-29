# Thread Remotion 模板配置：全清旧数据（v1-only）

当我们决定 **不兼容旧的 `templateConfig`** 时，建议先把现有 threads 的模板字段全清，避免历史数据在预览/云渲染里产生不一致行为。

## 要清理的字段

- `threads.template_id`
- `threads.template_config`

## SQL（全清）

```sql
UPDATE threads
SET template_id = NULL,
	template_config = NULL;
```

## D1 执行（Wrangler）

在 `apps/web` 目录下执行（本地/远程二选一）：

- 本地（wrangler dev 的持久化 D1）
	- `pnpm exec wrangler --config wrangler.root.jsonc d1 execute vidgen_app --local --persist-to ./.wrangler/state --command "UPDATE threads SET template_id = NULL, template_config = NULL;"`
- 远程（Cloudflare D1 远端数据库，谨慎）
	- `pnpm exec wrangler --config wrangler.root.jsonc d1 execute vidgen_app --remote --command "UPDATE threads SET template_id = NULL, template_config = NULL;"`

