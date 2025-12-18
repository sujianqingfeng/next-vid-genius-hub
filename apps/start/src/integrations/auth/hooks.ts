import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useNavigate } from "@tanstack/react-router"
import { useEnhancedMutation } from "~/lib/hooks/useEnhancedMutation"

import { useTranslations } from "../i18n"
import { queryOrpcNext } from "../orpc/next-client"

export function useAuthQuery() {
	return useQuery({
		...queryOrpcNext.auth.me.queryOptions(),
		staleTime: 60 * 1000,
	})
}

type AuthRedirectOptions = {
	redirectTo?: string
	redirectSearch?: Record<string, unknown>
}

export function useLoginMutation(options?: AuthRedirectOptions) {
	const qc = useQueryClient()
	const navigate = useNavigate()
	const t = useTranslations("Auth")

	return useEnhancedMutation(
		queryOrpcNext.auth.login.mutationOptions({
			onSuccess: () => {
				qc.invalidateQueries({ queryKey: queryOrpcNext.auth.me.queryKey() })
				navigate({
					to: options?.redirectTo ?? "/media",
					search: options?.redirectSearch,
					replace: true,
				})
			},
		}),
		{
			successToast: t("loginSuccess"),
			errorToast: ({ error }) =>
				error instanceof Error ? error.message : t("loginError"),
		},
	)
}

export function useSignupMutation(options?: AuthRedirectOptions) {
	const qc = useQueryClient()
	const navigate = useNavigate()
	const t = useTranslations("Auth")

	return useEnhancedMutation(
		queryOrpcNext.auth.signup.mutationOptions({
			onSuccess: () => {
				qc.invalidateQueries({ queryKey: queryOrpcNext.auth.me.queryKey() })
				navigate({
					to: options?.redirectTo ?? "/media",
					search: options?.redirectSearch,
					replace: true,
				})
			},
		}),
		{
			successToast: t("signupSuccess"),
			errorToast: ({ error }) =>
				error instanceof Error ? error.message : t("signupError"),
		},
	)
}

export function useLogoutMutation(options?: AuthRedirectOptions) {
	const qc = useQueryClient()
	const navigate = useNavigate()
	const t = useTranslations("Auth")

	return useEnhancedMutation(
		queryOrpcNext.auth.logout.mutationOptions({
			onSuccess: async () => {
				await qc.invalidateQueries({ queryKey: queryOrpcNext.auth.me.queryKey() })
				navigate({
					to: options?.redirectTo ?? "/login",
					search: options?.redirectSearch,
					replace: true,
				})
			},
		}),
		{
			successToast: t("logoutSuccess"),
			errorToast: ({ error }) =>
				error instanceof Error ? error.message : t("logoutError"),
		},
	)
}
