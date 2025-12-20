'use client'

import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '~/components/ui/select'
import type { ChatModelId } from '~/lib/ai/models'

interface ChatModelSelectProps {
	value: ChatModelId
	onChange: (model: ChatModelId) => void
	models: Array<{ id: ChatModelId; label?: string | null }>
	disabled?: boolean
	triggerClassName?: string
	placeholder?: string
}

export function ChatModelSelect({
	value,
	onChange,
	models,
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
				{models.map((model) => (
					<SelectItem key={model.id} value={model.id}>
						{model.label || model.id}
					</SelectItem>
				))}
			</SelectContent>
		</Select>
	)
}
