// ui.js
// -----
// Simple helper to read the current user document and populate the
// various spans on the game screen with up‑to‑date values.

import { getUser } from "./user.js"

let messageContainer = null

function ensureMessageContainer(){
  if (messageContainer) return messageContainer

  messageContainer = document.createElement("div")
  messageContainer.id = "gameMessages"
  document.body.appendChild(messageContainer)

  return messageContainer
}

export function showMessage(text, type = "info"){
  const container = ensureMessageContainer()

  const el = document.createElement("div")
  el.className = `game-message ${type}`
  el.textContent = text

  container.appendChild(el)

  requestAnimationFrame(() => {
    el.classList.add("show")
  })

  setTimeout(() => {
    el.classList.remove("show")
    setTimeout(() => {
      if (el.parentNode) {
        el.parentNode.removeChild(el)
      }
    }, 220)
  }, 3200)
}

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