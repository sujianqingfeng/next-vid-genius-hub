import {
	getRenderStatus as getRenderStatusUseCase,
	startCloudRender as startCloudRenderUseCase,
} from './render'
import {
	clearOptimizedTranscription as clearOptimizedTranscriptionUseCase,
	deleteTranslationCue as deleteTranslationCueUseCase,
	optimizeTranscription as optimizeTranscriptionUseCase,
	updateTranslation as updateTranslationUseCase,
} from './subtitle-maintenance'
import { transcribe as transcribeUseCase } from './transcribe'
import { translate as translateUseCase } from './translate'

export const subtitleService = {
	transcribe: transcribeUseCase,
	translate: translateUseCase,
	updateTranslation: updateTranslationUseCase,
	deleteTranslationCue: deleteTranslationCueUseCase,
	startCloudRender: startCloudRenderUseCase,
	getRenderStatus: getRenderStatusUseCase,
	optimizeTranscription: optimizeTranscriptionUseCase,
	clearOptimizedTranscription: clearOptimizedTranscriptionUseCase,
}
