# PageHeader Component

统一的页面头部组件，提供一致的导航体验。

## 功能特性

- 统一的返回按钮样式和行为
- 可选的页面标题和描述，带竖线分隔符
- 适中的标题大小（text-xl），保持视觉平衡
- 灵活的右侧内容区域
- 支持不同的按钮变体和大小
- 响应式设计

## 基本用法

```tsx
import { PageHeader } from '~/components/layout'

// 基本用法
<PageHeader
  backHref="/media"
  backText="Back to Media"
  title="Page Title"
/>

// 带描述的用法
<PageHeader
  backHref="/media"
  backText="Back to Media"
  title="Page Title"
  description="Page description text"
/>

// 带右侧内容的用法
<PageHeader
  backHref="/media"
  backText="Back to Media"
  title="Comments"
  rightContent={<Badge>5 items</Badge>}
/>

// 自定义按钮样式
<PageHeader
  backHref="/media"
  backText="Back to Media"
  buttonVariant="ghost"
  buttonSize="default"
/>

// 带背景样式的头部（类似主页面风格）
<PageHeader
  backHref="/media"
  backText="Back to Media"
  title="Page Title"
  withBackground={true}
/>
```

## Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `backHref` | `string` | - | 返回链接的URL（必需） |
| `backText` | `string` | `'Back'` | 返回按钮的文本 |
| `title` | `string` | - | 页面标题 |
| `description` | `string` | - | 页面描述 |
| `rightContent` | `React.ReactNode` | - | 右侧内容 |
| `showBackButton` | `boolean` | `true` | 是否显示返回按钮 |
| `buttonVariant` | `'ghost' \| 'outline' \| 'secondary'` | `'outline'` | 按钮变体 |
| `buttonSize` | `'sm' \| 'default' \| 'lg'` | `'sm'` | 按钮大小 |
| `withBackground` | `boolean` | `false` | 是否使用背景样式 |

## 使用场景

- 媒体详情页：使用 `ghost` 变体，保持简洁
- 功能页面（字幕、评论）：使用 `outline` 变体，显示页面标题和竖线分隔符
- 带统计信息的页面：使用 `rightContent` 显示徽章或计数
- 主页面风格：使用 `withBackground={true}` 获得与主页面一致的背景样式
