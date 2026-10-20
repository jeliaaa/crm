// Phone numbers reach us in three different shapes:
//   scraped contacts  "595900591", "595 27 71 71", "+995 32 211 44 11"
//   CityNet webhook   "577208418", "995322114411"
// Comparing the last 9 digits — the length of a Georgian national number —
// makes all of them line up. Mirrors phone_key() in
// database/migrate-call-webhook.sql.

export const PHONE_KEY_LENGTH = 9;

export function phoneKey(raw: string | null | undefined): string {
  const digits = (raw ?? '').replace(/\D/g, '');
  return digits.slice(-PHONE_KEY_LENGTH);
}

export function isUsablePhoneKey(key: string): boolean {
  return key.length === PHONE_KEY_LENGTH;
}

// The 9-digit national part of a Georgian number, or null when the value is
// foreign or malformed. Accepts "+995 599677003", "995322114411",
// "0322114411" and the bare "595262105".
function georgianNational(raw: string): string | null {
  const d = raw.replace(/\D/g, '');
  if (d.length === 12 && d.startsWith('995')) return d.slice(3);
  if (d.length === 10 && d.startsWith('0')) return d.slice(1);
  if (d.length === 9 && !raw.trim().startsWith('+')) return d;
  return null;
}

// Mobiles  "+995 5XX XX XX XX"  (595 26 21 05)
// Landline "+995 XX XXX XX XX"  (32 211 44 11)
// Foreign numbers are left exactly as stored. A field can hold several numbers
// separated by commas or semicolons; each one is formatted on its own.
export function formatPhone(raw: string | null | undefined): string {
  if (!raw) return '';
  return raw
    .split(/\s*[,;/]\s*/)
    .map((part) => {
      const n = georgianNational(part);
      if (!n) return part.trim();
      const m = n.startsWith('5')
        ? n.match(/^(\d{3})(\d{2})(\d{2})(\d{2})$/)
        : n.match(/^(\d{2})(\d{3})(\d{2})(\d{2})$/);
      return `+995 ${m!.slice(1).join(' ')}`;
    })
    .filter(Boolean)
    .join(', ');
}

// tel: target for a stored phone value — the first number, in E.164 when it
// is Georgian.
export function phoneHref(raw: string): string {
  const first = raw.split(/[,;/]/)[0];
  const n = georgianNational(first);
  return `tel:${n ? `+995${n}` : first.replace(/[^\d+]/g, '')}`;
}
