import { useEffect, useRef, type ReactNode, type FormEvent } from "react";
import { ChevronDown, X, Sprout, ArrowRight } from "lucide-react";
export function Brand() {
  return (
    <a className="brand" href="/" aria-label="Crops home">
      <img src="/crops.svg" alt="" width="34" height="34" />
      <span>
        crops<span className="brand-period">.</span>
      </span>
    </a>
  );
}
export function Select({
  children,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className="select-wrap">
      <select {...props}>{children}</select>
      <ChevronDown size={16} />
    </div>
  );
}
export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}
export function Empty({
  title,
  children,
  action,
}: {
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <Sprout size={32} />
      <h3>{title}</h3>
      <p>{children}</p>
      {action}
    </div>
  );
}
export function PageHeading({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {action}
    </div>
  );
}
export function Modal({
  title,
  children,
  onClose,
  onSubmit,
  submit = "Save changes",
  busy = false,
  error = "",
  footer,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  onSubmit?: (event: FormEvent<HTMLFormElement>) => void;
  submit?: string;
  busy?: boolean;
  error?: string;
  footer?: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const el = ref.current;
    el?.showModal();
    return () => el?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className="modal"
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current && !busy) onClose();
      }}
    >
      <div className="modal-header">
        <h2>{title}</h2>
        <button
          className="icon-button"
          type="button"
          aria-label="Close dialog"
          onClick={onClose}
          disabled={busy}
        >
          <X size={18} />
        </button>
      </div>
      <form onSubmit={onSubmit}>
        <fieldset disabled={busy} className="form-body">
          {children}
        </fieldset>
        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}
        <div className="modal-footer">
          {footer}
          <div className="spacer" />
          <button
            className="button"
            type="button"
            onClick={onClose}
            disabled={busy}
          >
            Cancel
          </button>
          {onSubmit && (
            <button className="button primary" type="submit" disabled={busy}>
              {busy ? "Saving…" : submit}
              <ArrowRight size={16} />
            </button>
          )}
        </div>
      </form>
    </dialog>
  );
}
export function Status({ status }: { status: string }) {
  return (
    <span className={`status ${status}`}>
      {status === "unbilled"
        ? "Unbilled"
        : status === "invoiced"
          ? "Invoiced"
          : status === "paid"
            ? "Paid"
            : status}
    </span>
  );
}
