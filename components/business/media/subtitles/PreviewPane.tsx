"use client"

import { useEffect, useMemo, useState } from 'react'
import { Badge } from '~/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/components/ui/select'
import { Progress } from '~/components/ui/progress'
import { Video, Layers, MonitorPlay, Film, Loader2 } from 'lucide-react'
import type { SubtitleRenderConfig } from '~/lib/subtitle/types'
import { VideoPreview } from './VideoPreview/VideoPreview'
import { STATUS_LABELS } from '~/lib/constants/media.constants'

type PreviewMode = 'auto' | 'overlay' | 'rendered'

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
  renderBackend?: 'local' | 'cloud'
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
    renderBackend,
  } = props

  const storageKey = useMemo(() => `subtitlePreviewMode:${mediaId}`, [mediaId])
  const [mode, setMode] = useState<PreviewMode>('auto')

  useEffect(() => {
    try {
      const val = typeof window !== 'undefined' ? window.localStorage.getItem(storageKey) : null
      if (val === 'overlay' || val === 'rendered' || val === 'auto') setMode(val)
    } catch {}
  }, [storageKey])

  useEffect(() => {
    try {
      if (typeof window !== 'undefined') window.localStorage.setItem(storageKey, mode)
    } catch {}
  }, [mode, storageKey])

  const effectiveMode: PreviewMode = useMemo(() => {
    if (mode === 'auto') return hasRenderedVideo ? 'rendered' : 'overlay'
    return mode
  }, [mode, hasRenderedVideo])

  const renderedUrlBase = `/api/media/${mediaId}/rendered`
  const renderedSrc = cacheBuster ? `${renderedUrlBase}?v=${cacheBuster}` : renderedUrlBase

  const isCloud = renderBackend === 'cloud'
  const statusLabel = useMemo(() => {
    const s = cloudStatus?.status
    if (!s) return isRendering ? 'Rendering…' : null
    return s in STATUS_LABELS ? STATUS_LABELS[s as keyof typeof STATUS_LABELS] : s
  }, [cloudStatus?.status, isRendering])

  const progressPct = typeof cloudStatus?.progress === 'number' ? Math.round((cloudStatus?.progress ?? 0) * 100) : undefined

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Video className="h-5 w-5" />
          <h3 className="text-lg font-semibold">Preview</h3>
          {hasRenderedVideo && <Badge variant="secondary">Rendered</Badge>}
        </div>
        <div className="flex items-center gap-3">
          {(isRendering || cloudStatus?.status) && (
            <div className="hidden sm:flex items-center gap-2 text-xs text-muted-foreground">
              {isCloud ? <Film className="h-4 w-4" /> : <Loader2 className="h-4 w-4 animate-spin" />}
              <span>{statusLabel ?? 'Rendering…'}</span>
              {typeof progressPct === 'number' && <span className="tabular-nums">• {progressPct}%</span>}
            </div>
          )}
          <Select
            value={mode}
            onValueChange={(v) => setMode(v as PreviewMode)}
          >
            <SelectTrigger className="w-[150px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="auto">
                <div className="flex items-center gap-2">
                  <MonitorPlay className="h-4 w-4" />
                  Auto
                </div>
              </SelectItem>
              <SelectItem value="overlay">
                <div className="flex items-center gap-2">
                  <Layers className="h-4 w-4" />
                  Source + Overlay
                </div>
              </SelectItem>
              <SelectItem value="rendered" disabled={!hasRenderedVideo}>
                <div className="flex items-center gap-2">
                  <Film className="h-4 w-4" />
                  Rendered
                </div>
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="w-full rounded-lg border bg-black overflow-hidden" style={{ minHeight: '300px', maxHeight: '80vh' }}>
        {effectiveMode === 'rendered' ? (
          <video
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
          />
        )}
      </div>

      {(isRendering || typeof progressPct === 'number') && (
        <div className="flex items-center gap-3">
          <div className="flex-1 min-w-0">
            <Progress value={typeof progressPct === 'number' ? progressPct : 0} srLabel="Rendering progress" />
          </div>
          <div className="shrink-0 text-xs text-muted-foreground tabular-nums">
            {statusLabel ?? 'Rendering…'}{typeof progressPct === 'number' ? ` • ${progressPct}%` : ''}
          </div>
        </div>
      )}
    </div>
  )
}

