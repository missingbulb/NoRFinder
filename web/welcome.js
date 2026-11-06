// The sign-in popup on opening the page (req/shell/account/welcome): Sign in or Continue anonymously, the answer
// kept when the user ticks Remember this choice. A remembered anonymous choice leaves a tip by the avatar instead.
// The popup deletes nothing and stops nothing; offline, its sign-in button is held like every control that needs
// the network (req/shell/offline/default).
// deps: dialog, the popup; account, the sign-in (req/shell/account/sign-in); tip(id, anchor, text), a tip the user can close for good.
"use strict";
// {choice: the account's kind | "anonymous", remember: boolean}, the answer this device gave last
export const WELCOME = "nor-welcome";

export function welcome({ dialog, account, avatar, tip }) {
  const $ = (s) => dialog.querySelector(s);
  const read = () => { try { return JSON.parse(localStorage.getItem(WELCOME)) || null; } catch { return null; } };
  const write = (v) => { try { if (v) localStorage.setItem(WELCOME, JSON.stringify(v)); else localStorage.removeItem(WELCOME); } catch { /* private mode: this visit only */ } };
  const choose = (choice) => write({ choice, remember: $("#welcome-remember").checked });

  $("#welcome-sign-in").textContent = account.words.signIn;
  $("#welcome-failed").textContent = account.words.failed;
  $("#welcome-offline").textContent = account.words.offline;
  const offline = () => document.documentElement.classList.contains("offline");
  // the sign-in loads as the button is pressed, never on hover or focus, so the click can ask at once
  const reach = () => { if (!offline()) account.preload(); };
  $("#welcome-sign-in").addEventListener("pointerdown", reach);
  $("#welcome-sign-in").addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") reach(); });
  // the popup stays until the sign-in answers; a window cancelled or blocked says so, to try again or go on anonymously
  $("#welcome-sign-in").onclick = () => {
    const remember = $("#welcome-remember").checked;
    $("#welcome-failed").hidden = true;
    account.signIn().then(() => { write({ choice: account.kind, remember }); dialog.close(); },
      () => { $("#welcome-failed").hidden = false; });
  };
  $("#welcome-anonymous").onclick = () => { choose("anonymous"); dialog.close(); if (account.signedIn()) account.signOut(); };

  if (!account.offered) return { chose() {}, forgot() {} };
  const was = read(), user = account.user();
  const stands = was?.remember && (was.choice === "anonymous" ? !user : !!user);
  // signed in and offline, nothing is asked this visit: going on anonymously would leave changes the account has not had
  if (stands || (user && offline())) {
    if (stands && !user) tip("sign-in", avatar, account.words.tip);
  } else {
    $("#welcome-who").textContent = user ? `Signed in as ${user.name}.` : "";
    $("#welcome-who").hidden = !user;
    $("#welcome-remember").checked = false; $("#welcome-failed").hidden = true;
    dialog.showModal();
  }
  return {
    // the menu's Sign in counts as a remembered choice, its Sign out forgets the choice
    chose() { write({ choice: account.kind, remember: true }); },
    forgot() { write(null); },
  };
}
