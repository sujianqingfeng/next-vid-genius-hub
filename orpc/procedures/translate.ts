import { os } from '@orpc/server'
import { z } from 'zod'
import { AIModelIds, generateText } from '~/lib/ai'

const translateInput = z.object({
	text: z.string(),
	model: z.enum(AIModelIds),
	bilingual: z.boolean().optional().default(true),
})

const translateHandler = os.input(translateInput).handler(async ({ input }) => {
	const { text, model, bilingual } = input

	const bilingualPrompt = `You are a professional translator. Your task is to translate the text content of a VTT file from English to Chinese.
You will be given the content of a VTT file.
You need to add the Chinese translation under each English sentence.
Do not translate timestamps or other metadata.
For each text segment, the original English text should be on one line, and the Chinese translation should be on the following line.
For example:
Original:
- Hello, world!

Translated:
- Hello, world!
- 你好，世界！`

	const translateOnlyPrompt = `You are a professional translator. Your task is to translate the text content of a VTT file from English to Chinese.
You will be given the content of a VTT file.
You need to translate only the text content and keep the VTT format intact.
For example:
Original:
- Hello, world!

Translated:
- 你好，世界！`

	const systemPrompt = bilingual ? bilingualPrompt : translateOnlyPrompt

	const { text: translatedText } = await generateText({
		model,
		system: systemPrompt,
		prompt: text,
	})

	return {
		translation: translatedText,
	}
})

export const translate = os.router({
	translate: translateHandler,
})
