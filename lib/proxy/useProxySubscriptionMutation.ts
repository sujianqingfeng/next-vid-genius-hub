'use client'

import type { UseMutationOptions, UseMutationResult } from '@tanstack/react-query'
import { queryOrpc } from '~/lib/orpc/query-client'
import { useEnhancedMutation, type UseEnhancedMutationSideEffects } from '~/lib/hooks/useEnhancedMutation'

export function useProxySubscriptionMutation<TData = unknown, TError = unknown, TVariables = void, TContext = unknown>(
	options: UseMutationOptions<TData, TError, TVariables, TContext>,
messages: Pick<UseEnhancedMutationSideEffects<TData, TError, TVariables, TContext>, 'successToast' | 'errorToast'> = {},
): UseMutationResult<TData, TError, TVariables, TContext> {
	return useEnhancedMutation(options, {
		invalidateQueries: {
			queryKey: queryOrpc.proxy.getSSRSubscriptions.key(),
		},
		successToast: messages.successToast,
		errorToast: messages.errorToast,
	})
}
