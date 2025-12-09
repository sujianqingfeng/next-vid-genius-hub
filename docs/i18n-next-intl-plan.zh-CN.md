# 国际化方案（next-intl + App Router）

## 目标与约束

- 默认语言：**中文（zh）**
- 支持切换为：**英文（en）**
- 要求：
  - 不改变现有路由结构（暂时不启用 `/en/...`、`/zh/...` 前缀）
  - 刷新页面 / 新开 Tab 后保留语言选择
  - `<html lang="...">` 与当前语言保持一致
  - 尽量少侵入现有代码结构（集中在 layout / providers / 公共组件）

- 技术方案：**next-intl（App Router 模式，without i18n routing）**

参考文档：`https://next-intl.dev/docs/getting-started/app-router`

---

## 目录结构规划

建议新增以下文件/目录：

```txt
messages/
  en.json
  zh.json

i18n/
  request.ts
```

后续可以按模块拆分：

```txt
messages/
  en/
    common.json
    workspace.json
    media.json
  zh/
    common.json
    workspace.json
    media.json
```

> 初期可先用单一 `en.json` / `zh.json`，随后再拆分。

---

## 步骤一：安装与配置 next-intl 插件

1. 安装依赖：

```bash
pnpm add next-intl
```

2. 修改 `next.config.ts`：

```ts
import type { NextConfig } from 'next'
import { initOpenNextCloudflareForDev } from '@opennextjs/cloudflare'
import createNextIntlPlugin from 'next-intl/plugin'

initOpenNextCloudflareForDev({ environment: 'local', configPath: './wrangler.json' })

const withNextIntl = createNextIntlPlugin()

const nextConfig: NextConfig = {
  experimental: {
    optimizePackageImports: ['lucide-react'],
  },
  images: {
    // ...保留现有配置
  },
  serverExternalPackages: [
    '@remotion/bundler',
    '@remotion/renderer',
    'remotion',
  ],
}

export default withNextIntl(nextConfig)
```

> 保留原有 Cloudflare 初始化逻辑不变，仅在导出时用 `withNextIntl` 包裹 `nextConfig`。

---

## 步骤二：创建多语言文案 messages

1. 新建 `messages/zh.json`（默认中文）：

```json
{
  "Layout": {
    "title": "Next Vid Genius Hub",
    "description": "视频下载与处理平台",
    "nav": {
      "dashboard": "仪表盘",
      "media": "媒体管理",
      "tasks": "任务",
      "points": "积分"
    }
  },
  "Common": {
    "language.zh": "中文",
    "language.en": "英文"
  }
}
```

2. 新建 `messages/en.json`：

```json
{
  "Layout": {
    "title": "Next Vid Genius Hub",
    "description": "Video download and processing platform",
    "nav": {
      "dashboard": "Dashboard",
      "media": "Media",
      "tasks": "Tasks",
      "points": "Points"
    }
  },
  "Common": {
    "language.zh": "Chinese",
    "language.en": "English"
  }
}
```

> 后续在迁移文案时，逐步把现有硬编码中/英文挪到这里。

---

## 步骤三：配置 `i18n/request.ts`（基于 cookie 选择语言）

在项目根新增 `i18n/request.ts`（next-intl 会自动识别）：

```ts
// i18n/request.ts
import { getRequestConfig } from 'next-intl/server'
import { cookies } from 'next/headers'

const SUPPORTED_LOCALES = ['zh', 'en'] as const
type Locale = (typeof SUPPORTED_LOCALES)[number]
const DEFAULT_LOCALE: Locale = 'zh'

function getValidLocale(value?: string | null): Locale {
  if (!value) return DEFAULT_LOCALE
  return SUPPORTED_LOCALES.includes(value as Locale)
    ? (value as Locale)
    : DEFAULT_LOCALE
}

export default getRequestConfig(async () => {
  const store = cookies()
  const localeCookie = store.get('locale')?.value
  const locale = getValidLocale(localeCookie)

  const messages = (await import(`../messages/${locale}.json`)).default

  return {
    locale,
    messages,
  }
})
```

行为说明：

- 每个请求都会执行此函数，从 `cookie.locale` 解析语言；
- 未设置或非法值时回退到 `zh`；
- 根据 `locale` 动态加载对应的 JSON 文案。

---

## 步骤四：在 `app/layout.tsx` 中挂载 `NextIntlClientProvider`

1. 引入 Provider：

```ts
// app/layout.tsx
import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import './globals.css'
import { Toaster } from '~/components/ui/sonner'
import { Providers } from './providers'
import { NextIntlClientProvider } from 'next-intl'
import { cookies } from 'next/headers'
```

2. 动态设置 `<html lang>` 并传入 `locale` / `messages`：

```tsx
export const metadata: Metadata = {
  title: 'Next Vid Genius Hub',
  description: 'Video download and processing platform',
}

const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] })
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] })

async function getLocaleAndMessages() {
  const store = cookies()
  const localeCookie = store.get('locale')?.value || 'zh'
  const locale = ['zh', 'en'].includes(localeCookie) ? localeCookie : 'zh'
  const messages = (await import(`../messages/${locale}.json`)).default
  return { locale, messages }
}

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const { locale, messages } = await getLocaleAndMessages()

  return (
    <html lang={locale} suppressHydrationWarning>
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <NextIntlClientProvider locale={locale} messages={messages}>
          <Providers>
            {children}
            <Toaster richColors position="top-right" />
          </Providers>
        </NextIntlClientProvider>
      </body>
    </html>
  )
}
```

