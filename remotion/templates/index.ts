import type { ComponentType } from 'react'
import { CommentsVideo } from '../CommentsVideo'
import type { CommentVideoInputProps } from '../types'
import { CommentsVideoVertical } from '../CommentsVideoVertical'

// 模板 ID 类型
export type RemotionTemplateId = 'comments-default' | 'comments-vertical'

// 模板定义
export interface RemotionTemplateDef {
  id: RemotionTemplateId
  name: string
  description?: string
  // 目前评论视频模板统一使用 CommentVideoInputProps
  component: ComponentType<CommentVideoInputProps>
  compositionWidth: number
  compositionHeight: number
}

// 模板注册表（可在此扩展更多模板）
export const TEMPLATES: Record<RemotionTemplateId, RemotionTemplateDef> = {
  'comments-default': {
    id: 'comments-default',
    name: '默认模板',
    description: '标准评论视频模板',
    component: CommentsVideo,
    compositionWidth: 1920,
    compositionHeight: 1080,
  },
  'comments-vertical': {
    id: 'comments-vertical',
    name: '竖屏源-横屏模板',
    description: '封面不变；横屏画布，左竖屏视频，右侧评论',
    component: CommentsVideoVertical,
    compositionWidth: 1920,
    compositionHeight: 1080,
  },
}

export const DEFAULT_TEMPLATE_ID: RemotionTemplateId = 'comments-default'

export function getTemplate(id?: string | null): RemotionTemplateDef {
  if (!id || !(id in TEMPLATES)) return TEMPLATES[DEFAULT_TEMPLATE_ID]
  return TEMPLATES[id as RemotionTemplateId]
}

export function listTemplates(): Array<{ id: RemotionTemplateId; name: string }>
{
  return Object.values(TEMPLATES).map((t) => ({ id: t.id, name: t.name }))
}
