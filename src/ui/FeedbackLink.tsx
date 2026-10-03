// „Feedback geben“: führt zum Fragebogen aus content/tester.yaml.
// Ohne eingetragene Adresse erscheint nichts.

import { tester } from './tester';

export function FeedbackLink({ className }: { className?: string }) {
  if (tester.feedbackUrl === null) return null;
  return (
    <a className={className ?? 'feedback'} href={tester.feedbackUrl} target="_blank" rel="noopener noreferrer">
      Feedback geben
    </a>
  );
}
