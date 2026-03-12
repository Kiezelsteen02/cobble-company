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
- `ui.js` – updates on-screen values and shows in-game bottom-right
  message toasts.
- `production.js` – functions to chop wood, mine stone, and craft planks.
- `market.js` – implements the player-to-player market with listings and
  purchases, listing cancel, and pending payment collection.
- `game.js` – entry point; hooks UI controls to the above helpers and
  manages screen transitions.

## Comments & explanations

Each `.js` file contains descriptive comments at the top and within
important functions to make the code easier to follow.  Look for `/**`
style comments in the source.

The game communicates with Firestore using simple collections:
- `users/{uid}` stores player state (money, wood, stone, planks, username).
- `market` stores active listings.
- `pendingPayments` stores seller payouts created by buyers and collected
  by sellers on next login.

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
    match /market/{docId} {
      allow read, create, delete: if request.auth != null;
    }

    // buyers create pending-payment docs; only the recipient seller
    // can read/delete those docs.
    match /pendingPayments/{docId} {
      allow create: if request.auth != null;
      allow read, delete: if request.auth != null
                           && request.auth.uid == resource.data.sellerUID;
    }
  }
}
```

If you'd rather keep users private, remove the uniqueness query from
`js/user.js` (comment or delete the `getDocs(q)` block); otherwise the
browser cannot check names.  The code already handles permission errors
by showing an alert and skipping the check.

Once your rules are updated, market buys/cancels and username changes
should work without permission errors.

## Development notes

- The settings panel (⚙️) appears after logging in and lets the player
  change their username.
- The old standalone resources card has been removed; resource counts are
  shown in Production labels and in the Storage panel.
- `game.js` includes basic countdown logic for production buttons.
- User feedback now appears as in-game bottom-right messages instead of
  browser alert popups.

Feel free to explore, modify, and expand!
