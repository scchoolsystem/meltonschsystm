// A plain `mailto:` link only opens something if the visitor's browser/OS
// has a default mail app registered — many desktop Chrome users and phones
// don't. Opening Gmail's web compose UI in a new tab always works in-browser
// regardless of what (if anything) is configured as the system mail app, so
// every email link on the site should route through this helper instead of
// building `mailto:` hrefs directly.
export function gmailComposeUrl(to: string, subject?: string, body?: string) {
  const params = new URLSearchParams({ view: "cm", fs: "1", to });
  if (subject) params.set("su", subject);
  if (body) params.set("body", body);
  return `https://mail.google.com/mail/?${params.toString()}`;
}
