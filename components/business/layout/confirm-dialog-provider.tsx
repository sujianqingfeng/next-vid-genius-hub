'use client'

import { createContext, useCallback, useContext, useState } from 'react'
import type React from 'react'

import { Button } from '~/components/ui/button'
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogDescription,
} from '~/components/ui/dialog'
import { useTranslations } from 'next-intl'

type ConfirmDialogOptions = {
	title?: React.ReactNode
	description?: React.ReactNode
	confirmText?: React.ReactNode
	cancelText?: React.ReactNode
	variant?: 'default' | 'destructive'
}

type ConfirmDialogFn = (options: ConfirmDialogOptions) => Promise<boolean>

type ConfirmDialogState = {
	open: boolean
	options: ConfirmDialogOptions
	resolve?: (value: boolean) => void
}

const ConfirmDialogContext = createContext<ConfirmDialogFn | null>(null)

export function ConfirmDialogProvider({
	children,
}: {
	children: React.ReactNode
}) {
	const t = useTranslations('Common.confirmDialog')
	const [state, setState] = useState<ConfirmDialogState>({
		open: false,
		options: {},
	})

	const confirm = useCallback<ConfirmDialogFn>((options) => {
		return new Promise<boolean>((resolve) => {
			setState({
				open: true,
				options,
				resolve,
			})
		})
	}, [])

	const close = useCallback(
		(result: boolean) => {
			setState((prev) => {
				if (prev.resolve) {
					prev.resolve(result)
				}
				return {
					open: false,
					options: {},
					resolve: undefined,
				}
			})
		},
		[setState],
	)

	const handleOpenChange = (nextOpen: boolean) => {
		if (!nextOpen) {
			close(false)
		}
	}

	const { open, options } = state
	const {
		title,
		description,
		confirmText,
		cancelText,
		variant = 'default',
	} = options

	const finalTitle = title ?? t('title')
	const finalCancelText = cancelText ?? t('cancel')
	const finalConfirmText = confirmText ?? t('confirm')

	return (
		<ConfirmDialogContext.Provider value={confirm}>
			{children}
			<Dialog open={open} onOpenChange={handleOpenChange}>
				<DialogContent className="max-w-sm">
					<DialogHeader>
						{finalTitle && <DialogTitle>{finalTitle}</DialogTitle>}
						{description && (
							<DialogDescription>{description}</DialogDescription>
						)}
					</DialogHeader>
					<DialogFooter>
						<Button variant="outline" onClick={() => close(false)}>
							{finalCancelText}
						</Button>
						<Button
							variant={variant === 'destructive' ? 'destructive' : 'default'}
							onClick={() => close(true)}
						>
							{finalConfirmText}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</ConfirmDialogContext.Provider>
	)
}

export function useConfirmDialog() {
	const ctx = useContext(ConfirmDialogContext)
	if (!ctx) {
		throw new Error('useConfirmDialog must be used within ConfirmDialogProvider')
	}
	return ctx
}

