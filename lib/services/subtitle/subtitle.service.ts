import { transcribe as transcribeUseCase } from './transcribe.service'
import { translate as translateUseCase } from './translate.service'
import { render as renderUseCase, startCloudRender as startCloudRenderUseCase, getRenderStatus as getRenderStatusUseCase } from './render.service'
import { updateTranslation as updateTranslationUseCase, deleteTranslationCue as deleteTranslationCueUseCase, optimizeTranscription as optimizeTranscriptionUseCase, clearOptimizedTranscription as clearOptimizedTranscriptionUseCase } from './maintenance.service'

export const subtitleService = {
  transcribe: transcribeUseCase,
  translate: translateUseCase,
  render: renderUseCase,
  updateTranslation: updateTranslationUseCase,
  deleteTranslationCue: deleteTranslationCueUseCase,
  startCloudRender: startCloudRenderUseCase,
  getRenderStatus: getRenderStatusUseCase,
  optimizeTranscription: optimizeTranscriptionUseCase,
  clearOptimizedTranscription: clearOptimizedTranscriptionUseCase,
}

