import { MailCheck } from 'lucide-react';
import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { toast } from 'sonner';

import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { AuthShell } from '@/features/auth/AuthShell';
import { authResendVerification } from '@/networks/auth/authNetwork';

/**
 * Shown when sign-in returns EMAIL_NOT_VERIFIED.
 *
 * There is no code to type here. The server verifies through a link
 * (GET /auth/verify?token=…, which returns an HTML page of its own), so all
 * this screen can usefully do is explain that and offer to send another.
 * Resending is throttled to 3 per 15 minutes.
 */
export default function VerifyEmailPage() {
  const location = useLocation();
  const passedEmail = (location.state as { email?: string } | null)?.email ?? '';
  const [email, setEmail] = useState(passedEmail);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const resend = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await authResendVerification(email);
      toast.success('Verification email sent. Check your inbox.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send the email.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell
      title="Verify your email"
      subtitle="Click the link we emailed you, then come back and sign in."
      footer={
        <Link to="/login" className="text-primary hover:underline">
          Back to sign in
        </Link>
      }
    >
      <div className="flex flex-col items-center gap-md text-center">
        <MailCheck className="size-10 text-primary" />
        <p className="text-body-md text-text-secondary">
          Didn&rsquo;t get it? Check your spam folder, or send it again.
        </p>
      </div>

      <form onSubmit={resend} className="mt-lg flex flex-col gap-md">
        <Input
          label="Email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={error}
          required
        />
        <Button type="submit" full disabled={busy || !email}>
          {busy ? 'Sending…' : 'Resend verification email'}
        </Button>
      </form>
    </AuthShell>
  );
}
