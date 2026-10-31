import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createTransaction, deleteTransaction, fetchMyTransactions, updateTransaction } from '../lib/transactions';
import { fetchCategories, findCategoryBySubcategoryId } from '../lib/categories';
import { isSameDay } from '../lib/formatDate';
import { Transaction } from '../types/transaction';
import { useRequireAuth } from '../hooks/useRequireAuth';
import { useAuth } from '../context/AuthContext';
import { PageHeader } from '../components/PageHeader';
import { Button } from '../components/ui/Button';
import { SummaryPanel } from '../components/ui/SummaryPanel';
import { Modal } from '../components/ui/Modal';
import { DateNav } from '../components/DateNav';
import { TransactionForm, TransactionFormValues } from '../components/TransactionForm';
import tableStyles from '../components/ui/Table.module.css';
import styles from './view-transactions.module.css';

export default function ViewTransactions() {
  const { ready } = useRequireAuth();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { data: transactions, isLoading } = useQuery({
    queryKey: ['my-transactions'],
    queryFn: fetchMyTransactions,
    // Cache is kept in sync manually (setQueryData) by create/edit/delete,
    // so we don't want React Query silently refetching over that on every
    // mount/navigation/window-focus — that would undo the optimistic update.
    staleTime: Infinity,
    enabled: ready,
  });
  const { data: categories } = useQuery({
    queryKey: ['categories'],
    queryFn: fetchCategories,
    enabled: ready,
  });
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [isAdding, setAdding] = useState(false);
  const [selectedDate, setSelectedDate] = useState(new Date());
  // Shown in the role="status" region below, so screen readers announce it
  // (a delete otherwise just makes a card silently disappear).
  const [deleteStatus, setDeleteStatus] = useState<{ message: string; isError: boolean } | null>(null);

  const { mutate: addTransaction, isPending: isAddPending, isError: isAddError } = useMutation({
    mutationFn: createTransaction,
    onSuccess: (transaction) => {
      queryClient.setQueryData<Transaction[]>(['my-transactions'], (old) =>
        old ? [...old, transaction] : [transaction]
      );
      setSelectedDate(new Date(transaction.transactionDate));
      setAdding(false);
    },
  });

  const { mutate: editTransaction, isPending: isEditPending, isError: isEditError } = useMutation({
    mutationFn: updateTransaction,
    onSuccess: (transaction) => {
      queryClient.setQueryData<Transaction[]>(['my-transactions'], (old) =>
        old?.map((t) => (t.transactionId === transaction.transactionId ? transaction : t))
      );
      setEditingTransaction(null);
    },
  });

  const { mutate: removeTransaction } = useMutation({
    mutationFn: ({ transactionId }: { transactionId: string }) => deleteTransaction(transactionId),
    onMutate: () => setDeleteStatus(null),
    onSuccess: (_data, { transactionId }) => {
      queryClient.setQueryData<Transaction[]>(['my-transactions'], (old) =>
        old?.filter((t) => t.transactionId !== transactionId)
      );
      setDeleteStatus({ message: 'Transaction deleted.', isError: false });
    },
    onError: () => {
      setDeleteStatus({ message: "Couldn't delete the transaction. Please try again.", isError: true });
    },
  });

  const dayTransactions = transactions?.filter((t) =>
    isSameDay(new Date(t.transactionDate), selectedDate)
  );
  const total = dayTransactions?.reduce((sum, t) => sum + t.amount, 0) ?? 0;

  function handleDelete(transaction: Transaction) {
    removeTransaction({ transactionId: transaction.transactionId });
  }

  function handleAddSubmit(values: TransactionFormValues) {
    if (!values.selected) return;

    addTransaction({
      // The logged-in account (ADR 0012) - was hardcoded to 1. Only used for
      // the local cache copy; the server takes the user from the token.
      userId: user!.id,
      subCategoryId: values.selected.subcategory.id,
      amount: Number(values.amount),
      description: values.description,
      transactionDate: new Date().toISOString().slice(0, 19),
    });
  }

  function handleEditSubmit(values: TransactionFormValues) {
    if (!editingTransaction || !values.selected) return;

    editTransaction({
      ...editingTransaction,
      subCategoryId: values.selected.subcategory.id,
      amount: Number(values.amount),
      description: values.description,
    });
  }

  const editingInitialValues =
    editingTransaction && categories
      ? {
          amount: String(editingTransaction.amount),
          description: editingTransaction.description,
          selected: findCategoryBySubcategoryId(categories, editingTransaction.subCategoryId),
        }
      : undefined;

  if (!ready) {
    return null;
  }

  return (
    <div>
      <div className={styles.row}>
        <PageHeader title="View Transactions" className={styles.header} />
        <SummaryPanel label="Total Spent on Selected Day" value={`₹${total.toFixed(2)}`} />
      </div>

      <DateNav date={selectedDate} onChange={setSelectedDate} />

      <div className={styles.addRow}>
        <Button variant="primary" onClick={() => setAdding(true)}>
          + Add Transaction
        </Button>
      </div>

      {/* Always rendered (even when empty): a live region must already be on
          the page before its text changes, or screen readers miss the update. */}
      <p role="status" className={`${styles.status} ${deleteStatus?.isError ? styles.statusError : ''}`}>
        {deleteStatus?.message}
      </p>

      {isLoading && <p>Loading...</p>}
      {dayTransactions && (
        <>
          {/* A real list to screen readers ("list, 3 items"), without
              changing the layout the divs already have. */}
          <div className={styles.list} role="list" aria-label="Transactions on the selected day">
            {dayTransactions.map((transaction) => {
              const categoryInfo = categories
                ? findCategoryBySubcategoryId(categories, transaction.subCategoryId)
                : null;

              return (
                <div key={transaction.transactionId} className={styles.card} role="listitem">
                  <div className={styles.cardInfo}>
                    ₹{transaction.amount}
                    <div className={tableStyles.subText}>{transaction.description}</div>
                    <div className={styles.cardCategory}>
                      {categoryInfo
                        ? `${categoryInfo.category.name} / ${categoryInfo.subcategory.name}`
                        : '—'}
                    </div>
                  </div>
                  <div className={styles.cardActions}>
                    <Button
                      variant="outline"
                      iconOnly
                      aria-label="Edit"
                      onClick={() => setEditingTransaction(transaction)}
                    >
                      <PencilIcon />
                    </Button>
                    <Button
                      variant="outline"
                      iconOnly
                      danger
                      aria-label="Delete"
                      onClick={() => handleDelete(transaction)}
                    >
                      <TrashIcon />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
          {dayTransactions.length === 0 && <p>No transactions on this day.</p>}
        </>
      )}

      {editingTransaction && editingInitialValues && (
        <Modal title="Edit Transaction" onClose={() => setEditingTransaction(null)}>
          <TransactionForm
            initialValues={editingInitialValues}
            submitLabel={isEditPending ? 'Saving...' : 'Save'}
            onSubmit={handleEditSubmit}
          />
          {isEditError && (
            <p role="alert" className={styles.statusError}>
              Something went wrong. Please try again.
            </p>
          )}
        </Modal>
      )}

      {isAdding && (
        <Modal title="Add Transaction" onClose={() => setAdding(false)}>
          <TransactionForm
            submitLabel={isAddPending ? 'Adding...' : 'Add'}
            onSubmit={handleAddSubmit}
          />
          {isAddError && (
            <p role="alert" className={styles.statusError}>
              Something went wrong. Please try again.
            </p>
          )}
        </Modal>
      )}
    </div>
  );
}

function PencilIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path
        d="M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path
        d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0-1 14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2L4 6h16z"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
