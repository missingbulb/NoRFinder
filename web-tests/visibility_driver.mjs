// Drives req/shell/study/visibility in headless Chromium against the stand-in Google of stand_in_drive.mjs: the fixture
// study made visible to one account alone, then opened at its address by that account, by another and by no one
// signed in. Exits 1 on a failed check, 2 when it cannot run.
//   node web-tests/visibility_driver.mjs ANSWERS STUDIES ROOT
import fs from "node:fs";
import path from "node:path";
import { standIn } from "./stand_in_drive.mjs";

const [answers, studies, rootDir] = process.argv.slice(2);
const { open, check, done } = await standIn({ answers, studies, rootDir });
const OWNER = "owner@example.com", OTHER = "someone@example.com";
const repo = path.join(import.meta.dirname, "..");
const fixture = { ...JSON.parse(fs.readFileSync(path.join(repo, "studies", "fixture", "study.json"), "utf8")), visibility: { accounts: [OWNER] } };
const listing = [...JSON.parse(fs.readFileSync(studies, "utf8")), { id: "fixture", title: "Fixture", accounts: [OWNER] }];
const prepare = (ctx) => Promise.all([
  ctx.route("**/studies/fixture/study.json", (r) => r.fulfill({ json: fixture })),
  ctx.route("**/web/studies.json", (r) => r.fulfill({ json: listing })),
]);
const seen = (page) => page.evaluate(() => ({
  title: $("#title").textContent.trim(), address: location.pathname,
  offered: [...document.querySelectorAll("#study-list a")].map((a) => a.dataset.id),
  notice: $("#notice").hidden ? "" : $("#notice-text").textContent,
}));
const offers = (page, yes) => page.waitForFunction((y) => [...document.querySelectorAll("#study-list a")].some((a) => a.dataset.id === "fixture") === y, yes);

let page = await open(true, { email: OWNER, prepare });
await offers(page, true);
let s = await seen(page);
await check(s.title === "Fixture" && s.offered.includes("fixture") && !s.notice, "the account the study names opens it at its address, and the switcher offers it", s);
await page.click("#user-menu summary");
await page.click("#sign-out");
await offers(page, false);
s = await seen(page);
await check(!s.offered.includes("fixture"), "signed out, the switcher offers it no more", s);
await page.context().close();

for (const [who, signedIn] of [["another account", true], ["no one signed in", false]]) {
  page = await open(signedIn, { email: OTHER, prepare });
  await page.waitForFunction(() => $("#title").textContent.trim() === "Image Viewer" && !$("#notice").hidden);
  s = await seen(page);
  await check(/shown only to the accounts it names/.test(s.notice) && !s.offered.includes("fixture") && !s.address.endsWith("/fixture"),
    `opened by ${who}, the page says the study is shown only to its accounts, opens the Image Viewer instead and offers it nowhere`, s);
  await page.context().close();
}
await done(0);
