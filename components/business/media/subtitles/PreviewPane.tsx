"use client"

import { useEffect, useMemo, useRef, useState } from 'react'
import { Badge } from '~/components/ui/badge'
import { Video, Film } from 'lucide-react'
import type { SubtitleRenderConfig } from '~/lib/subtitle/types'
import { VideoPreview } from './VideoPreview/VideoPreview'
import { STATUS_LABELS } from '~/lib/config/media-status'
import { parseVttCues } from '~/lib/subtitle/utils/vtt'
import { parseVttTimestamp } from '~/lib/subtitle/utils/time'

interface PreviewPaneProps {
  mediaId: string
  translation?: string | null
  config: SubtitleRenderConfig
  hasRenderedVideo: boolean
  thumbnail?: string
  cacheBuster?: number
  // Rendering state hints
  isRendering?: boolean
  cloudStatus?: { status?: string; progress?: number } | null
  onDurationChange?: (duration: number) => void
  onCurrentTimeChange?: (time: number) => void
  onVideoRefChange?: (ref: HTMLVideoElement | null) => void
}

export function PreviewPane(props: PreviewPaneProps) {
  const {
    mediaId,
    translation,
    config,
    hasRenderedVideo,
    thumbnail,
    cacheBuster,
    isRendering,
    cloudStatus,
    onDurationChange,
    onCurrentTimeChange,
    onVideoRefChange,
  } = props

  const effectiveMode: 'overlay' | 'rendered' = hasRenderedVideo ? 'rendered' : 'overlay'

  const renderedUrlBase = `/api/media/${mediaId}/rendered`
  const renderedSrc = cacheBuster ? `${renderedUrlBase}?v=${cacheBuster}` : renderedUrlBase

  const statusLabel = useMemo(() => {
    const s = cloudStatus?.status
    if (!s) return isRendering ? 'Rendering…' : null
    return s in STATUS_LABELS ? STATUS_LABELS[s as keyof typeof STATUS_LABELS] : s
  }, [cloudStatus?.status, isRendering])

  const progressPct = typeof cloudStatus?.progress === 'number' ? Math.round((cloudStatus?.progress ?? 0) * 100) : undefined

  const cues = useMemo(() => (translation ? parseVttCues(translation) : []), [translation])

  const renderedRef = useRef<HTMLVideoElement | null>(null)
  const overlayRef = useRef<HTMLVideoElement | null>(null)
  const [renderedVideoEl, setRenderedVideoEl] = useState<HTMLVideoElement | null>(null)
  const [overlayVideoEl, setOverlayVideoEl] = useState<HTMLVideoElement | null>(null)

  const handleJump = (startTs: string) => {
    const t = parseVttTimestamp(startTs)
    const el = effectiveMode === 'rendered' ? renderedRef.current : overlayRef.current
    if (el && !Number.isNaN(t)) {
      el.currentTime = t
      // optional: auto play to provide immediate feedback
      el.play?.()
    }
  }

  useEffect(() => {
    if (effectiveMode === 'rendered') {
      onVideoRefChange?.(renderedVideoEl ?? null)
    } else {
      onVideoRefChange?.(overlayVideoEl ?? null)
    }
  }, [effectiveMode, onVideoRefChange, renderedVideoEl, overlayVideoEl])

  useEffect(() => {
    if (effectiveMode !== 'rendered' || !renderedVideoEl) return

    const handleTimeUpdate = () => {
      if (typeof renderedVideoEl.currentTime === 'number') {
        onCurrentTimeChange?.(renderedVideoEl.currentTime)
      }
    }

    const handleLoaded = () => {
      if (Number.isFinite(renderedVideoEl.duration) && renderedVideoEl.duration > 0) {
        onDurationChange?.(renderedVideoEl.duration)
      }
    }

    renderedVideoEl.addEventListener('timeupdate', handleTimeUpdate)
    renderedVideoEl.addEventListener('loadedmetadata', handleLoaded)

    handleLoaded()

    return () => {
      renderedVideoEl.removeEventListener('timeupdate', handleTimeUpdate)
      renderedVideoEl.removeEventListener('loadedmetadata', handleLoaded)
    }
  }, [effectiveMode, renderedVideoEl, onCurrentTimeChange, onDurationChange])

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Video className="h-5 w-5" />
          <h3 className="text-lg font-semibold">Preview</h3>
          {hasRenderedVideo && <Badge variant="secondary">Rendered</Badge>}
        </div>
        {(isRendering || cloudStatus?.status) && (
          <div className="hidden sm:flex items-center gap-2 text-xs text-muted-foreground">
            <Film className="h-4 w-4" />
            <span>{statusLabel ?? 'Rendering…'}</span>
            {typeof progressPct === 'number' && <span className="tabular-nums">• {progressPct}%</span>}
          </div>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* 左侧：视频 */}
        <div className="lg:col-span-2 w-full rounded-lg border bg-black overflow-hidden" style={{ minHeight: '300px', maxHeight: '80vh' }}>
          {effectiveMode === 'rendered' ? (
            <video
              ref={(el) => {
                renderedRef.current = el
                setRenderedVideoEl(el)
                if (effectiveMode === 'rendered') {
                  onVideoRefChange?.(el)
                }
              }}
              controls
              preload="metadata"
              className="w-full h-full object-contain"
              poster={thumbnail || undefined}
              crossOrigin="anonymous"
            >
              <source src={renderedSrc} type="video/mp4" />
              Your browser does not support the video tag.
            </video>
          ) : (
            <VideoPreview
              mediaId={mediaId}
              translation={translation ?? undefined}
              config={config}
              isRendering={isRendering}
              onVideoRef={(ref) => {
                overlayRef.current = ref
                setOverlayVideoEl(ref)
                onVideoRefChange?.(ref)
              }}
              onTimeUpdate={onCurrentTimeChange}
              onDurationChange={onDurationChange}
            />
          )}
        </div>

        {/* 右侧：字幕列表 */}
        <div className="flex flex-col rounded-xl border bg-card shadow-sm overflow-hidden max-h-[600px]">
          <div className="flex-shrink-0 px-4 py-3 border-b bg-muted/30">
            <h3 className="text-sm font-semibold mb-2">Subtitles</h3>
            <Badge variant="secondary" className="text-xs">{cues.length} cues</Badge>
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto">
            {cues.length === 0 ? (
              <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">
                {translation ? 'No subtitles available' : 'Translation required'}
              </div>
            ) : (
              <div className="divide-y">
                {cues.map((cue, idx) => (
                  <div
                    key={`${cue.start}-${cue.end}-${idx}`}
                    className="px-3 py-2 text-xs hover:bg-muted/50 transition-colors cursor-pointer"
                    onClick={() => handleJump(cue.start)}
                  >
                    <div className="text-muted-foreground font-mono text-[10px] mb-1">
                      {cue.start} → {cue.end}
                    </div>
                    <div className="space-y-0.5">
                      {cue.lines.map((line, i) => (
                        <div key={i} className="text-xs font-mono break-words leading-snug">
                          {line}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 进度条和详细状态由上层的 CloudJobProgress 统一展示，这里只保留紧凑文案 */}
    </div>
  )
}
