import { z } from 'zod'

const TerminalStatusSchema = z.enum(['completed', 'failed', 'canceled'])
const OutputRefSchema = z
	.object({
		url: z.string().optional(),
		key: z.string().optional(),
	})
	.passthrough()

const OutputsSchema = z
	.object({
		video: OutputRefSchema.optional(),
		audio: OutputRefSchema.optional(),
		audioSource: OutputRefSchema.optional(),
		audioProcessed: OutputRefSchema.optional(),
		metadata: OutputRefSchema.optional(),
		vtt: OutputRefSchema.optional(),
		words: OutputRefSchema.optional(),
	})
	.passthrough()

const ProxyCheckMetadataSchema = z
	.object({
		kind: z.literal('proxy-check'),
	})
	.passthrough()

export const ProxyCheckCallbackSchema = z
	.object({
		schemaVersion: z.number().optional(),
		jobId: z.string().min(1),
		status: TerminalStatusSchema,
		metadata: ProxyCheckMetadataSchema,
	})
	.passthrough()

export const OrchestratorCallbackSchema = z
	.object({
		schemaVersion: z.number().int().min(2),
		jobId: z.string().min(1),
		mediaId: z
			.string()
			.min(1)
			.refine((v) => v !== 'unknown', { message: 'mediaId must be set' }),
		status: TerminalStatusSchema,
		engine: z.string().min(1),
		purpose: z.string().min(1),
		error: z.string().optional(),
		eventId: z.string().min(1),
		eventSeq: z.number().int().min(1),
		eventTs: z.number(),
		metadata: z.unknown().optional(),
		outputs: OutputsSchema.optional(),
		durationMs: z.number().optional(),
	})
	.passthrough()
	.refine(
		(v) =>
			typeof (v as any).outputKey === 'undefined' &&
			typeof (v as any).outputUrl === 'undefined' &&
			typeof (v as any).outputAudioKey === 'undefined' &&
			typeof (v as any).outputMetadataKey === 'undefined',
		{ message: 'v2 must not use legacy top-level output fields' },
	)

export const OrchestratorCallbackV2Schema = OrchestratorCallbackSchema.refine(
	(v) => {
		if (v.status !== 'completed') return true
		const outputs = v.outputs as any
		if (!outputs || typeof outputs !== 'object') return false
		return (
			Boolean(outputs.video?.key || outputs.video?.url) ||
			Boolean(outputs.audio?.key || outputs.audio?.url) ||
			Boolean(outputs.audioSource?.key || outputs.audioSource?.url) ||
			Boolean(outputs.audioProcessed?.key || outputs.audioProcessed?.url) ||
			Boolean(outputs.metadata?.key || outputs.metadata?.url) ||
			Boolean(outputs.vtt?.key || outputs.vtt?.url) ||
			Boolean(outputs.words?.key || outputs.words?.url)
		)
	},
	{ message: 'v2 completed callbacks must include outputs.*' },
)

export function isProxyCheckPayload(raw: unknown): boolean {
	if (!raw || typeof raw !== 'object') return false
	const meta = (raw as any).metadata
	return Boolean(
		meta && typeof meta === 'object' && (meta as any).kind === 'proxy-check',
	)
}
