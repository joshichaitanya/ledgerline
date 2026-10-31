import { useState } from 'react';
import { Field } from './ui/Field';
import { Button } from './ui/Button';
import { CategoryPicker } from './CategoryPicker';
import { Category, Subcategory } from '../types/category';

export interface TransactionFormValues {
  amount: string;
  description: string;
  selected: { category: Category; subcategory: Subcategory } | null;
}

interface FormErrors {
  category?: string;
  amount?: string;
}

export function TransactionForm({
  initialValues,
  submitLabel = 'Add',
  onSubmit,
}: {
  initialValues?: TransactionFormValues;
  submitLabel?: string;
  onSubmit: (values: TransactionFormValues) => void;
}) {
  const [amount, setAmount] = useState(initialValues?.amount ?? '');
  const [description, setDescription] = useState(initialValues?.description ?? '');
  const [selected, setSelected] = useState<TransactionFormValues['selected']>(
    initialValues?.selected ?? null
  );
  const [isPickerOpen, setPickerOpen] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});

  function validate(): FormErrors {
    const nextErrors: FormErrors = {};

    if (!selected) {
      nextErrors.category = 'Please select a category';
    }

    if (!amount.trim()) {
      nextErrors.amount = 'Amount is required';
    } else {
      const numericAmount = Number(amount);
      if (Number.isNaN(numericAmount)) {
        nextErrors.amount = 'Amount must be a number';
      } else if (numericAmount <= 0) {
        nextErrors.amount = 'Amount must be greater than 0';
      }
    }

    return nextErrors;
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const nextErrors = validate();
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    onSubmit({ amount, description, selected });
  }

  return (
    <form onSubmit={handleSubmit}>
      <div style={{ marginBottom: 8 }}>
        <Button
          type="button"
          variant="outline"
          error={!!errors.category}
          onClick={() => setPickerOpen(true)}
        >
          {selected ? `${selected.category.name} / ${selected.subcategory.name}` : 'Select Category'}
        </Button>
      </div>
      {errors.category && (
        <p style={{ color: 'var(--color-danger)', fontSize: 12, margin: '0 0 20px 0' }}>{errors.category}</p>
      )}
      {!errors.category && <div style={{ marginBottom: 20 }} />}

      <Field
        label="Amount (₹)"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        error={errors.amount}
      />
      <Field
        label="Description (optional)"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
      />

      <Button type="submit" variant="primary">
        {submitLabel}
      </Button>

      {isPickerOpen && (
        <CategoryPicker
          selected={selected}
          onClose={() => setPickerOpen(false)}
          onSelect={(category, subcategory) => {
            setSelected({ category, subcategory });
            setPickerOpen(false);
            setErrors((prev) => ({ ...prev, category: undefined }));
          }}
        />
      )}
    </form>
  );
}
