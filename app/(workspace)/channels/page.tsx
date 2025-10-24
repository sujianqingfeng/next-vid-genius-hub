'use client'

import * as React from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { queryOrpc } from '~/lib/orpc/query-client'
import { Button } from '~/components/ui/button'
import { Input } from '~/components/ui/input'


import { ProxySelector } from '~/components/business/proxy/proxy-selector'
import { ChannelVideoList } from '~/components/business/channels/channel-video-list'
import { useEnhancedMutation } from '~/lib/hooks/useEnhancedMutation'
import { ChatModelSelect } from '~/components/business/media/subtitles/ChatModelSelect'
import { ChatModelIds, type ChatModelId } from '~/lib/ai/models'

export default function ChannelsPage() {
  const qc = useQueryClient()
  const [newInput, setNewInput] = React.useState('')
  const [jobMap, setJobMap] = React.useState<Record<string, string>>({})
  const [statusMap, setStatusMap] = React.useState<Record<string, string>>({})
  const [selectedProxyByChannel, setSelectedProxyByChannel] = React.useState<Record<string, string>>({})
  const [expanded, setExpanded] = React.useState<Record<string, boolean>>({})
  const defaultChannelModel = React.useMemo<ChatModelId>(() => {
    const fallback = 'openai/gpt-4o-mini'
    const configured = ChatModelIds.find((id) => id === fallback) ?? ChatModelIds[0]
    return (configured ?? fallback) as ChatModelId
  }, [])
  const [selectedModelByChannel, setSelectedModelByChannel] = React.useState<Record<string, ChatModelId>>({})

  const listQuery = useQuery(queryOrpc.channel.listChannels.queryOptions({}))

  const createMutation = useMutation(
    queryOrpc.channel.createChannel.mutationOptions({
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: queryOrpc.channel.listChannels.queryKey({}) })
        setNewInput('')
      },
    })
  )

  const startSyncMutation = useMutation(
    queryOrpc.channel.startCloudSync.mutationOptions({
      onSuccess: (res, variables) => {
        const id = variables.id as string
        setJobMap((m) => ({ ...m, [id]: res.jobId }))
        setStatusMap((m) => ({ ...m, [id]: 'queued' }))
      },
    })
  )

  const finalizeMutation = useMutation(
    queryOrpc.channel.finalizeCloudSync.mutationOptions({
      onSuccess: async (_res, variables) => {
        await qc.invalidateQueries({ queryKey: queryOrpc.channel.listChannels.queryKey({}) })
        const id = variables?.id as string | undefined
        if (id) {
          // refresh this channel's video list if it's open elsewhere
          await qc.invalidateQueries({
            queryKey: queryOrpc.channel.listChannelVideos.queryKey({ input: { id, limit: 20 } }),
          })
          // auto-expand to show freshly synced list
          setExpanded((m) => ({ ...m, [id]: true }))
          setJobMap((m) => {
            const next = { ...m }
            delete next[id]
            return next
          })
        }
      },
    })
  )

  const setStatusFor = React.useCallback((id: string, status: string) => {
    setStatusMap((m) => ({ ...m, [id]: status }))
  }, [])

  const finalizeJob = React.useCallback((id: string, jobId: string) => {
    finalizeMutation.mutate({ id, jobId })
  }, [finalizeMutation])

  return (
    <div className="container mx-auto py-6 px-4">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold mb-4">Channels</h1>
        
        <div className="flex gap-2 mb-6">
          <Input
            value={newInput}
            onChange={(e) => setNewInput(e.target.value)}
            placeholder="YouTube channel URL or ID"
            className="flex-1 max-w-md"
          />
          <Button
            disabled={!newInput || createMutation.isPending}
            onClick={() => createMutation.mutate({ channelUrlOrId: newInput })}
          >
            Add
          </Button>
        </div>
      </div>

      <div className="space-y-4">
        {listQuery.isLoading && (
          <div className="text-center py-8 text-muted-foreground">Loading...</div>
        )}
        
        {listQuery.data?.channels?.map((ch) => (
          <ChannelCard
            key={ch.id}
            ch={ch}
            selectedProxyId={selectedProxyByChannel[ch.id] ?? (ch.defaultProxyId || 'none')}
            selectedModel={selectedModelByChannel[ch.id] ?? defaultChannelModel}
            onSelectProxy={(v) => setSelectedProxyByChannel((m) => ({ ...m, [ch.id]: v }))}
            onSelectModel={(v) => setSelectedModelByChannel((m) => ({ ...m, [ch.id]: v }))}
            jobId={jobMap[ch.id]}
            status={statusMap[ch.id] ?? ch.lastSyncStatus}
            setStatus={(s) => setStatusFor(ch.id, s)}
            onSync={() => {
              const sel = selectedProxyByChannel[ch.id]
              startSyncMutation.mutate({ 
                id: ch.id, 
                limit: 20, 
                proxyId: sel && sel !== 'none' ? sel : undefined 
              })
            }}
            onFinalize={() => {
              const jid = jobMap[ch.id]
              if (jid) finalizeJob(ch.id, jid)
            }}
            expanded={!!expanded[ch.id]}
            onToggleExpanded={() => setExpanded((m) => ({ ...m, [ch.id]: !m[ch.id] }))}
          />
        ))}
        
        {!listQuery.isLoading && !listQuery.data?.channels?.length && (
          <div className="text-center py-12 text-muted-foreground">
            No channels added yet
          </div>
        )}
      </div>
    </div>
  )
}

