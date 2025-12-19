import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import { cookies } from 'next/headers'
import './globals.css'
import { Toaster } from '~/components/ui/sonner'
import { getValidLocale, LOCALE_COOKIE_NAME } from '~/i18n/config'
import { getMessages, I18nProvider } from '~/lib/i18n'
import { Providers } from './providers'

const geistSans = Geist({
	variable: '--font-geist-sans',
	subsets: ['latin'],
})

const geistMono = Geist_Mono({
	variable: '--font-geist-mono',
	subsets: ['latin'],
})

export const metadata: Metadata = {
	title: 'Next Vid Genius Hub',
	description: 'Video download and processing platform',
}

async function getLocaleAndMessages() {
	const store = await cookies()
	const localeCookie = store.get(LOCALE_COOKIE_NAME)?.value
	const locale = getValidLocale(localeCookie)
	const messages = getMessages(locale)

	return { locale, messages }
}

export default async function RootLayout({
	children,
}: Readonly<{
	children: React.ReactNode
}>) {
	const { locale, messages } = await getLocaleAndMessages()

	return (
		<html lang={locale} suppressHydrationWarning>
			<body
				className={`${geistSans.variable} ${geistMono.variable} antialiased`}
			>
				<I18nProvider locale={locale} messages={messages}>
					<Providers>
						{children}
						<Toaster richColors position="top-right" />
					</Providers>
				</I18nProvider>
			</body>
		</html>
	)
}
