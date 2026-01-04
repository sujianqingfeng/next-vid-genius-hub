import type { ComponentType } from 'react'
import { ThreadForumVideo } from '../ThreadForumVideo'
import type { ThreadTemplateConfigV1, ThreadVideoInputProps } from '../types'
import {
	DEFAULT_THREAD_TEMPLATE_CONFIG,
	THREAD_TEMPLATE_COMPILE_VERSION,
} from '../thread-template-config'

export type ThreadTemplateId = 'thread-forum'

export interface ThreadTemplateDef {
	id: ThreadTemplateId
	name: string
	description?: string
	component: ComponentType<ThreadVideoInputProps>
	compositionId: 'ThreadForumVideo'
	compositionWidth: number
	compositionHeight: number
	defaultConfig: ThreadTemplateConfigV1
	compileVersion: number
}

export const THREAD_TEMPLATES: Record<ThreadTemplateId, ThreadTemplateDef> = {
	'thread-forum': {
		id: 'thread-forum',
		name: '论坛模板',
		description: '一层回帖 + 图文/视频封面卡片（MVP）',
		component: ThreadForumVideo,
		compositionId: 'ThreadForumVideo',
		compositionWidth: 1920,
		compositionHeight: 1080,
		defaultConfig: DEFAULT_THREAD_TEMPLATE_CONFIG,
		compileVersion: THREAD_TEMPLATE_COMPILE_VERSION,
	},
}

export const DEFAULT_THREAD_TEMPLATE_ID: ThreadTemplateId = 'thread-forum'

export function getThreadTemplate(id?: string | null): ThreadTemplateDef {
	if (!id || !(id in THREAD_TEMPLATES))
		return THREAD_TEMPLATES[DEFAULT_THREAD_TEMPLATE_ID]
	return THREAD_TEMPLATES[id as ThreadTemplateId]
}

export function listThreadTemplates(): Array<{ id: ThreadTemplateId; name: string }> {
	return Object.values(THREAD_TEMPLATES).map((t) => ({ id: t.id, name: t.name }))
}
