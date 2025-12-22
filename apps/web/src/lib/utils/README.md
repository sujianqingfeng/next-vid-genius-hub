# Utils Module

这个模块提供了应用程序中使用的各种工具函数，包括格式化、样式合并等实用功能。

## 目录结构

```
lib/utils/
├── index.ts           # 仅导出 `cn`（不再聚合导出）
├── format/format.ts   # 格式化相关工具函数
├── format/color.ts    # 颜色相关工具函数
├── __tests__/         # 测试文件目录
│   └── format.test.ts # 格式化函数的测试文件
└── README.md          # 本文档
```

## 导入方式

```typescript
// 直接从具体模块导入（推荐）
import { formatNumber } from '~/lib/utils/format/format'
import { getTimeAgo as formatTimeAgo } from '~/lib/utils/time'
// 仅 `cn` 仍从 utils 入口导入
import { cn } from '~/lib/utils'
```

## 可用的工具函数

### 样式工具

#### `cn(...inputs: ClassValue[])`

合并 Tailwind CSS 类名，支持条件类和去重。

```typescript
cn('base-class', condition && 'conditional-class', 'another-class')
```

### 格式化工具

#### `formatNumber(num)`

使用 `Intl.NumberFormat` 的千分位格式化数字。

```typescript
formatNumber(1500) // "1,500"
formatNumber(123456789) // "123,456,789"
```

## 测试

运行格式化函数的测试：

```bash
pnpm dlx vitest run lib/utils/__tests__/format.test.ts
```

## 最佳实践

1. **统一使用**：在整个应用程序中使用这些工具函数，而不是在组件内重复造轮子。
2. **类型安全**：所有导出的函数都提供 TypeScript 类型，确保编辑器补全友好。
3. **保持精简**：若需要新的格式化逻辑，请在需求明确时再添加，避免堆积未使用的工具。

## 扩展

如果需要添加新的工具函数，请：

1. 如果是格式化相关，添加到 `format.ts`
2. 如果是其他类型，创建新的模块文件（如 `validation.ts`）
3. 在 `__tests__/` 目录下编写对应的测试
4. 更新此文档，保持使用说明与实现同步
