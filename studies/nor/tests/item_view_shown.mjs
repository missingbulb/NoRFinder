// A page test that looks at NoR's item view, which the page keeps shelved (req/shell/views/second): its panels
// served with the view taken off the shelf, so the shell gives it its switch as it would any item view.
export async function withItemView(ctx) {
  await ctx.route("**/studies/nor/web/nor.html", async (r) => {
    const res = await r.fetch();
    r.fulfill({ response: res, body: (await res.text()).replace(" data-shelved", "") });
  });
}
