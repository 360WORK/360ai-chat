import type { ReactNode } from 'react';
import CompanyCard from './cards/CompanyCard';
import TalentCard from './cards/TalentCard';
import { parseInlineCard } from './inline';

function toText(children: ReactNode): string {
  if (typeof children === 'string') {
    return children;
  }
  if (Array.isArray(children)) {
    return children.filter((child): child is string => typeof child === 'string').join('');
  }
  return '';
}

/**
 * Renders the body of a `360ai-card` fenced block as a rich entity card.
 * The wrapper renders inside the markdown `<pre>` element, so it opts out of
 * prose/pre styling (`not-prose`, sans font, normal whitespace). Unparseable
 * bodies (including mid-stream partials) render nothing at all.
 */
export default function InlineCard({ children }: { children: ReactNode }) {
  const parsed = parseInlineCard(toText(children));
  if (parsed === null) {
    return null;
  }
  const folded = parsed.kind === 'company' ? parsed.company.description : parsed.talent.summary;
  const signal = parsed.signal ?? folded;
  return (
    <div className="not-prose my-2 block whitespace-normal font-sans">
      {parsed.kind === 'company' ? (
        <CompanyCard company={parsed.company} />
      ) : (
        <TalentCard talent={parsed.talent} />
      )}
      {signal && <p className="mt-1 line-clamp-2 text-xs text-text-secondary">{signal}</p>}
    </div>
  );
}
