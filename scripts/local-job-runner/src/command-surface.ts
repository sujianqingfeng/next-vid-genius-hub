import type { LocalJobKind } from './contracts'
import { listSupportedKinds } from './dispatch'

export const OPERATIONAL_LOCAL_RUN_COMMANDS = ['status', 'cancel', 'clean'] as const

export type OperationalLocalRunCommand = (typeof OPERATIONAL_LOCAL_RUN_COMMANDS)[number]
export type LocalRunCommand = LocalJobKind | OperationalLocalRunCommand

export function listJobCommands(): LocalJobKind[] {
	return listSupportedKinds()
}

export function listOperationalCommands(): OperationalLocalRunCommand[] {
	return [...OPERATIONAL_LOCAL_RUN_COMMANDS]
}

export function listLocalRunCommands(): LocalRunCommand[] {
	return [...listJobCommands(), ...listOperationalCommands()]
}
