import { config } from '../config.js';

export async function fetchWalletBalance(studentID: string): Promise<number | null> {
  const url = `${config.walletApiUrl}/wallet/${encodeURIComponent(studentID)}`;
  const res = await fetch(url);
  if (res.status === 404) return null;
  if (!res.ok) {
    throw new Error(`Wallet API returned ${res.status}`);
  }
  const data = (await res.json()) as { balance: number };
  return data.balance;
}