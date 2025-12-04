'use client'

import { useMutation, useQueryClient, type UseMutationOptions, type UseMutationResult, type InvalidateQueryFilters } from '@tanstack/react-query'
import type { QueryKey } from '@tanstack/react-query'
import { toast } from 'sonner'

export type MaybeMessage<TPayload> = string | ((payload: TPayload) => string | undefined | null)

export interface SuccessPayload<TData, TVariables, TContext> {
	data: TData
	variables: TVariables
	context: TContext | undefined
}

export interface ErrorPayload<TError, TVariables, TContext> {
	error: TError
	variables: TVariables
	context: TContext | undefined
}

export interface UseEnhancedMutationSideEffects<TData, TError, TVariables, TContext> {
	invalidateQueries?: QueryKey | InvalidateQueryFilters
	successToast?: MaybeMessage<SuccessPayload<TData, TVariables, TContext>>
	errorToast?: MaybeMessage<ErrorPayload<TError, TVariables, TContext>>
	onSuccess?: (payload: SuccessPayload<TData, TVariables, TContext>) => void
	onError?: (payload: ErrorPayload<TError, TVariables, TContext>) => void
}

function resolveMessage<TPayload>(message: MaybeMessage<TPayload> | undefined, payload: TPayload) {
	if (!message) return null
	if (typeof message === 'string') return message
	return message(payload) ?? null
}

export function useEnhancedMutation<TData, TError, TVariables, TContext>(
	baseOptions: UseMutationOptions<TData, TError, TVariables, TContext>,
	sideEffects: UseEnhancedMutationSideEffects<TData, TError, TVariables, TContext> = {},
): UseMutationResult<TData, TError, TVariables, TContext> {
	const queryClient = useQueryClient()

	return useMutation({
		...baseOptions,
		onSuccess: (data, variables, context, mutation) => {
			baseOptions.onSuccess?.(data, variables, context, mutation)
			sideEffects.onSuccess?.({ data, variables, context })
			if (sideEffects.invalidateQueries) {
				if (Array.isArray(sideEffects.invalidateQueries)) {
					queryClient.invalidateQueries({
						queryKey: sideEffects.invalidateQueries,
					})
				} else {
					queryClient.invalidateQueries(
						sideEffects.invalidateQueries as InvalidateQueryFilters,
					)
				}
			}
			const message = resolveMessage(sideEffects.successToast, { data, variables, context })
			if (message) {
				toast.success(message)
			}
		},
		onError: (error, variables, context, mutation) => {
			baseOptions.onError?.(error, variables, context, mutation)
			sideEffects.onError?.({ error, variables, context })
			const message = resolveMessage(sideEffects.errorToast, { error, variables, context })
			if (message) {
				toast.error(message)
			}
		},
	})
}
