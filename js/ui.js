// ui.js
// -----
// Simple helper to read the current user document and populate the
// various spans on the game screen with up‑to‑date values.

import { getUser } from "./user.js"

export async function updateUI(){
  let u = await getUser()
  if(!u) return

  document.getElementById("player").innerText =
    u.username || "Unknown"
  document.getElementById("money").innerText =
    u.money || 0
  document.getElementById("wood").innerText =
    u.wood || 0
  document.getElementById("stone").innerText =
    u.stone || 0
  document.getElementById("planks").innerText =
    u.planks || 0
}