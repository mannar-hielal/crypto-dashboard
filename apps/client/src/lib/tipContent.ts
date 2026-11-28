/**
 * The voluntary tip (owner 2026-11-28): the words, the PayPal.Me link and where the footer points.
 * One place, so the whole feature can be changed or removed together.
 */
export const TIP = {
  /** The section's id on the About page, and the footer link's #fragment */
  anchorId: 'tip',
  title: 'Enjoying the app?',
  text: 'You can leave a one-time tip through PayPal. It is voluntary and unlocks nothing: everything here stays free.',
  label: 'Leave a tip with PayPal',
  url: 'https://paypal.me/mannarhielal',
  footerLabel: 'Support the app',
  footerTo: '/about#tip',
} as const;
