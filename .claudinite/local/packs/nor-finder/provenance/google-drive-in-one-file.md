## 2026-11-06 · born · the page knows Google Drive in one file
- **Source:** owner request on missingbulb/NoRFinder#804: everything to do with Drive in one file,
  the rest of the app unaware of Google but for signing in and the settings it keeps.
- **Reason:** a boundary that outlives any one feature; only a check keeps the next change from
  leaking Drive back out.
- **Actor:** @missingbulb (owner).
- **Model:** claude-opus-5-5
- **Mechanism:** a declared line check over web/ and studies' web/, every file but web/drive.js,
  web/account.js, web/welcome.js and web/config.js; browser keys and cache paths named before the
  rule pass as a constant alone on its line, sign-in words and the Chrome brand pass by name.
- **Rejected:** forbidding only Google hosts, which would let Drive's words, ids and link shapes
  stay spread through the page.
- **Landed:** missingbulb/NoRFinder#804

## 2026-11-06 · strengthened · sign-in and its settings are the identity provider's alone
- **Source:** owner on missingbulb/NoRFinder#804: signing in and the settings kept in the user's
  Drive are one aspect, identity, known only to the identity provider.
- **Reason:** the welcome popup, the menu and the role hint carried Google's words; now only
  web/account.js may.
- **Actor:** @missingbulb (owner).
- **Model:** claude-opus-5-5
- **Mechanism:** the same line check, its exemptions narrowed to web/drive.js and web/account.js
  (web/welcome.js and the sign-in phrases no longer pass).
- **Landed:** missingbulb/NoRFinder#804
