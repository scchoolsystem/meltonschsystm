// Deliberately not a full CSV parser — contact exports (Google Contacts,
// phone exports, school registers) come in wildly inconsistent column
// layouts. Scanning the whole file for anything shaped like a phone number
// or email address is more robust than assuming a column order, and works
// equally well on .csv, .txt, or a pasted block of text.

export function extractPhones(text: string): string[] {
  const matches = text.match(/(\+?\d[\d\s\-().]{7,}\d)/g) ?? [];
  const cleaned = matches.map((m) => m.replace(/[\s\-().]/g, ""));
  return Array.from(new Set(cleaned.filter(Boolean)));
}

export function extractEmails(text: string): string[] {
  const matches = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) ?? [];
  return Array.from(new Set(matches.map((m) => m.trim().toLowerCase())));
}
