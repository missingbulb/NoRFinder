// A page test working as a Ground Truth Tagger (req/shell/account/role), which only someone signed in may be: the site
// served with a stand-in Google client, a stand-in user signed in with a token for the hour, the welcome popup answered,
// and the role chosen. Google itself is never reached: its requests are turned away, so the settings never sync.
// apiKey turns on loading from Drive, for a test that answers Drive's requests itself.
const SUBMISSIONS = "acmegtsubmissions000001";
export async function asTagger(ctx, { apiKey = "" } = {}) {
  await ctx.route(/^https:\/\/[^/]*google(apis)?\.com\//, (r) => r.abort());
  // the store's answers that make the user a tagger (req/shell/data/roles), given in the page's own fetch so no route a
  // test adds after this can turn them away: a study's root holds a submissions folder, the user may write to it alone
  await ctx.addInitScript((subs) => {
    const real = window.fetch, json = (body) => new Response(JSON.stringify(body), { headers: { "content-type": "application/json" } });
    window.fetch = (input, init) => {
      const u = new URL(input instanceof Request ? input.url : String(input), location.href);
      if (u.href.startsWith("https://www.googleapis.com/drive/v3/files")) {
        const fields = u.searchParams.get("fields") || "", q = u.searchParams.get("q") || "";
        if (fields.includes("capabilities")) return Promise.resolve(json({ capabilities: { canAddChildren: u.pathname.endsWith("/" + subs) } }));
        if (/' in parents/.test(q) && q.includes(subs)) return Promise.resolve(json({ files: [] }));
        if (/' in parents/.test(q) && !/thumbnailLink/.test(fields)) return Promise.resolve(json({ files: [{ id: subs, name: "GT submissions", mimeType: "application/vnd.google-apps.folder" }] }));
      }
      return real(input, init);
    };
  }, SUBMISSIONS);
  const google = { apiKey, clientId: "acme-tagger.apps.googleusercontent.com" };
  await ctx.route("**/web/config.js", (r) => r.fulfill({ contentType: "text/javascript",
    body: `window.NOR_CONFIG = { google: ${JSON.stringify(google)} };` }));
  await ctx.addInitScript(() => {
    localStorage.setItem("nor-google-sign-in", JSON.stringify({ user: { name: "Acme Tagger", email: "tagger@acme.example", picture: null },
      token: "stand-in-token", until: Date.now() + 3600e3, scopes: "openid email profile https://www.googleapis.com/auth/drive.appdata https://www.googleapis.com/auth/drive.readonly" }));
    localStorage.setItem("nor-welcome", JSON.stringify({ choice: "google", remember: true }));
    localStorage.setItem("nor-role", "tagger");
  });
}
