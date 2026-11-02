// The sign-in popup on opening the page (requirement 1.58): Sign in with Google or Continue anonymously, the answer
// kept when the user ticks Remember this choice. A remembered anonymous choice leaves a tip by the avatar instead.
// The popup deletes nothing and stops nothing; offline, its Google button is held like every control that needs
// the network (1.55).
// deps: dialog, the popup; account, the sign-in (1.50); tip(id, anchor, text), a tip the user can close for good.
"use strict";
// {choice: "google" | "anonymous", remember: boolean}, the answer this device gave last
export const WELCOME = "nor-welcome";
const TIP = "Sign in with Google to keep your settings on every device and reach your data files as yourself.";

export function welcome({ dialog, account, avatar, tip }) {
  const $ = (s) => dialog.querySelector(s);
  const read = () => { try { return JSON.parse(localStorage.getItem(WELCOME)) || null; } catch { return null; } };
  const write = (v) => { try { if (v) localStorage.setItem(WELCOME, JSON.stringify(v)); else localStorage.removeItem(WELCOME); } catch { /* private mode: this visit only */ } };
  const choose = (choice) => write({ choice, remember: $("#welcome-remember").checked });

  const reach = () => { if (!document.documentElement.classList.contains("offline")) account.preload(); };
  $("#welcome-google").addEventListener("pointerenter", reach);
  $("#welcome-google").addEventListener("focus", reach);
  $("#welcome-google").onclick = () => { choose("google"); dialog.close(); account.signIn(); };
  $("#welcome-anonymous").onclick = () => { choose("anonymous"); dialog.close(); if (account.signedIn()) account.signOut(); };

  if (!account.offered) return { chose() {}, forgot() {} };
  const was = read(), user = account.user();
  if (was?.remember && (was.choice === "anonymous" || user)) {
    if (was.choice === "anonymous" && !user) tip("sign-in", avatar, TIP);
  } else {
    $("#welcome-who").textContent = user ? `Signed in as ${user.name}.` : "";
    $("#welcome-who").hidden = !user;
    $("#welcome-remember").checked = false;
    dialog.showModal();
  }
  return {
    // the menu's Sign in counts as a remembered choice, its Sign out forgets the choice
    chose() { write({ choice: "google", remember: true }); },
    forgot() { write(null); },
  };
}
