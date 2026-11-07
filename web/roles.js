// The role the user works in (req/shell/account/role): the roles they hold in the study on show, the one kept, and
// the menu beside the avatar that names it and lists the rest. Each role is its own view; the shell draws it.
"use strict";

// the browser key the role chosen is kept under, as its name: "viewer" | "tagger" | "data"; absent = "viewer"
export const ROLE = "nor-role";
export const ROLE_NAMES = { viewer: "Viewer", tagger: "Ground Truth Tagger", data: "Data Manager" };

// the roles held, in the menu's order: signedIn, whether anyone is; tagging, whether the study takes Ground Truth
// Taggers and the store lets the user write to its submissions; manager, whether it lets them write to its root
export function held({ signedIn, tagging, manager }) {
  return ["viewer", ...(signedIn && tagging ? ["tagger"] : []), ...(signedIn && manager ? ["data"] : [])];
}
// the role shown: the one kept when it is held, else Viewer
export const shown = (roles, kept) => (roles.includes(kept) ? kept : "viewer");

// menu: the <details>; chose(role): the user picked one
export function roleMenu(menu, chose) {
  const $ = (s) => menu.querySelector(s);
  return {
    // roles held, now the one shown, hint the line under them ("" for none)
    draw(roles, now, hint) {
      $("#role-name").textContent = ROLE_NAMES[now];
      menu.querySelector("summary").title = `Working as ${ROLE_NAMES[now]}: choose a role`;
      $("#role-list").replaceChildren(...roles.map((r) => {
        const b = Object.assign(document.createElement("button"), { type: "button", className: "item", textContent: ROLE_NAMES[r] });
        b.setAttribute("role", "menuitemradio"); b.setAttribute("aria-checked", String(r === now));
        // Data Management works on the remote store: offline it is listed and does nothing
        if (r === "data") b.dataset.needsNetwork = "";
        b.onclick = () => { menu.open = false; if (r !== now) chose(r); };
        return b;
      }));
      $("#role-hint").hidden = !hint; $("#role-hint").textContent = hint;
    },
  };
}
