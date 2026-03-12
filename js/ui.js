// ui.js
// -----
// Simple helper to read the current user document and populate the
// various spans on the game screen with up‑to‑date values.

import { getUser } from "./user.js"

let messageContainer = null

export function formatMoney(value){
  return Number(value || 0).toFixed(2)
}

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

  const wood = u.wood || 0
  const stone = u.stone || 0
  const planks = u.planks || 0

  document.getElementById("player").innerText =
    u.username || "Unknown"
  document.getElementById("money").innerText =
    formatMoney(u.money)

  const prodWood = document.getElementById("prodWood")
  if (prodWood) prodWood.innerText = wood
  const prodStone = document.getElementById("prodStone")
  if (prodStone) prodStone.innerText = stone
  const prodPlanks = document.getElementById("prodPlanks")
  if (prodPlanks) prodPlanks.innerText = planks

  // if storage panel exists, keep it in sync
  const storageWood = document.getElementById("storageWood")
  if (storageWood) {
    storageWood.innerText = wood
    document.getElementById("storageStone").innerText = stone
    document.getElementById("storagePlanks").innerText = planks
    const total = wood + stone + planks
    document.getElementById("storageTotal").innerText = total
  }
}