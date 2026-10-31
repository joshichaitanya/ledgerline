import { useState } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '../context/AuthContext';
import { useRequireAuth } from '../hooks/useRequireAuth';
import { AuthCard } from '../components/ui/AuthCard';
import { Field } from '../components/ui/Field';
import { Button } from '../components/ui/Button';

export default function ChangePassword() {
  const router = useRouter();
  const { changePassword } = useAuth();
  const { user, ready } = useRequireAuth();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (newPassword !== confirmNewPassword) {
      setError('New passwords do not match');
      return;
    }

    setSubmitting(true);
    try {
      await changePassword({ currentPassword, newPassword });
      // changePassword logs this session out too (every refresh token is
      // revoked server-side on a password change) - send the user to log
      // back in with the new password.
      router.push('/login');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to change password');
    } finally {
      setSubmitting(false);
    }
  }

  if (!ready || !user) {
    return null;
  }

  return (
    <AuthCard title="Change Password" subtitle={`Signed in as ${user.email}`} error={error}>
      <form onSubmit={handleSubmit}>
        <Field
          label="Current Password"
          type="password"
          autoComplete="current-password"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          required
        />
        <Field
          label="New Password"
          type="password"
          autoComplete="new-password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          required
        />
        <Field
          label="Confirm New Password"
          type="password"
          autoComplete="new-password"
          value={confirmNewPassword}
          onChange={(e) => setConfirmNewPassword(e.target.value)}
          required
        />
        <Button type="submit" variant="primary" disabled={isSubmitting}>
          {isSubmitting ? 'Saving...' : 'Change Password'}
        </Button>
      </form>
    </AuthCard>
  );
}
