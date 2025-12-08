'use client'

import { Loader2 } from 'lucide-react'
import { useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { Button } from '~/components/ui/button'
import { useAuthQuery } from '~/lib/auth/hooks'

export function WorkspaceAuthGate({ children }: { children: React.ReactNode }) {
	const router = useRouter()
	const pathname = usePathname()
	const { data, isLoading, isFetching, error, refetch } = useAuthQuery()

	useEffect(() => {
		if (isLoading || isFetching || error) return
		if (!data?.user) {
			const next = encodeURIComponent(pathname || '/media')
			router.replace(`/login?next=${next}`)
		}
	}, [data?.user, error, isFetching, isLoading, pathname, router])

	if (isLoading || isFetching) {
		return (
			<div className="flex h-dvh items-center justify-center text-muted-foreground">
				<div className="flex items-center gap-2">
					<Loader2 className="h-5 w-5 animate-spin" />
					<span>加载中…</span>
				</div>
			</div>
		)
	}

	if (error) {
		return (
			<div className="flex h-dvh items-center justify-center">
				<div className="space-y-3 text-center">
					<p className="text-sm text-muted-foreground">用户信息加载失败</p>
					<Button onClick={() => refetch()}>重试</Button>
				</div>
			</div>
		)
	}

	if (!data?.user) {
		return null
	}

	return <>{children}</>
}