> 说明：  
> - `i18n/request.ts` 已为 next-intl 提供 locale/messages；  
> - 这里再读一次 cookie 是为了控制 `<html lang>` 和首屏 SSR；  
> - 后续可根据需求精简成统一入口。

---

## 步骤五：在组件中使用 `useTranslations` / `getTranslations`

以首页 `app/page.tsx` 为例（示意）：

```tsx
// app/page.tsx
import { useTranslations } from 'next-intl'

export default function HomePage() {
  const t = useTranslations('Layout')

  return (
    <main>
      <h1>{t('title')}</h1>
      {/* 其他内容 */}
    </main>
  )
}
```

在布局或导航组件中：

```tsx
const t = useTranslations('Layout')

<nav>
  <a>{t('nav.dashboard')}</a>
  <a>{t('nav.media')}</a>
  <a>{t('nav.tasks')}</a>
  <a>{t('nav.points')}</a>
</nav>
```

迁移策略：

1. 先把全局布局、导航栏、侧边栏等高频文案迁移到 `messages`；  
2. 再逐步处理各业务页面（`media` / `tasks` / `points` 等）；  
3. 最后迁移 toast、tooltip 这类提示文案。

---

## 步骤六：语言切换组件与 cookie 写入

### 1. Server Action 或 API 写 cookie

方案 A：Server Action（推荐，适配 App Router）

```tsx
// app/(workspace)/_actions/set-locale.ts
'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'

const SUPPORTED_LOCALES = ['zh', 'en'] as const

export async function setLocale(locale: string, redirectTo: string) {
  if (!SUPPORTED_LOCALES.includes(locale as (typeof SUPPORTED_LOCALES)[number])) {
    return
  }

  const store = cookies()
  store.set('locale', locale, {
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
  })

  redirect(redirectTo || '/')
}
```

方案 B：API Route（如果更习惯 API）  
> 可在 `app/api/locale/route.ts` 中写入 cookie 后返回 204，客户端再 `router.refresh()`。

### 2. 客户端语言切换组件

```tsx
// components/business/layout/LanguageSwitcher.tsx
'use client'

import { usePathname } from 'next/navigation'
import { experimental_useFormStatus as useFormStatus } from 'react-dom'
import { setLocale } from '@/app/(workspace)/_actions/set-locale'

export function LanguageSwitcher() {
  const pathname = usePathname()
  const { pending } = useFormStatus()

  async function handleChange(nextLocale: 'zh' | 'en') {
    await setLocale(nextLocale, pathname || '/')
  }

  return (
    <div>
      <button disabled={pending} onClick={() => handleChange('zh')}>
        中文
      </button>
      <button disabled={pending} onClick={() => handleChange('en')}>
        English
      </button>
    </div>
  )
}
```

在布局中使用（如 `app/(workspace)/layout.tsx` 顶部导航引入 `LanguageSwitcher`）：

```tsx
// app/(workspace)/layout.tsx 伪代码
import { LanguageSwitcher } from '~/components/business/layout/LanguageSwitcher'

export default function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <header>
        {/* 其他导航内容 */}
        <LanguageSwitcher />
      </header>
      <main>{children}</main>
    </div>
  )
}
```

---

## 步骤七：测试与验证清单

手动验证：

- [ ] 第一次访问应用，界面为中文（zh）。  
- [ ] 点击语言切换为 English 后，当前页面文本变为英文。  
- [ ] 刷新当前页面，仍然保持英文。  
- [ ] 重新访问其他页面，文本语言与当前选择一致。  
- [ ] `<html lang="...">` 随语言切换为 `zh` / `en`。  
- [ ] 原有功能（主题切换、React Query 请求、Tooltip、Toaster 等）不受影响。

自动化建议（可后续补充）：

- [ ] 为一个示例组件写测试（如 Vitest + Testing Library），断言在不同 messages 下渲染不同文本。  
- [ ] 为 `setLocale` server action 写单元测试，验证 cookie 写入与非法 locale 的处理逻辑。

---

## 迭代建议

1. **第一阶段**  
   - 完成依赖安装、`next-intl` 插件接入、`i18n/request.ts` 和 `RootLayout` 集成；  
   - 实现 `LanguageSwitcher` 与 cookie 持久化；  
   - 迁移布局/导航等核心文案。

2. **第二阶段**  
   - 分模块迁移所有业务页面文案；  
   - 引入日期/数字格式化（如后续需要）；  
   - 对 messages 做 TypeScript 类型增强，避免拼错 key。

3. **第三阶段（可选）**  
   - 若 SEO / 多语言 URL 需求提升，可考虑切换到 next-intl 的 “with i18n routing” 模式，使用 `/[locale]/...` 路由结构，同时调整 `next.config.ts` i18n 配置与路由结构。

---

