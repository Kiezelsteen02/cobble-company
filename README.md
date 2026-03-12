# Cobble Company

This is a simple browser-based resource-management game built on
Firebase (Authentication + Firestore).

## Project structure

- `index.html` – main HTML page, contains the login form, game UI, and
  a hidden settings panel.  The page loads `js/game.js` as a module.
- `style.css` – basic styling for cards, buttons, tooltips, and layout.

### `js/` modules

- `firebase.js` – initializes Firebase and exports `db` and `auth`.
- `auth.js` – handles login/registration and stores `currentUser` UID.
- `user.js` – helper functions for reading/updating the current user
  document and renaming the user.
- `ui.js` – updates on-screen values based on the fetched user object.
- `production.js` – functions to chop wood, mine stone, and craft planks.
- `market.js` – implements the player-to-player market with listings and
  purchases.
- `game.js` – entry point; hooks UI controls to the above helpers and
  manages screen transitions.

## Comments & explanations

Each `.js` file contains descriptive comments at the top and within
important functions to make the code easier to follow.  Look for `/**`
style comments in the source.

The game communicates with Firestore using simple collections:
- `users/{uid}` stores player state (money, wood, stone, planks, username).
- `market` stores active listings.

### Firestore security rules

To avoid permission errors the rules should allow the app to read
and write the data it needs.  In particular the client performs a
query against `/users` when you attempt to change your name, and that
query will fail with **missing or insufficient permissions** unless the
rules grant read access to all user documents.

A safe set of rules is:
```js
service cloud.firestore {
  match /databases/{database}/documents {
    // let any signed‑in user read user profiles (needed for name check)
    // but only allow them to write their own record.
    match /users/{userId} {
      allow read: if request.auth != null;
      allow write: if request.auth != null
                    && request.auth.uid == userId;
    }

    // market is public for authenticated users
    match /market/{doc} {
      allow read, write: if request.auth != null;
    }
  }
}
```

If you'd rather keep users private, remove the uniqueness query from
`js/user.js` (comment or delete the `getDocs(q)` block); otherwise the
browser cannot check names.  The code already handles permission errors
by showing an alert and skipping the check.

Once your rules are updated you should no longer see the console
message and the new name will persist correctly.

## Development notes

- The settings panel (⚙️) appears after logging in and lets the player
  change their username.
- `game.js` includes basic countdown logic for production buttons.
- Errors from Firestore (e.g. permission issues) are logged to the
  console and optionally shown via alerts, but they no longer crash the
  page.

Feel free to explore, modify, and expand!
