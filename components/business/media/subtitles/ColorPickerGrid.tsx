'use client'

import type { ChangeEventHandler } from 'react'
import { Input } from '~/components/ui/input'
import { Label } from '~/components/ui/label'

interface ColorPickerField {
	id: string
	label: string
	value: string
	onChange: ChangeEventHandler<HTMLInputElement>
}

interface ColorPickerGridProps {
	fields: ColorPickerField[]
	labelClassName?: string
}

export function ColorPickerGrid({ fields, labelClassName = 'text-xs' }: ColorPickerGridProps) {
	return (
		<div className="grid grid-cols-3 gap-2">
			{fields.map((field) => (
				<div key={field.id} className="space-y-1">
					<Label htmlFor={field.id} className={labelClassName}>
						{field.label}
					</Label>
					<Input
						type="color"
						id={field.id}
						value={field.value}
						onChange={field.onChange}
						className="h-8 w-full p-1 cursor-pointer"
					/>
				</div>
			))}
		</div>
	)
}

