import { z } from 'zod'
import { generateObject } from './chat'
import type { ChatModelId } from './models'

export interface TitleSourceComment {
  content?: string
  translatedContent?: string
  likes?: number
  replyCount?: number
  moderation?: {
    flagged?: boolean
    severity?: 'low' | 'medium' | 'high'
  }
}

export interface GeneratePublishTitlesOptions {
  model?: ChatModelId
  title?: string | null
  translatedTitle?: string | null
  transcript?: string | null | undefined
  comments?: TitleSourceComment[] | null | undefined
  count?: number // desired candidates, default 5
  maxTranscriptChars?: number // clamp to control token cost
  maxComments?: number // number of comments to include in context
}

const titlesSchema = z
  .array(z.string().min(4).max(120))
  .min(3)
  .max(8)

function clamp(str: string, max = 1200) {
  if (!str) return ''
  if (str.length <= max) return str
  return str.slice(0, max)
}

function pickLanguageHint(_title?: string | null, _translatedTitle?: string | null): 'zh' {
  // 受众默认是国内用户：强制中文输出
  return 'zh'
}

function selectComments(comments: GeneratePublishTitlesOptions['comments'], max = 30) {
  const list = Array.isArray(comments) ? comments : []
  // 过滤高风险已标记评论（如存在审核结果）
  const filtered = list.filter((c) => {
    const flagged = Boolean(c?.moderation?.flagged)
    const sev = c?.moderation?.severity
    return !(flagged && (sev === 'high' || sev === 'medium'))
  })
  const sorted = filtered
    .slice()
    .sort((a, b) => (b.likes || 0) + (b.replyCount || 0) - ((a.likes || 0) + (a.replyCount || 0)))
    .slice(0, Math.max(1, Math.min(max, 100)))
  return sorted
    .map((c) => (c.translatedContent || c.content || '').trim())
    .filter(Boolean)
}

export async function generatePublishTitles(opts: GeneratePublishTitlesOptions) {
  const {
    model = 'openai/gpt-4.1-mini' as ChatModelId,
    title,
    translatedTitle,
    transcript,
    comments,
    count = 5,
    maxTranscriptChars = 2000,
    maxComments = 30,
  } = opts

  const transcriptText = clamp(transcript || '', maxTranscriptChars)
  const commentTexts = selectComments(comments, maxComments)
  const lang = pickLanguageHint(title, translatedTitle)

  const system = [
    '你是资深短视频编辑，面向中国大陆短视频平台（如抖音/快手/B站）的用户，基于素材生成高点击率且不夸大的发布标题。',
    '语言与本土化：输出为自然、口语化的简体中文；外网评论中的俚语/梗需意译为国内常用表达；品牌/人名/型号等专有名可保留英文或常见音译。',
    '信息取舍：优先吸收高赞/高回复评论中的“冲突/反转/收益/悬念”线索，合并共识点，避免逐字长句堆砌；如评论含攻击/仇恨/涉政/违规内容，忽略该评论。',
    '合规与禁用：避免夸张与虚假承诺；不使用标题党词（如：震惊、颠覆、吊打、全网最、血亏、稳赚、稳赚不赔、封神、保本、爆赚、必看、后悔、史上最强 等）。',
    '多样性：输出 3–5 个风格各异的标题，至少覆盖“利益点陈述/悬念问句/反转对比/数字锚点”中的多种结构。',
    '格式：严格仅输出 JSON 数组（不包含额外文本、Markdown 或注释）。',
  ].join('\n')

  const parts: string[] = []
  if (title) parts.push(`原标题: ${title}`)
  if (translatedTitle) parts.push(`译题(可选): ${translatedTitle}`)
  if (transcriptText) parts.push(`字幕摘要: ${transcriptText}`)
  if (commentTexts.length > 0) parts.push(`高赞评论:\n- ${commentTexts.join('\n- ')}`)
  if (parts.length === 0) parts.push('无可用上下文，仅基于标题语气生成。')

  const instructions = [
    `目标候选数: ${Math.min(Math.max(count, 3), 5)}`,
    `输出语言: ${lang}`,
    '长度：每条 18–60 个中文字符（不宜过长）。',
    '风格提示：优先突出收益/结果、制造适度悬念、强调反转或对比、必要时使用数字增强确定性。',
    '输出格式示例: ["标题A","标题B","标题C"]',
  ].join('\n')

  const prompt = [instructions, '--- 素材 ---', parts.join('\n\n')].join('\n\n')

  const { object } = await generateObject({
    model,
    system,
    prompt,
    schema: titlesSchema,
  })

  // Zod 再校验 + 去重/裁剪
  const parsed = titlesSchema.parse(object)
  const uniq = Array.from(new Set(parsed.map((s) => s.trim()).filter(Boolean)))
  return uniq.slice(0, Math.min(Math.max(count, 3), 5))
}
