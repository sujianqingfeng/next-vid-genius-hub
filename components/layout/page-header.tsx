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
	/** 页面描述 */
	description?: string
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
	description,
	rightContent,
	showBackButton = true,
	buttonVariant = 'outline',
	buttonSize = 'sm',
	withBackground = false,
}: PageHeaderProps) {
	const headerContent = (
		<div className="flex items-center justify-between">
			<div className="flex items-center gap-4">
				{showBackButton && (
					<Button variant={buttonVariant} size={buttonSize} asChild>
						<Link href={backHref}>
							<ArrowLeft className="h-4 w-4 mr-2" />
							{backText}
						</Link>
					</Button>
				)}
				{(title || description) && (
					<>
						{showBackButton && <div className="h-6 w-px bg-border" />}
						<div className="space-y-1">
							{title && (
								<h1 className="text-xl font-semibold tracking-tight">
									{title}
								</h1>
							)}
							{description && (
								<p className="text-muted-foreground">{description}</p>
							)}
						</div>
					</>
				)}
			</div>
			{rightContent && (
				<div className="flex items-center gap-3">{rightContent}</div>
			)}
		</div>
	)

	if (withBackground) {
		return (
			<div className="border-b bg-card/50 backdrop-blur supports-[backdrop-filter]:bg-card/50 mb-6">
				<div className="py-6">{headerContent}</div>
			</div>
		)
	}

	return <div className="mb-8">{headerContent}</div>
}
