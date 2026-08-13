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
