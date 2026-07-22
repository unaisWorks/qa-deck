// Encodes a card id + filled variable values into shareable ?run=&v= URL
// params — reuses the same URL-param-driven state pattern the page already
// uses for category/search/filters. No backend involved.

export function encodeRunParams(cardId: string, values: Record<string, string>): string {
  const json = JSON.stringify(values);
  const b64 = btoa(unescape(encodeURIComponent(json))); // UTF-8-safe base64
  return `run=${encodeURIComponent(cardId)}&v=${encodeURIComponent(b64)}`;
}

export function decodeRunParams(searchParams: URLSearchParams): { cardId: string; values: Record<string, string> } | null {
  const cardId = searchParams.get("run");
  if (!cardId) return null;
  const v = searchParams.get("v");
  if (!v) return { cardId, values: {} };
  try {
    const json = decodeURIComponent(escape(atob(v)));
    const values = JSON.parse(json);
    return { cardId, values: typeof values === "object" && values !== null ? values : {} };
  } catch {
    return { cardId, values: {} }; // corrupt payload — still open the drawer empty rather than hard-fail
  }
}

export function buildShareUrl(cardId: string, values: Record<string, string>): string {
  if (typeof window === "undefined") return "";
  return `${window.location.origin}${window.location.pathname}?${encodeRunParams(cardId, values)}`;
}
