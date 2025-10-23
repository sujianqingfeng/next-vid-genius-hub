'use client'

import * as React from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { queryOrpc } from '~/lib/orpc/query-client'
import { Button } from '~/components/ui/button'
import { Input } from '~/components/ui/input'

export default function ChannelsPage() {
  const qc = useQueryClient()
  const [newInput, setNewInput] = React.useState('')
  const [jobMap, setJobMap] = React.useState<Record<string, string>>({})
  const [statusMap, setStatusMap] = React.useState<Record<string, string>>({})

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
      onSuccess: async () => {
        await qc.invalidateQueries({ queryKey: queryOrpc.channel.listChannels.queryKey({}) })
      },
    })
  )

  // Simple polling for running jobs
  React.useEffect(() => {
    const ids = Object.keys(jobMap)
    if (ids.length === 0) return
    let stop = false
    const tick = async () => {
      for (const id of ids) {
        const jobId = jobMap[id]
        if (!jobId) continue
        const st = await (queryOrpc as any).channel.getCloudSyncStatus.query({ jobId })
        setStatusMap((m) => ({ ...m, [id]: st.status }))
        if (st.status === 'completed') {
          try {
            await finalizeMutation.mutateAsync({ id, jobId })
          } catch {}
        }
      }
      if (!stop) setTimeout(tick, 1500)
    }
    const t = setTimeout(tick, 100)
    return () => {
      stop = true
      clearTimeout(t)
    }
  }, [jobMap])

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-2">
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
          <div key={ch.id} className="flex items-center justify-between border rounded-lg p-3">
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
              <div className="text-xs text-muted-foreground min-w-[90px] text-right">
                {statusMap[ch.id] ? statusMap[ch.id] : ch.lastSyncStatus || '-'}
              </div>
              <Button
                variant="outline"
                disabled={startSyncMutation.isPending}
                onClick={() => startSyncMutation.mutate({ id: ch.id, limit: 20 })}
              >
                Sync 20
              </Button>
            </div>
          </div>
        ))}
        {!listQuery.data?.channels?.length && (
          <div className="text-sm text-muted-foreground">No channels yet. Add one above.</div>
        )}
      </div>
    </div>
  )
}
