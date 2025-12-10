import { transcribe as transcribeUseCase } from './transcribe'
import { translate as translateUseCase } from './translate'
import { startCloudRender as startCloudRenderUseCase, getRenderStatus as getRenderStatusUseCase } from './render'
import { updateTranslation as updateTranslationUseCase, deleteTranslationCue as deleteTranslationCueUseCase, optimizeTranscription as optimizeTranscriptionUseCase, clearOptimizedTranscription as clearOptimizedTranscriptionUseCase } from './subtitle-maintenance'

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
