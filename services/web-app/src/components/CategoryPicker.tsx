import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createCategory, createSubcategory, fetchCategories } from '../lib/categories';
import { Category, Subcategory } from '../types/category';
import { Modal } from './ui/Modal';
import { Field } from './ui/Field';
import { Button } from './ui/Button';
import styles from './CategoryPicker.module.css';

// Every <button> here is type="button": this picker renders inside
// TransactionForm's <form>, where a button with no type is a *submit*
// button - picking a category used to submit the whole form.

export function CategoryPicker({
  selected,
  onSelect,
  onClose,
}: {
  selected?: { category: Category; subcategory: Subcategory } | null;
  onSelect: (category: Category, subcategory: Subcategory) => void;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const { data: categories, isLoading } = useQuery({
    queryKey: ['categories'],
    queryFn: fetchCategories,
  });
  // The id, not the object, so the view always reflects the latest cached
  // list - e.g. a subcategory added a moment ago shows up straight away.
  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(null);
  const activeCategory = categories?.find((c) => c.id === activeCategoryId) ?? null;

  function updateCache(update: (old: Category[]) => Category[]) {
    queryClient.setQueryData<Category[]>(['categories'], (old) => (old ? update(old) : old));
  }

  // A new category is opened straight away, ready for its first subcategory.
  const addCategory = useMutation({
    mutationFn: createCategory,
    onSuccess: (category) => {
      updateCache((old) => [...old, category]);
      setActiveCategoryId(category.id);
    },
  });

  // A new subcategory is also selected - that's what the user was here to do.
  const addSubcategory = useMutation({
    mutationFn: ({ categoryId, name }: { categoryId: string; name: string }) => createSubcategory(categoryId, name),
    onSuccess: (subcategory, { categoryId }) => {
      updateCache((old) =>
        old.map((c) => (c.id === categoryId ? { ...c, subcategories: [...c.subcategories, subcategory] } : c))
      );
      const category = categories?.find((c) => c.id === categoryId);
      if (category) onSelect({ ...category, subcategories: [...category.subcategories, subcategory] }, subcategory);
    },
  });

  return (
    <Modal title={activeCategory ? activeCategory.name : 'Select Category'} onClose={onClose}>
      {isLoading && <p>Loading...</p>}

      {activeCategory ? (
        <>
          <button type="button" className={styles.backButton} onClick={() => setActiveCategoryId(null)}>
            ← Back to categories
          </button>
          <div className={styles.grid}>
            {activeCategory.subcategories.map((sub) => {
              const isSelected = selected?.subcategory.id === sub.id;
              return (
                <button
                  type="button"
                  key={sub.id}
                  className={`${styles.item} ${isSelected ? styles.itemSelected : ''}`}
                  onClick={() => onSelect(activeCategory, sub)}
                >
                  {sub.name}
                </button>
              );
            })}
          </div>
          {activeCategory.subcategories.length === 0 && <p className={styles.empty}>No subcategories yet.</p>}
          <AddItem
            key={activeCategory.id}
            label={`New subcategory in ${activeCategory.name}`}
            isPending={addSubcategory.isPending}
            error={addSubcategory.error?.message}
            onAdd={(name) => addSubcategory.mutate({ categoryId: activeCategory.id, name })}
            onEdit={() => addSubcategory.reset()}
          />
        </>
      ) : (
        <>
          <div className={styles.grid}>
            {categories?.map((category) => {
              const isSelected = selected?.category.id === category.id;
              return (
                <button
                  type="button"
                  key={category.id}
                  className={`${styles.item} ${isSelected ? styles.itemSelected : ''}`}
                  onClick={() => setActiveCategoryId(category.id)}
                >
                  {category.name}
                </button>
              );
            })}
          </div>
          {categories && (
            <AddItem
              label="New category"
              isPending={addCategory.isPending}
              error={addCategory.error?.message}
              onAdd={(name) => addCategory.mutate(name)}
              onEdit={() => addCategory.reset()}
            />
          )}
        </>
      )}
    </Modal>
  );
}

// A name input + Add button. Not a <form> of its own: this sits inside
// TransactionForm's <form>, and forms can't nest - so Enter is handled here
// instead of by a submit event (which would submit the outer form).
function AddItem({
  label,
  isPending,
  error,
  onAdd,
  onEdit,
}: {
  label: string;
  isPending: boolean;
  error?: string;
  onAdd: (name: string) => void;
  onEdit: () => void;
}) {
  const [name, setName] = useState('');
  const [localError, setLocalError] = useState<string | undefined>();

  function add() {
    const trimmed = name.trim();
    if (!trimmed) {
      setLocalError('Enter a name');
      return;
    }
    onAdd(trimmed);
  }

  return (
    <div className={styles.addRow}>
      <div className={styles.addField}>
        <Field
          label={label}
          value={name}
          maxLength={100}
          error={localError ?? error}
          onChange={(e) => {
            setName(e.target.value);
            setLocalError(undefined);
            onEdit();
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              add();
            }
          }}
        />
      </div>
      <Button type="button" variant="outline" className={styles.addButton} onClick={add} disabled={isPending}>
        {isPending ? 'Adding...' : 'Add'}
      </Button>
    </div>
  );
}
