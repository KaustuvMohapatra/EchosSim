export function ToastLayer({ message }: { message?: string | null }) {
  if (!message) return null;
  return <div className="toast-layer" role="status" aria-live="polite">{message}</div>;
}
