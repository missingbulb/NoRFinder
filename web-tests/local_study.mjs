// A study as one loading from this computer (req/shell/load/from), for a test of the shell that opens its image with
// the computer's file chooser: its study.json served with files.from ["local"], the rest as it is.
export async function localStudy(ctx, id) {
  await ctx.route(`**/studies/${id}/study.json`, async (route) => {
    const r = await route.fetch(), m = await r.json();
    m.files.from = ["local"];
    await route.fulfill({ response: r, body: JSON.stringify(m), contentType: "application/json" });
  });
}
