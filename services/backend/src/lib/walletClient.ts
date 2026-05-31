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

export type DebitResult =
  | { ok: true; balance: number }
  | { ok: false; reason: 'insufficient_funds' | 'not_found' | 'wallet_error'; balance?: number };

export async function debitWallet(studentID: string, amount: number): Promise<DebitResult> {
  const url = `${config.walletApiUrl}/wallet/${encodeURIComponent(studentID)}/debit`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ amount }),
  });

  if (res.status === 200) {
    const data = (await res.json()) as { balance: number };
    return { ok: true, balance: data.balance };
  }
  if (res.status === 402) {
    return { ok: false, reason: 'insufficient_funds' };
  }
  if (res.status === 404) {
    return { ok: false, reason: 'not_found' };
  }
  return { ok: false, reason: 'wallet_error' };
}