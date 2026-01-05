'use client'

import { Link, useNavigate } from '@tanstack/react-router'
import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '~/components/ui/button'
import { Input } from '~/components/ui/input'
import { Label } from '~/components/ui/label'
import {
	useAuthQuery,
	useLoginMutation,
	useSignupMutation,
} from '~/lib/features/auth/hooks'
import { useTranslations } from '~/lib/shared/i18n'
import { getDefaultRedirect } from '~/orpc'

export function LoginPage({ searchNext }: { searchNext?: string }) {
	const t = useTranslations('Login')

	const next = useMemo(() => getDefaultRedirect(searchNext), [searchNext])
	const navigate = useNavigate()

	const { data: me, isLoading: loadingMe } = useAuthQuery()
	const loginMutation = useLoginMutation({ redirectTo: next })
	const signupMutation = useSignupMutation({ redirectTo: next })

	const [loginEmail, setLoginEmail] = useState('')
	const [loginPassword, setLoginPassword] = useState('')
	const [signupEmail, setSignupEmail] = useState('')
	const [signupPassword, setSignupPassword] = useState('')
	const [signupConfirmPassword, setSignupConfirmPassword] = useState('')
	const [signupNickname, setSignupNickname] = useState('')
	const [mode, setMode] = useState<'login' | 'signup'>('login')

	useEffect(() => {
		if (loadingMe) return
		if (me?.user) {
			navigate({ to: next, replace: true })
		}
	}, [loadingMe, me?.user, navigate, next])

	return (
		<div className="min-h-screen flex flex-col md:flex-row bg-background text-foreground font-sans">
			<section className="hidden md:flex w-1/2 flex-col justify-between border-r border-border p-12 bg-secondary/5">
				<div className="space-y-8">
					<div className="inline-flex items-center gap-2 border border-border bg-background px-3 py-1">
						<span className="h-2 w-2 bg-foreground" />
						<span className="text-xs font-mono uppercase tracking-wider">
							VidGenius Hub
						</span>
					</div>

					<div className="space-y-4">
						<h1 className="text-4xl font-bold uppercase tracking-tight">
							{t('brand.title')}
						</h1>
						<p className="text-lg text-muted-foreground font-mono">
							{t('brand.subtitle')}
						</p>
					</div>
				</div>

				<div className="space-y-8">
					<ul className="space-y-4 font-mono text-sm">
						<li className="flex items-center gap-4">
							<span className="flex h-6 w-6 items-center justify-center border border-border bg-background text-xs">
								01
							</span>
							<span className="uppercase tracking-wide">
								{t('brand.bullets.processing')}
							</span>
						</li>
						<li className="flex items-center gap-4">
							<span className="flex h-6 w-6 items-center justify-center border border-border bg-background text-xs">
								02
							</span>
							<span className="uppercase tracking-wide">
								{t('brand.bullets.downloads')}
							</span>
						</li>
						<li className="flex items-center gap-4">
							<span className="flex h-6 w-6 items-center justify-center border border-border bg-background text-xs">
								03
							</span>
							<span className="uppercase tracking-wide">
								{t('brand.bullets.subtitles')}
							</span>
						</li>
					</ul>
					<footer className="text-xs text-muted-foreground uppercase tracking-wider border-t border-border pt-8">
						{t('brand.footer')}
					</footer>
				</div>
			</section>

			<section className="flex-1 flex flex-col">
				<div className="flex justify-end p-6 md:p-8">
					<Button
						variant="outline"
						size="sm"
						className="h-8 rounded-none border-border text-xs uppercase tracking-wide"
						asChild
					>
						<Link to="/">{t('backHome')}</Link>
					</Button>
				</div>

				<div className="flex-1 flex items-center justify-center px-4 sm:px-12 lg:px-24">
					<div className="w-full max-w-sm">
						<div className="mb-12 space-y-2">
							<h2 className="text-2xl font-bold uppercase tracking-wide">
								{t('title')}
							</h2>
							<p className="text-sm font-mono text-muted-foreground">
								{t('subtitle')}
							</p>
						</div>

						{mode === 'login' ? (
							<form
								onSubmit={(e) => {
									e.preventDefault()
									loginMutation.mutate({
										email: loginEmail,
										password: loginPassword,
									})
								}}
								className="space-y-6"
							>
								<div className="space-y-2">
									<Label
										htmlFor="login-email"
										className="uppercase text-xs tracking-wider text-muted-foreground"
									>
										{t('login.email')}
									</Label>
									<Input
										id="login-email"
										type="email"
										autoComplete="email"
										required
										value={loginEmail}
										onChange={(e) => setLoginEmail(e.target.value)}
										placeholder="you@example.com"
										className="rounded-none border-border h-10 font-mono text-sm bg-background focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-0"
									/>
								</div>
								<div className="space-y-2">
									<Label
										htmlFor="login-password"
										className="uppercase text-xs tracking-wider text-muted-foreground"
									>
										{t('login.password')}
									</Label>
									<Input
										id="login-password"
										type="password"
										autoComplete="current-password"
										minLength={8}
										required
										value={loginPassword}
										onChange={(e) => setLoginPassword(e.target.value)}
										placeholder={t('login.passwordPlaceholder')}
										className="rounded-none border-border h-10 font-mono text-sm bg-background focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-0"
									/>
								</div>
								<Button
									type="submit"
									className="w-full rounded-none h-10 uppercase tracking-wide text-xs font-bold"
									disabled={loginMutation.isPending}
								>
									{loginMutation.isPending
										? t('login.submitting')
										: t('login.submit')}
								</Button>
							</form>
						) : (
							<form
								onSubmit={(e) => {
									e.preventDefault()
									if (signupPassword !== signupConfirmPassword) {
										toast.error(t('signup.confirmPasswordMismatch'))
										return
									}
									signupMutation.mutate({
										email: signupEmail,
										password: signupPassword,
										nickname: signupNickname,
									})
								}}
								className="space-y-6"
							>
								<div className="space-y-2">
									<Label
										htmlFor="signup-email"
										className="uppercase text-xs tracking-wider text-muted-foreground"
									>
										{t('signup.email')}
									</Label>
									<Input
										id="signup-email"
										type="email"
										autoComplete="email"
										required
										value={signupEmail}
										onChange={(e) => setSignupEmail(e.target.value)}
										placeholder="you@example.com"
										className="rounded-none border-border h-10 font-mono text-sm bg-background focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-0"
									/>
								</div>
								<div className="space-y-2">
									<Label
										htmlFor="signup-nickname"
										className="uppercase text-xs tracking-wider text-muted-foreground"
									>
										{t('signup.nickname')}
									</Label>
									<Input
										id="signup-nickname"
										type="text"
										value={signupNickname}
										onChange={(e) => setSignupNickname(e.target.value)}
										placeholder={t('signup.nicknamePlaceholder')}
										className="rounded-none border-border h-10 font-mono text-sm bg-background focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-0"
									/>
								</div>
								<div className="space-y-2">
									<Label
										htmlFor="signup-password"
										className="uppercase text-xs tracking-wider text-muted-foreground"
									>
										{t('signup.password')}
									</Label>
									<Input
										id="signup-password"
										type="password"
										autoComplete="new-password"
										minLength={8}
										required
										value={signupPassword}
										onChange={(e) => setSignupPassword(e.target.value)}
										placeholder={t('signup.passwordPlaceholder')}
										className="rounded-none border-border h-10 font-mono text-sm bg-background focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-0"
									/>
								</div>
								<div className="space-y-2">
									<Label
										htmlFor="signup-confirm-password"
										className="uppercase text-xs tracking-wider text-muted-foreground"
									>
										{t('signup.confirmPassword')}
									</Label>
									<Input
										id="signup-confirm-password"
										type="password"
										autoComplete="new-password"
										minLength={8}
										required
										value={signupConfirmPassword}
										onChange={(e) => setSignupConfirmPassword(e.target.value)}
										placeholder={t('signup.confirmPasswordPlaceholder')}
										className="rounded-none border-border h-10 font-mono text-sm bg-background focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-0"
									/>
								</div>
								<div className="p-4 border border-border bg-secondary/10">
									<p className="text-xs text-muted-foreground font-mono">
										{t('signup.hint')}
									</p>
								</div>
								<Button
									type="submit"
									className="w-full rounded-none h-10 uppercase tracking-wide text-xs font-bold"
									disabled={signupMutation.isPending}
								>
									{signupMutation.isPending
										? t('signup.submitting')
										: t('signup.submit')}
								</Button>
							</form>
						)}

						<div className="mt-8 pt-6 border-t border-border flex justify-center">
							{mode === 'login' ? (
								<button
									type="button"
									onClick={() => setMode('signup')}
									className="text-xs uppercase tracking-wide text-muted-foreground hover:text-foreground transition-colors"
								>
									{t('switchToSignup')}
								</button>
							) : (
								<button
									type="button"
									onClick={() => setMode('login')}
									className="text-xs uppercase tracking-wide text-muted-foreground hover:text-foreground transition-colors"
								>
									{t('switchToLogin')}
								</button>
							)}
						</div>
					</div>
				</div>
			</section>
		</div>
	)
}