interface ChannelCardProps {
  ch: {
    id: string
    title: string | null
    channelUrl: string
    channelId: string | null
    thumbnail: string | null
    defaultProxyId: string | null
    lastSyncStatus: string | null
  }
  selectedProxyId: string
  selectedModel: ChatModelId
  onSelectProxy: (v: string) => void
  onSelectModel: (v: ChatModelId) => void
  jobId?: string
  status?: string
  setStatus: (s: string) => void
  onSync: () => void
  onFinalize: () => void
  expanded: boolean
  onToggleExpanded: () => void
}

function ChannelCard({ ch, selectedProxyId, selectedModel, onSelectProxy, onSelectModel, jobId, status, setStatus, onSync, onFinalize, expanded, onToggleExpanded }: ChannelCardProps) {
  const finalizeAttemptedRef = React.useRef(false)
  const [translatedMap, setTranslatedMap] = React.useState<Record<string, string> | null>(null)
  const [showTranslated, setShowTranslated] = React.useState(false)
  // Always call useQuery in same order
  const statusQuery = useQuery({
    ...(jobId ? queryOrpc.channel.getCloudSyncStatus.queryOptions({ input: { jobId } }) : {
      queryKey: ['channel.noop', ch.id],
      queryFn: async () => null,
    }),
    enabled: !!jobId,
    refetchInterval: (q) => {
      if (!jobId) return false
      const s = (q.state?.data as { status?: string })?.status
      if (!s) return 1500
      return ['completed', 'failed', 'canceled'].includes(s) ? false : 1500
    },
  })

  React.useEffect(() => {
    const s = (statusQuery?.data as { status?: string })?.status
    if (s) setStatus(s)
    if (s === 'completed' && jobId && !finalizeAttemptedRef.current) {
      finalizeAttemptedRef.current = true
      onFinalize()
    }
  }, [statusQuery?.data, jobId, setStatus, onFinalize])

  const translateMutation = useEnhancedMutation(
    queryOrpc.channel.translateVideoTitles.mutationOptions({
      onSuccess: (res) => {
        const map = Object.fromEntries((res.items ?? []).map((i) => [i.id, i.translation]))
        setTranslatedMap(map)
        // auto show translated when finished
        setShowTranslated(true)
      },
    }),
    {
      successToast: 'Titles translated!',
      errorToast: ({ error }) => `Failed to translate titles: ${error.message}`,
    },
  )

  return (
    <div className="border rounded-lg p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3 min-w-0">
          {ch.thumbnail ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img 
              src={ch.thumbnail} 
              alt="thumbnail" 
              className="w-10 h-10 rounded object-cover"
            />
          ) : (
            <div className="w-10 h-10 rounded bg-muted" />
          )}
          <div className="min-w-0">
            <div className="font-medium truncate">
              {ch.title || ch.channelUrl || ch.channelId || ch.id}
            </div>
            <div className="text-xs text-muted-foreground truncate">
              {ch.channelUrl}
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-2 flex-wrap">
          <div className="text-xs text-muted-foreground min-w-[80px] text-right">
            {status || '-'}
          </div>
          <div className="hidden sm:block min-w-[140px]">
            <ProxySelector value={selectedProxyId} onValueChange={onSelectProxy} />
          </div>
          <div className="min-w-[180px] max-w-[220px]">
            <ChatModelSelect
              value={selectedModel}
              onChange={onSelectModel}
              disabled={translateMutation.isPending}
              triggerClassName="w-full"
            />
          </div>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => translateMutation.mutate({ channelId: ch.id, limit: 20, model: selectedModel })}
            disabled={translateMutation.isPending}
            title="Translate the latest video titles to Chinese"
          >
            {translateMutation.isPending ? 'Translating…' : 'Translate'}
          </Button>
          {translatedMap && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setShowTranslated((v) => !v)}
              title={showTranslated ? 'Hide translated titles' : 'Show translated titles'}
            >
              {showTranslated ? 'Hide Translation' : 'Show Translation'}
            </Button>
          )}
          <Button 
            size="sm"
            onClick={onSync}
            disabled={status === 'running' || status === 'queued'}
          >
            {status === 'running' || status === 'queued' ? '...' : 'Sync'}
          </Button>
          <Button 
            size="sm"
            variant="outline" 
            onClick={onToggleExpanded}
          >
            {expanded ? 'Hide' : 'Show'}
          </Button>
        </div>
      </div>
      
      {expanded && (
        <div className="mt-4 pt-4 border-t">
          <ChannelVideoList channelId={ch.id} limit={20} translatedTitleMap={showTranslated ? translatedMap ?? undefined : undefined} />
        </div>
      )}
    </div>
  )
}
