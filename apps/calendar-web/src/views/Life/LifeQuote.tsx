import { getRandomLifeQuote } from "./life-quotes";

export function LifeQuote() {
  const quote = getRandomLifeQuote();

  return (
    <section className="text-text-muted">
      <blockquote className="italic">{quote}</blockquote>
    </section>
  );
}
