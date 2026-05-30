import bcrypt from 'bcryptjs';
import { randomBytes } from 'node:crypto';

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 10);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

export function generateToken(): string {
  return randomBytes(48).toString('hex');
}