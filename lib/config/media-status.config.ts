// Media status labels and mappings consolidated under config

export type DbDownloadStatus =
  | 'queued'
  | 'fetching_metadata'
  | 'preparing'
  | 'downloading'
  | 'extracting_audio'
  | 'uploading'
  | 'completed'
  | 'failed'
  | 'canceled'

export type OrchestratorStatus =
  | 'queued'
  | 'fetching_metadata'
  | 'preparing'
  | 'running'
  | 'uploading'
  | 'completed'
  | 'failed'
  | 'canceled'

export type OrchestratorPhase =
  | 'fetching_metadata'
  | 'preparing'
  | 'running'
  | 'uploading'

export const STATUS_LABELS: Record<DbDownloadStatus | OrchestratorStatus, string> = {
  queued: 'Queued',
  fetching_metadata: 'Fetching metadata',
  preparing: 'Preparing',
  running: 'Processing',
  downloading: 'Downloading',
  extracting_audio: 'Extracting audio',
  uploading: 'Uploading',
  completed: 'Completed',
  failed: 'Failed',
  canceled: 'Canceled',
}

export const PHASE_LABELS: Record<OrchestratorPhase, string> = {
  fetching_metadata: 'Fetching metadata',
  preparing: 'Preparing',
  running: 'Processing',
  uploading: 'Uploading artifacts',
}

const PHASE_TO_DB: Record<OrchestratorPhase, DbDownloadStatus> = {
  fetching_metadata: 'fetching_metadata',
  preparing: 'preparing',
  running: 'downloading',
  uploading: 'uploading',
}

export function mapOrchestratorToDbStatus(
  status: OrchestratorStatus,
  phase?: OrchestratorPhase,
): DbDownloadStatus {
  switch (status) {
    case 'queued':
      return 'queued'
    case 'fetching_metadata':
      return 'fetching_metadata'
    case 'preparing':
      return 'preparing'
    case 'uploading':
      return 'uploading'
    case 'running':
      return phase ? PHASE_TO_DB[phase] : 'downloading'
    case 'completed':
      return 'completed'
    case 'failed':
      return 'failed'
    case 'canceled':
      return 'canceled'
    default:
      return 'downloading'
  }
}

