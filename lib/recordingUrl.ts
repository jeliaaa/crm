// CityNet percent-encodes the whole recording URL inside the JSON body, so
// "rec" arrives as "https%3A%2F%2Faudio.citynet.ge%2Flisten%2F…". Left alone
// that has no scheme, so a browser treats it as a relative path and resolves
// it against the CRM's own host.
//
// Applied both when storing an event and when rendering a link, so rows saved
// before this existed still produce a working URL.

const ABSOLUTE = /^https?:\/\//i;

export function normalizeRecordingUrl(raw: string | null | undefined): string | null {
  const value = (raw ?? '').trim();
  if (!value) return null;

  let url = value;
  // A couple of passes covers double-encoding (%253A) without letting a
  // filename that legitimately contains a '%' send us round forever.
  for (let i = 0; i < 3 && !ABSOLUTE.test(url); i++) {
    let decoded: string;
    try {
      decoded = decodeURIComponent(url);
    } catch {
      break; // malformed escape — keep what we have
    }
    if (decoded === url) break;
    url = decoded;
  }

  return url;
}

// Only worth linking if a browser will treat it as somewhere to go.
export function isPlayableRecording(url: string | null | undefined): boolean {
  return !!url && ABSOLUTE.test(url);
}
