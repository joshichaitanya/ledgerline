import styles from './Button.module.css';

type Variant = 'primary' | 'outline' | 'outlineOnAccent';

export function Button({
  variant = 'outline',
  error,
  danger,
  iconOnly,
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  error?: boolean;
  danger?: boolean;
  iconOnly?: boolean;
}) {
  return (
    <button
      className={`${styles.button} ${styles[variant]} ${error ? styles.error : ''} ${
        danger ? styles.danger : ''
      } ${iconOnly ? styles.iconOnly : ''} ${className || ''}`}
      {...props}
    />
  );
}
