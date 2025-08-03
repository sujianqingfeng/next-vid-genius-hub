import { generateText } from './chat'
import { AIModelId } from './models'

export async function translateText(text: string, modelId: AIModelId) {
	const result = await generateText({
		model: modelId,
		system:
			"You are a professional translator. And you must translate the user's input into Chinese.",
		prompt: text,
	})

	return result.text
}
