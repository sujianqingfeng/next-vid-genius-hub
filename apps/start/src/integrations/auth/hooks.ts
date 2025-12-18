import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEnhancedMutation } from '~/lib/hooks/useEnhancedMutation'

import { useTranslations } from '../i18n'
import { queryOrpcNext } from '../orpc/next-client'

export function useAuthQuery() {
	return useQuery({
		...queryOrpcNext.auth.me.queryOptions(),
		staleTime: 60 * 1000,
	})
}

type AuthRedirectOptions = {
	redirectTo?: string
}

export function useLoginMutation(options?: AuthRedirectOptions) {
	const qc = useQueryClient()
	const t = useTranslations('Auth')

	return useEnhancedMutation(
		queryOrpcNext.auth.login.mutationOptions({
			onSuccess: () => {
				qc.invalidateQueries({ queryKey: queryOrpcNext.auth.me.queryKey() })
				if (options?.redirectTo) {
					window.location.replace(options.redirectTo)
				} else {
					window.location.replace('/media')
				}
			},
		}),
		{
			successToast: t('loginSuccess'),
			errorToast: ({ error }) =>
				error instanceof Error ? error.message : t('loginError'),
		},
	)
}

export function useSignupMutation(options?: AuthRedirectOptions) {
	const qc = useQueryClient()
	const t = useTranslations('Auth')

	return useEnhancedMutation(
		queryOrpcNext.auth.signup.mutationOptions({
			onSuccess: () => {
				qc.invalidateQueries({ queryKey: queryOrpcNext.auth.me.queryKey() })
				if (options?.redirectTo) {
					window.location.replace(options.redirectTo)
				} else {
					window.location.replace('/media')
				}
			},
		}),
		{
			successToast: t('signupSuccess'),
			errorToast: ({ error }) =>
				error instanceof Error ? error.message : t('signupError'),
		},
	)
}
