'use client'

import * as React from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { queryOrpc } from '~/lib/orpc/query-client'
import { Button } from '~/components/ui/button'
import { Input } from '~/components/ui/input'
import { ProxySelector } from '~/components/business/proxy/proxy-selector'
import { ChannelVideoList } from '~/components/business/channels/channel-video-list'

export default function ChannelsPage() {
  const qc = useQueryClient()
  const [newInput, setNewInput] = React.useState('')
  const [jobMap, setJobMap] = React.useState<Record<string, string>>({})
  const [statusMap, setStatusMap] = React.useState<Record<string, string>>({})
  const [selectedProxyByChannel, setSelectedProxyByChannel] = React.useState<Record<string, string>>({})
  const [expanded, setExpanded] = React.useState<Record<string, boolean>>({})

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
        const id = (variables as any).id as string
        setJobMap((m) => ({ ...m, [id]: res.jobId }))
        setStatusMap((m) => ({ ...m, [id]: 'queued' }))
      },
    })
  )

  const finalizeMutation = useMutation(
    queryOrpc.channel.finalizeCloudSync.mutationOptions({
      onSuccess: async (_res, variables) => {
        await qc.invalidateQueries({ queryKey: queryOrpc.channel.listChannels.queryKey({}) })
        const id = (variables as any)?.id as string
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
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-2 flex-wrap">
        <Input
          value={newInput}
          onChange={(e) => setNewInput(e.target.value)}
          placeholder="YouTube channel URL or UC... ID"
          className="max-w-xl"
        />
        <Button
          disabled={!newInput || createMutation.isPending}
          onClick={() => createMutation.mutate({ channelUrlOrId: newInput })}
        >
          Add Channel
        </Button>
      </div>

      <div className="space-y-3">
        {listQuery.data?.channels?.map((ch) => (
          <ChannelRow
            key={ch.id}
            ch={ch as any}
            selectedProxyId={selectedProxyByChannel[ch.id] ?? (ch.defaultProxyId || 'none')}
            onSelectProxy={(v) => setSelectedProxyByChannel((m) => ({ ...m, [ch.id]: v }))}
            jobId={jobMap[ch.id]}
            status={statusMap[ch.id] ?? ch.lastSyncStatus}
            setStatus={(s) => setStatusFor(ch.id, s)}
            onSync={() => {
              const sel = selectedProxyByChannel[ch.id]
              startSyncMutation.mutate({ id: ch.id, limit: 20, proxyId: sel && sel !== 'none' ? sel : undefined })
            }}
            onFinalize={() => {
              const jid = jobMap[ch.id]
              if (jid) finalizeJob(ch.id, jid)
            }}
            expanded={!!expanded[ch.id]}
            onToggleExpanded={() => setExpanded((m) => ({ ...m, [ch.id]: !m[ch.id] }))}
          />
        ))}
        {!listQuery.data?.channels?.length && (
          <div className="text-sm text-muted-foreground">No channels yet. Add one above.</div>
        )}
      </div>
    </div>
  )
}

type ChannelRowProps = {
  ch: any
  selectedProxyId: string
  onSelectProxy: (v: string) => void
  jobId?: string
  status?: string
  setStatus: (s: string) => void
  onSync: () => void
  onFinalize: () => void
  expanded: boolean
  onToggleExpanded: () => void
}

function ChannelRow({ ch, selectedProxyId, onSelectProxy, jobId, status, setStatus, onSync, onFinalize, expanded, onToggleExpanded }: ChannelRowProps) {
  const finalizeAttemptedRef = React.useRef(false)
  // Poll job status via React Query when a job is running
  const statusQuery = jobId
    ? useQuery({
        ...(queryOrpc.channel.getCloudSyncStatus.queryOptions({ input: { jobId } }) as any),
        enabled: true,
        refetchInterval: (q: any) => {
          const s = q.state?.data?.status as string | undefined
          if (!s) return 1500
          return ['completed', 'failed', 'canceled'].includes(s) ? false : 1500
        },
      })
    : useQuery({
        queryKey: ['channel.noop', ch.id],
        queryFn: async () => null,
        enabled: false,
      })

  React.useEffect(() => {
    const s = (statusQuery?.data as any)?.status as string | undefined
    if (s) setStatus(s)
    if (s === 'completed' && jobId && !finalizeAttemptedRef.current) {
      finalizeAttemptedRef.current = true
      onFinalize()
    }
  }, [statusQuery?.data, jobId])

  return (
    <div className="border rounded-lg">
      <div className="flex items-center justify-between p-3">
        <div className="flex items-center gap-3 min-w-0">
          {ch.thumbnail ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={ch.thumbnail} alt="thumb" className="w-10 h-10 rounded" />
          ) : (
            <div className="w-10 h-10 rounded bg-muted" />
          )}
          <div className="min-w-0">
            <div className="font-medium truncate">{ch.title || ch.channelUrl || ch.channelId || ch.id}</div>
            <div className="text-xs text-muted-foreground truncate">{ch.channelUrl}</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="hidden sm:block min-w-[220px] mr-2">
            <ProxySelector value={selectedProxyId} onValueChange={onSelectProxy} />
          </div>
          <div className="text-xs text-muted-foreground min-w-[90px] text-right">
            {status || '-'}
          </div>
          <Button variant="outline" onClick={onSync}>
            Sync 20
          </Button>
          <Button variant="ghost" onClick={onToggleExpanded}>
            {expanded ? 'Hide' : 'Show'}
          </Button>
        </div>
      </div>
      {expanded && (
        <div className="px-3 pb-3">
          <ChannelVideoList channelId={ch.id} limit={20} />
        </div>
      )}
    </div>
  )
}
