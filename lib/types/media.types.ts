export interface MediaItem {
  id: string;
  url: string;
  source: "youtube" | "tiktok";
  title: string;
  translatedTitle?: string | null;
  author?: string | null;
  thumbnail?: string | null;
  duration?: number | null;
  viewCount?: number | null;
  likeCount?: number | null;
  commentCount?: number | null;
  filePath?: string | null;
  audioFilePath?: string | null;
  rawMetadataPath?: string | null;
  transcription?: string | null;
  optimizedTranscription?: string | null;
  transcriptionWords?: Array<{
    word: string;
    start: number;
    end: number;
  }> | null;
  translation?: string | null;
  videoWithSubtitlesPath?: string | null;
  videoWithInfoPath?: string | null;
  comments?: import("~/lib/media/types").Comment[] | null;
  commentsDownloadedAt?: Date | null;
  downloadBackend?: "local" | "cloud";
  downloadJobId?: string | null;
  downloadStatus?:
    | "queued"
    | "fetching_metadata"
    | "preparing"
    | "downloading"
    | "extracting_audio"
    | "uploading"
    | "completed"
    | "failed"
    | "canceled"
    | null;
  downloadError?: string | null;
  remoteVideoKey?: string | null;
  remoteAudioKey?: string | null;
  remoteMetadataKey?: string | null;
  downloadQueuedAt?: Date | null;
  downloadCompletedAt?: Date | null;
  rawMetadataDownloadedAt?: Date | null;
  quality: "720p" | "1080p";
  createdAt: Date;
}
