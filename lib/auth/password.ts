import { compare, hash } from 'bcryptjs'

const SALT_ROUNDS = 10

export async function hashPassword(password: string) {
	return hash(password, SALT_ROUNDS)
}

export async function verifyPassword(password: string, passwordHash: string) {
	return compare(password, passwordHash)
}
