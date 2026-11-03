// A page test working as a Ground Truth Tagger (req/shell/account/role), which only someone signed in may be: the site
// served with a stand-in Google client, a stand-in user signed in with a token for the hour, the welcome popup answered,
// and the role chosen. Google itself is never reached: its requests are turned away, so the settings never sync.
// apiKey turns on loading from Drive, for a test that answers Drive's requests itself.
export async function asTagger(ctx, { apiKey = "" } = {}) {
  await ctx.route(/^https:\/\/[^/]*google(apis)?\.com\//, (r) => r.abort());
  const google = { apiKey, clientId: "acme-tagger.apps.googleusercontent.com" };
  await ctx.route("**/web/config.js", (r) => r.fulfill({ contentType: "text/javascript",
    body: `window.NOR_CONFIG = { google: ${JSON.stringify(google)} };` }));
  await ctx.addInitScript(() => {
    localStorage.setItem("nor-google-sign-in", JSON.stringify({ user: { name: "Acme Tagger", email: "tagger@acme.example", picture: null },
      token: "stand-in-token", until: Date.now() + 3600e3, scopes: "openid email profile https://www.googleapis.com/auth/drive.appdata" }));
    localStorage.setItem("nor-welcome", JSON.stringify({ choice: "google", remember: true }));
    localStorage.setItem("nor-role", "tagger");
  });
}
