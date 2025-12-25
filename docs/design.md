# Flat Engineering Blueprint（工程蓝图风格）

目标：一种“技术文档式”的 UI 语言，优先表达系统结构与状态，追求客观、精确、高信息密度；不做营销式装饰。

## 核心哲学

- 规格优先：先定义规则与 token，再谈组件与页面
- 高 data-ink ratio：每个像素都要传达信息
- UI 是系统说明书：解释状态、流程、约束、边界

## 不可妥协（Non‑Negotiables）

- 禁止：阴影 / 渐变 / 玻璃拟态 / 模糊 / 发光 / 任何装饰性背景
- 边框：仅允许 `1px solid`（靠边框建立结构层次）
- 形状：矩形为主，圆角 `0–2px`（仅在可读性需要时使用）
- 动效：能不用就不用；允许的动效仅限“状态反馈”（例如加载/禁用）

## 颜色 Tokens

本风格建议使用“黑白灰 + 强对比”作为默认色系。以下为推荐 token（hex）。

### Light

| Token | 值 |
| --- | --- |
| Page BG | `#F8FAFC` |
| Surface | `#FFFFFF` |
| Border (Dim) | `#E2E8F0` |
| Border (Strong) | `#94A3B8` |
| Text (Main) | `#0F172A` |
| Text (Muted) | `#64748B` |
| Accent | `#000000` |

### Dark

| Token | 值 |
| --- | --- |
| Page BG | `#09090B` |
| Surface | `#18181B` |
| Border (Dim) | `#27272A` |
| Border (Strong) | `#52525B` |
| Text (Main) | `#F4F4F5` |
| Text (Muted) | `#A1A1AA` |
| Accent | `#FFFFFF` |

### 与当前主题变量的对齐（建议）

项目里 `apps/web/src/styles.css` 使用 `--background/--foreground/--border/...` 作为 Tailwind 语义色。要落地该风格时，优先“替换语义变量”，而不是在组件里到处写硬编码颜色。

参考（示意）：

```css
:root {
	--radius: 2px;
	--background: #f8fafc;
	--foreground: #0f172a;
	--card: #ffffff;
	--card-foreground: #0f172a;
	--muted: #ffffff;
	--muted-foreground: #64748b;
	--border: #e2e8f0;
	--input: #e2e8f0;
	--ring: #94a3b8;
	--primary: #000000;
	--primary-foreground: #ffffff;
}
.dark {
	--radius: 2px;
	--background: #09090b;
	--foreground: #f4f4f5;
	--card: #18181b;
	--card-foreground: #f4f4f5;
	--muted: #18181b;
	--muted-foreground: #a1a1aa;
	--border: #27272a;
	--input: #27272a;
	--ring: #52525b;
	--primary: #ffffff;
	--primary-foreground: #09090b;
}
```

## 字体与排版

- 标题 / 标签（Headers & Labels）
  - 无衬线（优先 `Inter`；没有则沿用当前 `--font-sans`）
  - `UPPERCASE` + `tracking`（更像“仪表盘标签”）
- 数据 / ID / 数值（Data）
  - 等宽（优先 `JetBrains Mono`；没有则沿用当前 `--font-mono`）
  - 所有关键数值应对齐（右对齐/等宽）

## 布局语法（Layout Grammar）

- 所有内容放在“带边框的画布”里（Canvas）
- 页头：标题 + 大写副标题 + 分割线（`1px`）
- 只用严格网格/正交对齐（不做“漂浮感”布局）

## 组件 DNA

- Badge：等宽、描边、最小化（像“状态标签”）
- Button：平面矩形、边框建立层次；hover 只允许“边框/文字”变化
- Input：等宽；结构靠边框；focus 只加 ring（不加 glow）
- Table：禁止斑马纹；用水平线分隔；列对齐要严格

## 图示规则（Diagrams）

- 节点：矩形、实线边框
- 连接：直线或正交折线
- 语义：
  - 实线：真实数据/控制流
  - 虚线：抽象/条件/可选路径

## 首页（Marketing Landing）重设计要点

目标：把当前的“渐变 + 玻璃 + 大圆角”落地为“工程蓝图式主页”，更像产品控制台入口，而不是宣传页。

建议结构（从上到下）：

1. 顶栏（Top Bar）
   - 左：产品名（大写）+ build/version（可选，等宽）
   - 右：语言切换 + 登录入口
2. Hero
   - 标题：简短、强对比
   - 副标题：描述“系统能做什么/不做什么”（写清边界）
3. 主 CTA
   - 单一主按钮：进入控制台（`/media`）
   - 次 CTA：文档/示例（若有）
4. 三列特性（Feature Grid）
   - 每列一个“矩形面板”：标题（大写）+ 2–3 行说明 + 状态标签（Badge）
   - 图标只做辅助（线性 icon），不要彩色块/渐变背景

设计誓言：如果它不能解释系统，就删掉。
