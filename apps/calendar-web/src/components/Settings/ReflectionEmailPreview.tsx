import { useId, useState } from "react";

export function ReflectionEmailPreview() {
  const [expanded, setExpanded] = useState(false);
  const previewId = useId();

  return (
    <div>
      <button
        type="button"
        className="c-focus-ring text-accent underline"
        aria-expanded={expanded}
        aria-controls={expanded ? previewId : undefined}
        onClick={() => setExpanded(!expanded)}
      >
        {expanded ? "Hide sample email" : "Preview a sample email"}
      </button>
      {expanded && (
        <article
          id={previewId}
          className="mt-2 space-y-3 rounded border border-border p-4 text-text"
          aria-label="Sample weekly reflection"
        >
          <h3 className="font-semibold">Your weekly review (25)</h3>
          <p>
            <strong>Your past week, Jun 15-21</strong>
            <br />
            Thu, Jun 18 at 6:00 pm: Pottery class
          </p>
          <p>
            <strong>Next week, Jun 22-28</strong>
            <br />
            Tue, Jun 23 at 9:00 am: Coffee with Sam
          </p>
          <p>
            <strong>This time in your life</strong>
            <br />
            2024: First camping trip with Maya
          </p>
          <p>
            <strong>Your life in weeks</strong>
            <br />
            39% done (79-year average)
          </p>
          <a
            className="c-focus-ring text-accent underline"
            href="/sample-life-in-weeks.pdf"
            target="_blank"
            rel="noreferrer"
          >
            Open sample Life in Weeks PDF
            <span className="sr-only"> in a new tab</span>
          </a>
          <p className="text-text-muted">
            Your email includes the PDF when you’ve added your birthday to Life
            view.
          </p>
        </article>
      )}
    </div>
  );
}
