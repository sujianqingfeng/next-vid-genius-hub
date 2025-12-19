'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { queryOrpc } from '~/lib/orpc/query-client'
import { useEnhancedMutation } from '~/lib/hooks/useEnhancedMutation'
import { useTranslations } from '~/lib/i18n'

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
	const t = useTranslations('Auth')

	return useEnhancedMutation(
		queryOrpc.auth.login.mutationOptions({
			onSuccess: () => {
				qc.invalidateQueries({ queryKey: queryOrpc.auth.me.queryKey() })
				router.replace(options?.redirectTo ?? '/media')
			},
		}),
		{
			successToast: t('loginSuccess'),
			errorToast: ({ error }) => error.message || t('loginError'),
		},
	)
}

export function useSignupMutation(options?: AuthRedirectOptions) {
	const qc = useQueryClient()
	const router = useRouter()
	const t = useTranslations('Auth')

	return useEnhancedMutation(
		queryOrpc.auth.signup.mutationOptions({
			onSuccess: () => {
				qc.invalidateQueries({ queryKey: queryOrpc.auth.me.queryKey() })
				router.replace(options?.redirectTo ?? '/media')
			},
		}),
		{
			successToast: t('signupSuccess'),
			errorToast: ({ error }) => error.message || t('signupError'),
		},
	)
}

export function useLogoutMutation() {
	const qc = useQueryClient()
	const router = useRouter()
	const t = useTranslations('Auth')
	return useMutation({
		...queryOrpc.auth.logout.mutationOptions(),
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: queryOrpc.auth.me.queryKey() })
			router.replace('/login')
			toast.success(t('logoutSuccess'))
		},
		onError: (error) => {
			const message = error instanceof Error ? error.message : t('logoutError')
			toast.error(message)
		},
	})
}
