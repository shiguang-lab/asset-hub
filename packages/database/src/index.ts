export interface TransactionContext {
  readonly transactionId: string;
}

export interface TransactionManager {
  run<T>(operation: (context: TransactionContext) => Promise<T>): Promise<T>;
}
