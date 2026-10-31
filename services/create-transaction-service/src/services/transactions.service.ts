import { Transaction } from '../types/transaction';
import { TransactionRecorder } from './transaction-recorder.interface';

export class TransactionsService {
  constructor(private recorder: TransactionRecorder) {}

  async processTransactions(transactions: Transaction[]): Promise<number> {
    for (const transaction of transactions) {
      await this.recorder.recordOperation(transaction.transactionId, transaction.userId, 'create', transaction);
    }
    return transactions.length;
  }
}
