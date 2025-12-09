'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Button } from '~/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card'
import { Input } from '~/components/ui/input'
import { Label } from '~/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '~/components/ui/tabs'
import { useAuthQuery, useLoginMutation, useSignupMutation } from '~/lib/auth/hooks'
import { cn } from '~/lib/utils'
import { useTranslations } from 'next-intl'

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
	const [signupNickname, setSignupNickname] = useState('')

	useEffect(() => {
		if (loadingMe) return
		if (me?.user) {
			router.replace(next)
		}
	}, [loadingMe, me?.user, next, router])

	return (
		<div className="min-h-screen bg-gradient-to-br from-background to-secondary/40 flex items-center justify-center px-4 py-10">
			<Card className="w-full max-w-3xl shadow-xl border border-border/50">
				<CardHeader className="space-y-2 text-center">
					<CardTitle className="text-2xl font-semibold text-foreground">
						{t('title')}
					</CardTitle>
					<p className="text-sm text-muted-foreground">
						{t('subtitle')}
					</p>
				</CardHeader>
				<CardContent>
					<Tabs defaultValue="login" className="space-y-4">
						<TabsList className="mx-auto">
							<TabsTrigger value="login">{t('tabs.login')}</TabsTrigger>
							<TabsTrigger value="signup">{t('tabs.signup')}</TabsTrigger>
						</TabsList>

						<TabsContent value="login">
							<form
								onSubmit={(e) => {
									e.preventDefault()
									loginMutation.mutate({ email: loginEmail, password: loginPassword })
								}}
								className="space-y-4"
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
						</TabsContent>

						<TabsContent value="signup">
							<form
								onSubmit={(e) => {
									e.preventDefault()
									signupMutation.mutate({
										email: signupEmail,
										password: signupPassword,
										nickname: signupNickname,
									})
								}}
								className="space-y-4"
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
									<p className="text-xs text-muted-foreground">
										{t('signup.hint')}
									</p>
								</div>
								<Button type="submit" className={cn('w-full')} disabled={signupMutation.isPending}>
									{signupMutation.isPending ? t('signup.submitting') : t('signup.submit')}
								</Button>
							</form>
						</TabsContent>
					</Tabs>
					<div className="mt-6 text-center text-sm text-muted-foreground">
						<Link href="/" className="underline underline-offset-4">
							{t('backHome')}
						</Link>
					</div>
				</CardContent>
			</Card>
		</div>
	)
}
