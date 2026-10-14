import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { ERROR_COPY, type MediaError } from '@/lib/media/errors';
import { Alert } from '@/components/ui/primitives';

/** Maps an error code to friendly copy and a next step (spec §10). Never shows raw engine output. */
export function ErrorAlert({ error, action }: { error: MediaError; action?: ReactNode }) {
  const copy = ERROR_COPY[error.code];
  const tone = error.code === 'CANCELLED' ? 'info' : 'danger';
  return (
    <Alert tone={tone} title={copy.title} role="alert" action={action}>
      <p>{error.detail ?? copy.message}</p>
      <p className="mt-1 text-muted">
        {copy.suggestion}
        {error.code === 'CODEC_UNAVAILABLE' && (
          <>
            {' '}
            <Link to="/browser-support" className="text-accent underline underline-offset-2">
              Browser limitations
            </Link>
          </>
        )}
      </p>
    </Alert>
  );
}
