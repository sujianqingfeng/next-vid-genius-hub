'use client'

import { useQuery } from '@tanstack/react-query'
import { queryOrpc } from '~/lib/orpc/query-client'
import { Button } from '~/components/ui/button'
import { useTranslations } from 'next-intl'

type Props = {
  channelId: string
  limit?: number
  translatedTitleMap?: Record<string, string>
}

export function ChannelVideoList({ channelId, limit = 20, translatedTitleMap }: Props) {
  const t = useTranslations('Channels.videos')
  const q = useQuery(
    queryOrpc.channel.listChannelVideos.queryOptions({
      input: { id: channelId, limit },
      enabled: !!channelId,
    }),
  )

  if (q.isLoading) {
    return (
      <div className="text-sm text-muted-foreground p-3">{t('loading')}</div>
    )
  }

  const list = q.data?.videos ?? []
  if (!list.length) {
    return (
      <div className="text-sm text-muted-foreground p-3">{t('empty')}</div>
    )
  }

  return (
    <div className="divide-y">
      {list.map((v: { id: string; title: string; thumbnail?: string | null; url: string }) => {
        const translated = translatedTitleMap?.[v.id]
        return (
          <div key={v.id} className="flex items-center gap-3 py-2">
            {v.thumbnail ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={v.thumbnail} alt="thumb" className="w-14 h-8 rounded object-cover" />
            ) : (
              <div className="w-14 h-8 rounded bg-muted" />
            )}
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">
                {translated ?? v.title}
              </div>
              {translated && (
                <div className="truncate text-xs text-muted-foreground">
                  {t('original', { title: v.title })}
                </div>
              )}
              <div className="text-xs text-muted-foreground truncate">{v.url}</div>
            </div>
            <a href={v.url} target="_blank" rel="noreferrer">
              <Button size="sm" variant="ghost">{t('open')}</Button>
            </a>
          </div>
        )
      })}
    </div>
  )
}
