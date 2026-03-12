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

  // if storage panel exists, keep it in sync
  const sw = document.getElementById("storageWood");
  if (sw) {
    sw.innerText = u.wood || 0;
    document.getElementById("storageStone").innerText = u.stone || 0;
    document.getElementById("storagePlanks").innerText = u.planks || 0;
    const total = (u.wood||0) + (u.stone||0) + (u.planks||0);
    document.getElementById("storageTotal").innerText = total;
  }
}