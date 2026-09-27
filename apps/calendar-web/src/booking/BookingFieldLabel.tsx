/**
 * A field caption on the Meeting form.
 */
export function BookingFieldLabel({
  children,
  htmlFor,
}: {
  children: string;
  htmlFor?: string;
}) {
  return htmlFor ? (
    <label className="mb-1 block text-sm text-text" htmlFor={htmlFor}>
      {children}
    </label>
  ) : (
    <span className="mb-1 block text-sm text-text">{children}</span>
  );
}
