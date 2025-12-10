import { ArrowLeft } from 'lucide-react'
import Link from 'next/link'
import { Button } from '~/components/ui/button'

interface PageHeaderProps {
	/** 返回链接的URL */
	backHref: string
	/** 返回按钮的文本 */
	backText?: string
	/** 页面标题 */
	title?: string
	/** 子标题/说明文案 */
	subtitle?: string
	/** 右侧内容 */
	rightContent?: React.ReactNode
	/** 是否显示返回按钮 */
	showBackButton?: boolean
	/** 按钮变体 */
	buttonVariant?: 'ghost' | 'outline' | 'secondary'
	/** 按钮大小 */
	buttonSize?: 'sm' | 'default' | 'lg'
	/** 是否使用背景样式 */
	withBackground?: boolean
}

export function PageHeader({
	backHref,
	backText = 'Back',
	title,
	subtitle,
	rightContent,
	showBackButton = true,
	buttonVariant = 'outline',
	buttonSize = 'sm',
	withBackground = false,
}: PageHeaderProps) {
	const headerContent = (
		<div className="flex items-center justify-between gap-6">
			<div className="flex flex-1 flex-col gap-2">
				<div className="flex items-center gap-4">
					{showBackButton && (
						<Button variant={buttonVariant} size={buttonSize} asChild>
							<Link href={backHref}>
								<ArrowLeft className="mr-2 h-4 w-4" />
								{backText}
							</Link>
						</Button>
					)}
					{title && (
						<>
							{showBackButton && <div className="h-6 w-px bg-border" />}
							<h1 className="text-2xl font-semibold tracking-tight text-foreground">
								{title}
							</h1>
						</>
					)}
				</div>
				{subtitle && (
					<p className="text-sm text-muted-foreground">{subtitle}</p>
				)}
			</div>
			{rightContent && (
				<div className="flex items-center gap-3">{rightContent}</div>
			)}
		</div>
	)

	if (withBackground) {
		return (
			<div className="mb-4 bg-card/50 backdrop-blur supports-[backdrop-filter]:bg-card/50">
				<div className="py-3 px-4">{headerContent}</div>
			</div>
		)
	}

	return <div className="px-4">{headerContent}</div>
}
