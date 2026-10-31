import { Transaction } from '../types/transaction';
import { API_GATEWAY_URL } from './api';
import { authFetch } from './authFetch';

// No userId in any request here: every service takes the user from the
// access token authFetch sends (docs/adr/0013-user-id-from-verified-token.md).

export async function fetchMyTransactions(): Promise<Transaction[]> {
  const response = await authFetch(`${API_GATEWAY_URL}/transactions`);

  if (!response.ok) {
    throw new Error(`Failed to fetch transactions: ${response.status}`);
  }

  return response.json();
}

export interface CreateTransactionInput {
  // The logged-in user's id - only used for the local copy put in the React
  // Query cache; the server ignores it and uses the token's user.
  userId: number;
  subCategoryId: string;
  amount: number;
  description: string;
  transactionDate: string;
}

export async function createTransaction(input: CreateTransactionInput): Promise<Transaction> {
  const transaction: Transaction = {
    transactionId: crypto.randomUUID(),
    ...input,
  };

  // Real call to create-transaction-service. The transaction only reaches
  // get-transactions-service after event_store → CDC → Kafka →
  // db-writer-service → transactions-db, so not instantly — the View
  // Transactions page relies on its own React Query cache update to reflect
  // it immediately.
  const response = await authFetch(`${API_GATEWAY_URL}/transactions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify([transaction]),
  });

  if (!response.ok) {
    throw new Error(`Failed to create transaction: ${response.status}`);
  }

  return transaction;
}

export async function updateTransaction(transaction: Transaction): Promise<Transaction> {
  const response = await authFetch(`${API_GATEWAY_URL}/transactions/${transaction.transactionId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(transaction),
  });

  if (!response.ok) {
    throw new Error(`Failed to update transaction: ${response.status}`);
  }

  return transaction;
}

export async function deleteTransaction(transactionId: string): Promise<void> {
  const response = await authFetch(`${API_GATEWAY_URL}/transactions/${transactionId}`, {
    method: 'DELETE',
  });

  if (!response.ok) {
    throw new Error(`Failed to delete transaction: ${response.status}`);
  }
}
