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

  const offline = () => document.documentElement.classList.contains("offline");
  // Google's script loads as the button is pressed, never on hover or focus, so the click can ask at once
  const reach = () => { if (!offline()) account.preload(); };
  $("#welcome-google").addEventListener("pointerdown", reach);
  $("#welcome-google").addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") reach(); });
  // the popup stays until Google answers; a window cancelled or blocked says so, to try again or go on anonymously
  $("#welcome-google").onclick = () => {
    const remember = $("#welcome-remember").checked;
    $("#welcome-failed").hidden = true;
    account.signIn().then(() => { write({ choice: "google", remember }); dialog.close(); },
      () => { $("#welcome-failed").hidden = false; });
  };
  $("#welcome-anonymous").onclick = () => { choose("anonymous"); dialog.close(); if (account.signedIn()) account.signOut(); };

  if (!account.offered) return { chose() {}, forgot() {} };
  const was = read(), user = account.user();
  const stands = was?.remember && (was.choice === "anonymous" ? !user : !!user);
  // signed in and offline, nothing is asked this visit: going on anonymously would leave changes Drive has not had
  if (stands || (user && offline())) {
    if (stands && !user) tip("sign-in", avatar, TIP);
  } else {
    $("#welcome-who").textContent = user ? `Signed in as ${user.name}.` : "";
    $("#welcome-who").hidden = !user;
    $("#welcome-remember").checked = false; $("#welcome-failed").hidden = true;
    dialog.showModal();
  }
  return {
    // the menu's Sign in counts as a remembered choice, its Sign out forgets the choice
    chose() { write({ choice: "google", remember: true }); },
    forgot() { write(null); },
  };
}
