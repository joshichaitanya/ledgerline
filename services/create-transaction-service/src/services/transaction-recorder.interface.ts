export interface TransactionRecorder {
  connect(): Promise<void>;
  recordOperation(itemId: string, userId: number, operation: 'create', payload: unknown): Promise<void>;
}
