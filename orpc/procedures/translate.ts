import { os } from '@orpc/server'
import { z } from 'zod'
import { AIModelIds, models } from '~/lib/ai/models'

const translateInput = z.object({
	text: z.string(),
	model: z.enum(AIModelIds),
	bilingual: z.boolean().optional().default(true),
})

const translateHandler = os.input(translateInput).handler(async ({ input }) => {
	// Here you can add your translation logic using the selected AI model.
	// For now, we'll just return a placeholder.
	const { text, model, bilingual } = input
	const selectedModel = models.find((m) => m.id === model)
	const translatedText = `[Translated with ${selectedModel?.modelName}] ${text}`
	const bilingualText = text
		.split('\n')
		.map((line, i) => `${line}\n${translatedText.split('\n')[i] || ''}`)
		.join('\n')
	return {
		translation: bilingual ? bilingualText : translatedText,
	}
})

export const translate = os.router({
	translate: translateHandler,
})
