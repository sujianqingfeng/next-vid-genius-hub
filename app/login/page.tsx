'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Button } from '~/components/ui/button'
import { Input } from '~/components/ui/input'
import { Label } from '~/components/ui/label'
import { useAuthQuery, useLoginMutation, useSignupMutation } from '~/lib/auth/hooks'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'

export default function LoginPage() {
	const t = useTranslations('Login')
	const searchParams = useSearchParams()
	const router = useRouter()
	const next = useMemo(() => searchParams.get('next') || '/media', [searchParams])

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
			router.replace(next)
		}
	}, [loadingMe, me?.user, next, router])

	return (
		<div className="relative min-h-screen flex bg-gradient-to-br from-sky-50 via-white to-indigo-50">
			<div className="pointer-events-none absolute right-6 top-6 sm:right-10 sm:top-8 z-10 text-xs sm:text-sm text-slate-500">
				<Link
					href="/"
					className="pointer-events-auto underline underline-offset-4 hover:text-slate-900"
				>
					{t('backHome')}
				</Link>
			</div>
			<section className="hidden lg:flex w-1/2 flex-col justify-between border-r border-slate-200/80 bg-white/70 backdrop-blur px-12 py-10 text-slate-900">
				<header className="space-y-3">
					<div className="inline-flex items-center gap-2 rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-medium text-sky-700">
						<span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
						<span>Video Genius Hub</span>
					</div>
					<h1 className="text-3xl font-semibold tracking-tight">
						{t('brand.title')}
					</h1>
					<p className="text-sm text-slate-600">
						{t('brand.subtitle')}
					</p>
				</header>
				<ul className="space-y-3 text-sm text-slate-700">
					<li className="flex items-center gap-2">
						<span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 text-xs">
							1
						</span>
						<span>{t('brand.bullets.processing')}</span>
					</li>
					<li className="flex items-center gap-2">
						<span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-sky-100 text-sky-700 text-xs">
							2
						</span>
						<span>{t('brand.bullets.downloads')}</span>
					</li>
					<li className="flex items-center gap-2">
						<span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-violet-100 text-violet-700 text-xs">
							3
						</span>
						<span>{t('brand.bullets.subtitles')}</span>
					</li>
				</ul>
				<footer className="text-xs text-slate-500">
					{t('brand.footer')}
				</footer>
			</section>

			<section className="flex-1 flex items-center justify-center px-4 py-10">
				<div className="w-full max-w-md">
					<div className="mt-6 space-y-6">
						<header className="space-y-2">
							<h1 className="text-3xl font-semibold tracking-tight text-slate-900">
								{t('title')}
							</h1>
							<p className="text-sm text-slate-600">
								{t('subtitle')}
							</p>
						</header>

						{mode === 'login' ? (
							<form
								onSubmit={(e) => {
									e.preventDefault()
									loginMutation.mutate({ email: loginEmail, password: loginPassword })
								}}
								className="space-y-4 min-h-[320px]"
							>
								<div className="space-y-2">
									<Label htmlFor="login-email">{t('login.email')}</Label>
									<Input
										id="login-email"
										type="email"
										autoComplete="email"
										required
										value={loginEmail}
										onChange={(e) => setLoginEmail(e.target.value)}
										placeholder="you@example.com"
									/>
								</div>
								<div className="space-y-2">
									<Label htmlFor="login-password">{t('login.password')}</Label>
									<Input
										id="login-password"
										type="password"
										autoComplete="current-password"
										minLength={8}
										required
										value={loginPassword}
										onChange={(e) => setLoginPassword(e.target.value)}
										placeholder={t('login.passwordPlaceholder')}
									/>
								</div>
								<Button type="submit" className="w-full" disabled={loginMutation.isPending}>
									{loginMutation.isPending ? t('login.submitting') : t('login.submit')}
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
								className="space-y-4 min-h-[320px]"
							>
								<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
									<div className="space-y-2">
										<Label htmlFor="signup-email">{t('signup.email')}</Label>
										<Input
											id="signup-email"
											type="email"
											autoComplete="email"
											required
											value={signupEmail}
											onChange={(e) => setSignupEmail(e.target.value)}
											placeholder="you@example.com"
										/>
									</div>
									<div className="space-y-2">
										<Label htmlFor="signup-nickname">{t('signup.nickname')}</Label>
										<Input
											id="signup-nickname"
											type="text"
											value={signupNickname}
											onChange={(e) => setSignupNickname(e.target.value)}
											placeholder={t('signup.nicknamePlaceholder')}
										/>
									</div>
								</div>
								<div className="space-y-4">
									<div className="space-y-2">
										<Label htmlFor="signup-password">{t('signup.password')}</Label>
										<Input
											id="signup-password"
											type="password"
											autoComplete="new-password"
											minLength={8}
											required
											value={signupPassword}
											onChange={(e) => setSignupPassword(e.target.value)}
											placeholder={t('signup.passwordPlaceholder')}
										/>
									</div>
									<div className="space-y-2">
										<Label htmlFor="signup-confirm-password">
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
										/>
									</div>
									<p className="text-xs text-slate-500">
										{t('signup.hint')}
									</p>
								</div>
								<Button type="submit" className="w-full" disabled={signupMutation.isPending}>
									{signupMutation.isPending ? t('signup.submitting') : t('signup.submit')}
								</Button>
							</form>
						)}
					</div>

					<div className="mt-6 text-center text-xs text-slate-500">
						{mode === 'login' ? (
							<button
								type="button"
								onClick={() => setMode('signup')}
								className="hover:text-slate-900 underline-offset-4 hover:underline"
							>
								{t('switchToSignup')}
							</button>
						) : (
							<button
								type="button"
								onClick={() => setMode('login')}
								className="hover:text-slate-900 underline-offset-4 hover:underline"
							>
								{t('switchToLogin')}
							</button>
						)}
					</div>
				</div>
			</section>
		</div>
	)
}
