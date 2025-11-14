'use client'

import { useEffect, useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Button } from '~/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card'
import { Input } from '~/components/ui/input'
import { Label } from '~/components/ui/label'
import { Skeleton } from '~/components/ui/skeleton'
import { queryOrpc } from '~/lib/orpc/query-client'
import { useEnhancedMutation } from '~/lib/hooks/useEnhancedMutation'
import { RefreshCw, Sparkles, Save, Copy } from 'lucide-react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/components/ui/select'
import {
  ChatModelIds,
  DEFAULT_CHAT_MODEL_ID,
  type ChatModelId,
} from '~/lib/ai/models'

interface PublishTitleGeneratorProps {
  mediaId: string
  initialPublishTitle?: string | null
}

export function PublishTitleGenerator({ mediaId, initialPublishTitle }: PublishTitleGeneratorProps) {
  const qc = useQueryClient()
  const [value, setValue] = useState<string>(initialPublishTitle || '')
  const [candidates, setCandidates] = useState<string[] | null>(null)
  const [selectedModel, setSelectedModel] = useState<ChatModelId>(DEFAULT_CHAT_MODEL_ID)

  // Persist selected model (global)
  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      const saved = window.localStorage.getItem('publishTitleModel') as ChatModelId | null
      if (saved && (ChatModelIds as readonly string[]).includes(saved)) setSelectedModel(saved)
    } catch {}
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      if (selectedModel) window.localStorage.setItem('publishTitleModel', selectedModel)
    } catch {}
  }, [selectedModel])

  const genMutation = useEnhancedMutation(
    queryOrpc.media.generatePublishTitle.mutationOptions({
      onSuccess: (data) => {
        const list = data?.candidates || []
        setCandidates(list)
        if (list[0]) setValue((prev) => (prev ? prev : list[0]))
      },
    }),
    {
      successToast: 'Generated candidates',
      errorToast: ({ error }) => `Generate failed: ${error.message}`,
    },
  )

  const saveMutation = useEnhancedMutation(
    queryOrpc.media.updatePublishTitle.mutationOptions({
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: queryOrpc.media.byId.queryKey({ input: { id: mediaId } }) })
      },
    }),
    {
      successToast: 'Publish title saved',
      errorToast: ({ error }) => `Save failed: ${error.message}`,
    },
  )

  const canSave = useMemo(() => value.trim().length > 0, [value])

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(value)
      toast.success('Copied title')
    } catch {
      toast.error('Copy failed')
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Publish Title</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">Saved / Editable</Label>
          <div className="flex gap-2">
            <Input
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="Generate or type a catchy title…"
            />
            <Button
              variant="secondary"
              size="icon"
              onClick={copyToClipboard}
              title="Copy"
              disabled={!value}
              className="shrink-0"
            >
              <Copy className="w-4 h-4" />
            </Button>
            <Button
              onClick={() => saveMutation.mutate({ id: mediaId, publishTitle: value })}
              disabled={!canSave || saveMutation.isPending}
              className="shrink-0"
              title="Save"
            >
              {saveMutation.isPending ? 'Saving…' : (
                <span className="inline-flex items-center gap-2"><Save className="w-4 h-4" />Save</span>
              )}
            </Button>
          </div>
        </div>

        <div className="flex gap-2 pt-1 items-center">
          <div className="flex items-center gap-2">
            <Label className="text-xs text-muted-foreground">Model</Label>
            <Select value={selectedModel} onValueChange={(v) => setSelectedModel(v as ChatModelId)}>
              <SelectTrigger className="w-[220px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ChatModelIds.map((id) => (
                  <SelectItem key={id} value={id}>{id}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            variant="outline"
            onClick={() => genMutation.mutate({ mediaId, count: 5, model: selectedModel })}
            disabled={genMutation.isPending}
          >
            {genMutation.isPending ? (
              <span className="inline-flex items-center gap-2"><RefreshCw className="w-4 h-4 animate-spin" />Generating…</span>
            ) : (
              <span className="inline-flex items-center gap-2"><Sparkles className="w-4 h-4" />Generate 5</span>
            )}
          </Button>
          {candidates && candidates.length > 0 && (
            <Button
              variant="ghost"
              onClick={() => genMutation.mutate({ mediaId, count: 5, model: selectedModel })}
              disabled={genMutation.isPending}
            >
              <span className="inline-flex items-center gap-2"><RefreshCw className="w-4 h-4" />Regenerate</span>
            </Button>
          )}
        </div>

        <div className="space-y-2">
          {genMutation.isPending && (
            <div className="grid grid-cols-1 gap-2">
              <Skeleton className="h-9" />
              <Skeleton className="h-9" />
              <Skeleton className="h-9" />
            </div>
          )}
          {!genMutation.isPending && candidates && candidates.length > 0 && (
            <div className="grid grid-cols-1 gap-2">
              {candidates.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setValue(c)}
                  className={`text-left px-3 py-2 rounded-md border hover:bg-accent hover:text-accent-foreground transition ${
                    value === c ? 'border-primary ring-1 ring-primary' : 'border-muted'
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
