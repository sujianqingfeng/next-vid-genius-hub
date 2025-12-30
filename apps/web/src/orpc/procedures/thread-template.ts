import { os } from '@orpc/server'
import { and, asc, desc, eq, inArray } from 'drizzle-orm'
import { z } from 'zod'
import type { RequestContext } from '~/lib/auth/types'
import { getDb, schema } from '~/lib/db'
import { createId } from '~/lib/utils/id'
import {
	THREAD_TEMPLATE_COMPILE_VERSION,
	normalizeThreadTemplateConfig,
} from '@app/remotion-project/thread-template-config'
import { getThreadTemplate } from '@app/remotion-project/thread-templates'

function isPlainObject(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function stableJsonValue(value: unknown, depth = 0): unknown {
	if (depth > 50) return null
	if (Array.isArray(value))
		return value.map((v) => stableJsonValue(v, depth + 1))
	if (isPlainObject(value)) {
		const out: Record<string, unknown> = {}
		for (const key of Object.keys(value).sort()) {
			out[key] = stableJsonValue(value[key], depth + 1)
		}
		return out
	}
	return value
}

function stableStringify(value: unknown): string | null {
	try {
		return JSON.stringify(stableJsonValue(value))
	} catch {
		return null
	}
}

async function sha256Hex(input: string): Promise<string | null> {
	try {
		const subtle = (globalThis as any)?.crypto?.subtle
		if (!subtle) return null
		const buf = await subtle.digest('SHA-256', new TextEncoder().encode(input))
		return [...new Uint8Array(buf)]
			.map((b) => b.toString(16).padStart(2, '0'))
			.join('')
	} catch {
		return null
	}
}

function assertV1Config(config: unknown) {
	if (!isPlainObject(config) || (config as any).version !== 1) {
		throw new Error('templateConfig must include "version": 1 (v1 only)')
	}
}

const MAX_CONFIG_BYTES = 64 * 1024

function assertJsonSize(value: unknown, label: string) {
	const json = JSON.stringify(value)
	if (json.length > MAX_CONFIG_BYTES) {
		throw new Error(
			`${label} too large (${json.length} bytes > ${MAX_CONFIG_BYTES} bytes)`,
		)
	}
}

export const list = os.handler(async ({ context }) => {
	const ctx = context as RequestContext
	const userId = ctx.auth.user!.id
	const db = await getDb()

	const libraries = await db
		.select()
		.from(schema.threadTemplateLibrary)
		.where(eq(schema.threadTemplateLibrary.userId, userId))
		.orderBy(desc(schema.threadTemplateLibrary.updatedAt))
		.limit(50)

	const libraryIds = libraries.map((x) => String(x.id))
	const latestByLibraryId = new Map<string, any>()

	if (libraryIds.length > 0) {
		const versions = await db
			.select()
			.from(schema.threadTemplateVersions)
			.where(
				and(
					eq(schema.threadTemplateVersions.userId, userId),
					inArray(schema.threadTemplateVersions.libraryId, libraryIds),
				),
			)
			.orderBy(
				asc(schema.threadTemplateVersions.libraryId),
				desc(schema.threadTemplateVersions.version),
			)

		for (const v of versions) {
			const libId = String(v.libraryId)
			if (latestByLibraryId.has(libId)) continue
			latestByLibraryId.set(libId, v)
		}
	}

	return {
		libraries: libraries.map((l) => {
			const latest = latestByLibraryId.get(String(l.id)) ?? null
			return {
				...l,
				latestVersion: latest ? Number(latest.version) : null,
				latestVersionId: latest ? String(latest.id) : null,
				latestCreatedAt: latest?.createdAt ?? null,
			}
		}),
	}
})

export const versions = os
	.input(
		z.object({
			libraryId: z.string().min(1),
			limit: z.number().int().min(1).max(100).optional().default(30),
		}),
	)
	.handler(async ({ input, context }) => {
		const ctx = context as RequestContext
		const userId = ctx.auth.user!.id
		const db = await getDb()

		const lib = await db.query.threadTemplateLibrary.findFirst({
			where: and(
				eq(schema.threadTemplateLibrary.userId, userId),
				eq(schema.threadTemplateLibrary.id, input.libraryId),
			),
		})
		if (!lib) throw new Error('Template library not found')

		const rows = await db
			.select()
			.from(schema.threadTemplateVersions)
			.where(
				and(
					eq(schema.threadTemplateVersions.userId, userId),
					eq(schema.threadTemplateVersions.libraryId, input.libraryId),
				),
			)
			.orderBy(desc(schema.threadTemplateVersions.version))
			.limit(input.limit)

		return { library: lib, versions: rows }
	})

export const create = os
	.input(
		z.object({
			name: z.string().min(1).max(80),
			templateId: z.string().min(1),
			templateConfig: z.unknown(),
			description: z.string().max(500).optional(),
			note: z.string().max(200).optional(),
			sourceThreadId: z.string().min(1).optional(),
		}),
	)
	.handler(async ({ input, context }) => {
		const ctx = context as RequestContext
		const userId = ctx.auth.user!.id
		const db = await getDb()

		if (!getThreadTemplate(input.templateId)) {
			throw new Error(`Unknown templateId: ${input.templateId}`)
		}

		assertV1Config(input.templateConfig)
		assertJsonSize(input.templateConfig, 'templateConfig')

		const templateConfigResolved = normalizeThreadTemplateConfig(
			input.templateConfig,
		)
		assertJsonSize(templateConfigResolved, 'templateConfigResolved')

		const templateConfigJson = stableStringify(templateConfigResolved)
		const templateConfigHash = templateConfigJson
			? await sha256Hex(templateConfigJson)
			: null

		const compileVersion =
			getThreadTemplate(input.templateId)?.compileVersion ??
			THREAD_TEMPLATE_COMPILE_VERSION

		const libraryId = createId()
		const versionId = createId()

		await db.insert(schema.threadTemplateLibrary).values({
			id: libraryId,
			userId,
			name: input.name,
			templateId: input.templateId,
			description: input.description ?? null,
			updatedAt: new Date(),
		})

		await db.insert(schema.threadTemplateVersions).values({
			id: versionId,
			userId,
			libraryId,
			version: 1,
			note: input.note ?? null,
			sourceThreadId: input.sourceThreadId ?? null,
			templateConfig: input.templateConfig,
			templateConfigResolved,
			templateConfigHash,
			compileVersion,
		})

		return {
			libraryId,
			versionId,
			version: 1,
			templateConfigHash,
			compileVersion,
		}
	})

export const addVersion = os
	.input(
		z.object({
			libraryId: z.string().min(1),
			templateConfig: z.unknown(),
			note: z.string().max(200).optional(),
			sourceThreadId: z.string().min(1).optional(),
		}),
	)
	.handler(async ({ input, context }) => {
		const ctx = context as RequestContext
		const userId = ctx.auth.user!.id
		const db = await getDb()

		const lib = await db.query.threadTemplateLibrary.findFirst({
			where: and(
				eq(schema.threadTemplateLibrary.userId, userId),
				eq(schema.threadTemplateLibrary.id, input.libraryId),
			),
		})
		if (!lib) throw new Error('Template library not found')

		assertV1Config(input.templateConfig)
		assertJsonSize(input.templateConfig, 'templateConfig')

		const templateConfigResolved = normalizeThreadTemplateConfig(
			input.templateConfig,
		)
		assertJsonSize(templateConfigResolved, 'templateConfigResolved')

		const templateConfigJson = stableStringify(templateConfigResolved)
		const templateConfigHash = templateConfigJson
			? await sha256Hex(templateConfigJson)
			: null

		const compileVersion =
			getThreadTemplate(String(lib.templateId))?.compileVersion ??
			THREAD_TEMPLATE_COMPILE_VERSION

		const lastRow = await db
			.select()
			.from(schema.threadTemplateVersions)
			.where(
				and(
					eq(schema.threadTemplateVersions.userId, userId),
					eq(schema.threadTemplateVersions.libraryId, input.libraryId),
				),
			)
			.orderBy(desc(schema.threadTemplateVersions.version))
			.limit(1)
		const last = lastRow[0] ?? null

		const nextVersion = (last ? Number(last.version) : 0) + 1
		const versionId = createId()

		await db.insert(schema.threadTemplateVersions).values({
			id: versionId,
			userId,
			libraryId: input.libraryId,
			version: nextVersion,
			note: input.note ?? null,
			sourceThreadId: input.sourceThreadId ?? null,
			templateConfig: input.templateConfig,
			templateConfigResolved,
			templateConfigHash,
			compileVersion,
		})

		await db
			.update(schema.threadTemplateLibrary)
			.set({ updatedAt: new Date() })
			.where(
				and(
					eq(schema.threadTemplateLibrary.userId, userId),
					eq(schema.threadTemplateLibrary.id, input.libraryId),
				),
			)

		return {
			versionId,
			version: nextVersion,
			templateConfigHash,
			compileVersion,
		}
	})

export const rollback = os
	.input(
		z.object({
			versionId: z.string().min(1),
			note: z.string().max(200).optional(),
		}),
	)
	.handler(async ({ input, context }) => {
		const ctx = context as RequestContext
		const userId = ctx.auth.user!.id
		const db = await getDb()

		const from = await db.query.threadTemplateVersions.findFirst({
			where: and(
				eq(schema.threadTemplateVersions.userId, userId),
				eq(schema.threadTemplateVersions.id, input.versionId),
			),
		})
		if (!from) throw new Error('Template version not found')

		const lastRow = await db
			.select()
			.from(schema.threadTemplateVersions)
			.where(
				and(
					eq(schema.threadTemplateVersions.userId, userId),
					eq(schema.threadTemplateVersions.libraryId, String(from.libraryId)),
				),
			)
			.orderBy(desc(schema.threadTemplateVersions.version))
			.limit(1)
		const last = lastRow[0] ?? null

		const nextVersion = (last ? Number(last.version) : 0) + 1
		const versionId = createId()
		const note =
			input.note ?? `Rollback to v${Number(from.version)} (${String(from.id)})`

		await db.insert(schema.threadTemplateVersions).values({
			id: versionId,
			userId,
			libraryId: String(from.libraryId),
			version: nextVersion,
			note,
			sourceThreadId: from.sourceThreadId ?? null,
			templateConfig: from.templateConfig ?? null,
			templateConfigResolved: from.templateConfigResolved ?? null,
			templateConfigHash: from.templateConfigHash ?? null,
			compileVersion:
				Number(from.compileVersion) || THREAD_TEMPLATE_COMPILE_VERSION,
		})

		await db
			.update(schema.threadTemplateLibrary)
			.set({ updatedAt: new Date() })
			.where(
				and(
					eq(schema.threadTemplateLibrary.userId, userId),
					eq(schema.threadTemplateLibrary.id, String(from.libraryId)),
				),
			)

		return { versionId, version: nextVersion }
	})

export const applyToThread = os
	.input(
		z.object({
			threadId: z.string().min(1),
			versionId: z.string().min(1),
		}),
	)
	.handler(async ({ input, context }) => {
		const ctx = context as RequestContext
		const userId = ctx.auth.user!.id
		const db = await getDb()

		const version = await db.query.threadTemplateVersions.findFirst({
			where: and(
				eq(schema.threadTemplateVersions.userId, userId),
				eq(schema.threadTemplateVersions.id, input.versionId),
			),
		})
		if (!version) throw new Error('Template version not found')

		const lib = await db.query.threadTemplateLibrary.findFirst({
			where: and(
				eq(schema.threadTemplateLibrary.userId, userId),
				eq(schema.threadTemplateLibrary.id, String(version.libraryId)),
			),
		})
		if (!lib) throw new Error('Template library not found')

		await db
			.update(schema.threads)
			.set({
				templateId: String(lib.templateId),
				templateConfig: version.templateConfig ?? null,
				updatedAt: new Date(),
			})
			.where(
				and(
					eq(schema.threads.userId, userId),
					eq(schema.threads.id, input.threadId),
				),
			)

		return { ok: true }
	})

export const update = os
	.input(
		z.object({
			libraryId: z.string().min(1),
			name: z.string().min(1).max(80),
			description: z.string().max(500).nullable().optional(),
		}),
	)
	.handler(async ({ input, context }) => {
		const ctx = context as RequestContext
		const userId = ctx.auth.user!.id
		const db = await getDb()

		const lib = await db.query.threadTemplateLibrary.findFirst({
			where: and(
				eq(schema.threadTemplateLibrary.userId, userId),
				eq(schema.threadTemplateLibrary.id, input.libraryId),
			),
		})
		if (!lib) throw new Error('Template library not found')

		const name = input.name.trim()
		if (!name) throw new Error('name is required')

		const conflicts = await db
			.select()
			.from(schema.threadTemplateLibrary)
			.where(
				and(
					eq(schema.threadTemplateLibrary.userId, userId),
					eq(schema.threadTemplateLibrary.name, name),
				),
			)
			.limit(1)
		const conflict = conflicts[0] ?? null
		if (conflict && String(conflict.id) !== String(input.libraryId)) {
			throw new Error('A template with the same name already exists')
		}

		await db
			.update(schema.threadTemplateLibrary)
			.set({
				name,
				description:
					input.description === undefined ? lib.description : input.description,
				updatedAt: new Date(),
			})
			.where(
				and(
					eq(schema.threadTemplateLibrary.userId, userId),
					eq(schema.threadTemplateLibrary.id, input.libraryId),
				),
			)

		return { ok: true }
	})

export const deleteById = os
	.input(z.object({ libraryId: z.string().min(1) }))
	.handler(async ({ input, context }) => {
		const ctx = context as RequestContext
		const userId = ctx.auth.user!.id
		const db = await getDb()

		const lib = await db.query.threadTemplateLibrary.findFirst({
			where: and(
				eq(schema.threadTemplateLibrary.userId, userId),
				eq(schema.threadTemplateLibrary.id, input.libraryId),
			),
		})
		if (!lib) throw new Error('Template library not found')

		await db
			.delete(schema.threadTemplateVersions)
			.where(
				and(
					eq(schema.threadTemplateVersions.userId, userId),
					eq(schema.threadTemplateVersions.libraryId, input.libraryId),
				),
			)

		await db
			.delete(schema.threadTemplateLibrary)
			.where(
				and(
					eq(schema.threadTemplateLibrary.userId, userId),
					eq(schema.threadTemplateLibrary.id, input.libraryId),
				),
			)

		return { ok: true }
	})
