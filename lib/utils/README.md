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

#### `formatNumber(num, options?)`
格式化数字，支持 K、M、B 后缀。

```typescript
formatNumber(1500) // "1.5K"
formatNumber(1500000) // "1.5M"
formatNumber(1500000000) // "1.5B"
formatNumber(1500, { decimals: 0 }) // "2K"
formatNumber(1500000000, { includeBillion: false }) // "1500.0M"
```

**选项：**
- `includeBillion`: 是否包含 B (十亿) 后缀，默认为 `true`
- `decimals`: 小数位数，默认为 `1`

#### `formatViewCount(count)`
专门用于格式化观看次数，包含 B 后缀。

```typescript
formatViewCount(1500000000) // "1.5B"
formatViewCount(1500000) // "1.5M"
```

#### `formatLikes(count)`
专门用于格式化点赞数，不包含 B 后缀。

```typescript
formatLikes(1500000000) // "1500.0M"
formatLikes(1500000) // "1.5M"
```

#### `formatTimeAgo(date)`
格式化相对时间。

```typescript
formatTimeAgo(new Date()) // "Just now"
formatTimeAgo(fiveMinutesAgo) // "5m ago"
formatTimeAgo(oneHourAgo) // "1h ago"
formatTimeAgo(oneDayAgo) // "1d ago"
formatTimeAgo(oneMonthAgo) // "1mo ago"
```

#### `formatDuration(seconds)`
格式化持续时间。

```typescript
formatDuration(65) // "01:05"
formatDuration(3665) // "01:01:05"
```

#### `formatDate(date, options?)`
格式化日期。

```typescript
formatDate(new Date('2023-12-25')) // "Dec 25, 2023"
formatDate(new Date(), { includeTime: true }) // "Dec 25, 2023, 10:30 AM"
formatDate(today, { relative: true }) // "Today"
```

**选项：**
- `includeTime`: 是否包含时间，默认为 `false`
- `relative`: 是否使用相对时间（今天、昨天等），默认为 `false`

#### `formatFileSize(bytes)`
格式化文件大小。

```typescript
formatFileSize(1024) // "1 KB"
formatFileSize(1024 * 1024) // "1 MB"
formatFileSize(1536) // "1.5 KB"
```

#### `formatPercentage(value, decimals?)`
格式化百分比。

```typescript
formatPercentage(0.5) // "50.0%"
formatPercentage(0.123, 2) // "12.30%"
```

#### `formatCurrency(amount, currency?)`
格式化货币。

```typescript
formatCurrency(1234.56) // "$1,234.56"
formatCurrency(1234.56, 'EUR') // "€1,234.56"
```

## 测试

运行格式化函数的测试：

```bash
pnpm dlx vitest run lib/utils/__tests__/format.test.ts
```

## 最佳实践

1. **统一使用**：在整个应用程序中使用这些格式化函数，而不是定义本地的格式化逻辑
2. **类型安全**：所有函数都有完整的 TypeScript 类型定义
3. **可配置**：使用选项参数来自定义格式化行为
4. **国际化**：日期和货币格式化支持国际化
5. **性能**：函数经过优化，适合频繁调用

## 扩展

如果需要添加新的工具函数，请：

1. 如果是格式化相关，添加到 `format.ts`
2. 如果是其他类型，创建新的模块文件（如 `validation.ts`）
3. 在 `index.ts` 中导出新函数
4. 在 `__tests__/` 目录下创建对应的测试文件（如 `validation.test.ts`）
5. 更新此文档
