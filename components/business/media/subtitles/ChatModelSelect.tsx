'use client'

import { ChatModelIds, type ChatModelId } from '~/lib/ai/models'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/components/ui/select'

interface ChatModelSelectProps {
	value: ChatModelId
	onChange: (model: ChatModelId) => void
	disabled?: boolean
	triggerClassName?: string
	placeholder?: string
}

export function ChatModelSelect({
	value,
	onChange,
	disabled,
	triggerClassName = '',
	placeholder = 'Select model',
}: ChatModelSelectProps) {
	return (
		<Select
			value={value}
			onValueChange={(model) => onChange(model as ChatModelId)}
			disabled={disabled}
		>
			<SelectTrigger className={triggerClassName}>
				<SelectValue placeholder={placeholder} />
			</SelectTrigger>
			<SelectContent>
				{ChatModelIds.map((model) => (
					<SelectItem key={model} value={model}>
						{model}
					</SelectItem>
				))}
			</SelectContent>
		</Select>
	)
}

