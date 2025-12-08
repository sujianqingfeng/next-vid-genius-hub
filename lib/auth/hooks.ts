'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { queryOrpc } from '~/lib/orpc/query-client'
import { useEnhancedMutation } from '~/lib/hooks/useEnhancedMutation'

export function useAuthQuery() {
	return useQuery({
		...queryOrpc.auth.me.queryOptions(),
		staleTime: 60 * 1000,
	})
}

interface AuthRedirectOptions {
	redirectTo?: string
}

export function useLoginMutation(options?: AuthRedirectOptions) {
	const qc = useQueryClient()
	const router = useRouter()

	return useEnhancedMutation(
		queryOrpc.auth.login.mutationOptions({
			onSuccess: () => {
				qc.invalidateQueries({ queryKey: queryOrpc.auth.me.queryKey() })
				router.replace(options?.redirectTo ?? '/media')
			},
		}),
		{
			successToast: '登录成功',
			errorToast: ({ error }) => error.message || '登录失败',
		},
	)
}

export function useSignupMutation(options?: AuthRedirectOptions) {
	const qc = useQueryClient()
	const router = useRouter()

	return useEnhancedMutation(
		queryOrpc.auth.signup.mutationOptions({
			onSuccess: () => {
				qc.invalidateQueries({ queryKey: queryOrpc.auth.me.queryKey() })
				router.replace(options?.redirectTo ?? '/media')
			},
		}),
		{
			successToast: '注册成功',
			errorToast: ({ error }) => error.message || '注册失败',
		},
	)
}

export function useLogoutMutation() {
	const qc = useQueryClient()
	const router = useRouter()
	return useMutation({
		...queryOrpc.auth.logout.mutationOptions(),
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: queryOrpc.auth.me.queryKey() })
			router.replace('/login')
			toast.success('已退出')
		},
		onError: (error) => {
			const message = error instanceof Error ? error.message : '退出失败'
			toast.error(message)
		},
	})
}
