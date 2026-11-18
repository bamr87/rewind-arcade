import type { AnchorHTMLAttributes, MouseEvent } from 'react';
import { FeedbackButton, openFeedback } from './FeedbackButton';

/**
 * The arcade's wiring of the fleet feedback widget (`public/fleet-feedback.js`, mounted
 * through the kit's React adapter in `FeedbackButton.tsx`, which stays a verbatim copy).
 * Reports become issues on this repo; every label the widget applies exists here.
 */
export const FEEDBACK_REPO = 'bamr87/rewind-arcade';

/** The no-JS twin: the repo's page-feedback issue form, optionally with the page URL filled in. */
export function issueFormUrl(pageUrl?: string): string {
  const query = new URLSearchParams({ template: 'page_feedback.yml', labels: 'page-feedback' });
  if (pageUrl) query.set('url', pageUrl);
  return `https://github.com/${FEEDBACK_REPO}/issues/new?${query}`;
}

function widgetLoaded(): boolean {
  return Boolean((window as unknown as { FleetFeedback?: unknown }).FleetFeedback);
}

/**
 * The widget, mounted once. Its floating button stays off the immersive pages, where a
 * game or an emulator owns the screen and an inline FeedbackLink stands in for it. The
 * widget reads `fab` only when it connects, so switching the button off is a remount.
 */
export function Feedback({ fab, route }: { fab: boolean; route: string }) {
  return (
    <FeedbackButton
      key={fab ? 'fab' : 'inline'}
      repo={FEEDBACK_REPO}
      route={route}
      fab={fab}
      env={import.meta.env.MODE}
      scriptSrc={`${import.meta.env.BASE_URL}fleet-feedback.js`}
    />
  );
}

/**
 * An inline "Improve this page" trigger: a real link to the issue form, which the widget
 * turns into its dialog once it has loaded (`data-fleet-feedback-open`).
 */
export function FeedbackLink({ children, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement>) {
  return (
    <a href={issueFormUrl()} target="_blank" rel="noreferrer" data-fleet-feedback-open="" {...rest}>
      {children}
    </a>
  );
}

/**
 * Click handler for "Report this URL" on the not-found page: the dialog opens pre-typed
 * as a broken page with the missing URL attached. Before the widget loads, the link's
 * own href (the issue form, URL filled in) does the job.
 */
export function reportMissingUrl(e: MouseEvent<HTMLAnchorElement>) {
  if (!widgetLoaded()) return;
  e.preventDefault();
  openFeedback({ type: 'fix-page', extra: `Missing URL: ${window.location.href}` });
}
