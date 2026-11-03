// Which browser this is, and whether the page supports it (req/shell/browsers/supported): browsers.json names the
// supported ones, each from a major version, on a desktop or laptop computer only.

// {name, version, mobile, os} from a user-agent string; version the major version, null when the string gives none.
// Opera, Samsung Internet and the other Chromium browsers that name themselves are told apart from Chrome; one
// that does not (Brave, Vivaldi) reads as the Chrome it is built on.
export function identify(ua, touchPoints = 0) {
  const major = (re) => { const m = ua.match(re); return m ? Number(m[1]) : null; };
  // iPadOS asks for desktop pages as a Mac; only its touch screen gives it away
  const ipad = /Macintosh/.test(ua) && touchPoints > 1;
  const mobile = ipad || /Mobi|Android|iPhone|iPad|iPod/.test(ua);
  const os = /Windows/.test(ua) ? "Windows" : /Android/.test(ua) ? "Android" : /iPhone|iPad|iPod/.test(ua) || ipad ? "iOS"
    : /Mac OS X|Macintosh/.test(ua) ? "macOS" : /CrOS/.test(ua) ? "ChromeOS" : /Linux/.test(ua) ? "Linux" : "an unknown system";
  const of = (name, re) => ({ name, version: major(re), mobile, os });
  if (/Edg(e|A|iOS)?\//.test(ua)) return of("Edge", /Edg(?:e|A|iOS)?\/(\d+)/);
  if (/OPR\/|Opera/.test(ua)) return of("Opera", /(?:OPR|Opera)\/(\d+)/);
  if (/SamsungBrowser\//.test(ua)) return of("Samsung Internet", /SamsungBrowser\/(\d+)/);
  if (/Firefox\/|FxiOS\//.test(ua)) return of("Firefox", /(?:Firefox|FxiOS)\/(\d+)/);
  if (/CriOS\//.test(ua)) return of("Chrome", /CriOS\/(\d+)/);
  if (/Chrome\/|Chromium\//.test(ua)) return of("Chrome", /(?:Chrome|Chromium)\/(\d+)/);
  if (/Safari\//.test(ua) && /Version\//.test(ua)) return of("Safari", /Version\/(\d+)/);
  return { name: null, version: null, mobile, os };
}

// {ok, why}: why a browser is not supported, in the user's words; ok true when it is
export function verdict(b, supported) {
  const list = supported.map((s) => `${s.name} ${s.from} or later`).join(", ");
  if (b.mobile) return { ok: false, why: `The page is made for a desktop or laptop computer, in ${list}.` };
  const s = supported.find((x) => x.name === b.name);
  if (!s) return { ok: false, why: `${b.name || "This browser"} is not one the page supports: ${list}.` };
  if (b.version == null || b.version < s.from) return { ok: false, why: `This is ${b.name} ${b.version ?? "of an unknown version"}; the page supports ${s.name} ${s.from} or later.` };
  return { ok: true, why: "" };
}
