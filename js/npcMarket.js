import { db } from "./firebase.js"
import { getUser, updateUser } from "./user.js"
import { updateUI, showMessage } from "./ui.js"

import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  runTransaction
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js"

const BASE_PRICES = {
  wood: 4.00,
  stone: 6.00,
  planks: 15.00
}

const ITEM_ORDER = ["wood", "stone", "planks"]
const UPDATE_INTERVAL_MS = 15 * 60 * 1000
const MAX_PERCENT_CHANGE = 0.05

const npcPrices = { ...BASE_PRICES }
const npcLastUpdates = {
  wood: 0,
  stone: 0,
  planks: 0
}
let npcUnsubscribe = null
let npcTickerId = null
let isSyncing = false

function round2(value){
  return Number(value.toFixed(2))
}

function formatPrice(value){
  return Number(value).toFixed(2)
}

function formatCountdown(ms){
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
}

function randomFactor(){
  // random number in [-0.05, +0.05]
  return 1 + ((Math.random() * 2 - 1) * MAX_PERCENT_CHANGE)
}

function getLastUpdateMs(data){
  if (!data || !data.lastUpdate) return 0

  const raw = data.lastUpdate

  if (typeof raw === "number") return raw
  if (typeof raw.toMillis === "function") return raw.toMillis()

  return Number(raw) || 0
}

function renderNpcPrices(){
  const woodEl = document.getElementById("npcWoodPrice")
  const stoneEl = document.getElementById("npcStonePrice")
  const planksEl = document.getElementById("npcPlanksPrice")

  if (woodEl) woodEl.textContent = formatPrice(npcPrices.wood)
  if (stoneEl) stoneEl.textContent = formatPrice(npcPrices.stone)
  if (planksEl) planksEl.textContent = formatPrice(npcPrices.planks)

  renderNpcCountdown()
}

function getNextRemainingMs(){
  const now = Date.now()
  let remaining = Infinity

  for (const item of ITEM_ORDER) {
    const last = npcLastUpdates[item] || 0
    if (!last) return 0

    const itemRemaining = Math.max(0, UPDATE_INTERVAL_MS - (now - last))
    remaining = Math.min(remaining, itemRemaining)
  }

  if (!Number.isFinite(remaining)) return 0
  return remaining
}

function renderNpcCountdown(){
  const countdownEl = document.getElementById("npcCountdown")
  if (!countdownEl) return

  const remaining = getNextRemainingMs()
  countdownEl.textContent = formatCountdown(remaining)

  countdownEl.classList.remove("countdown-normal", "countdown-warning", "countdown-danger")

  if (remaining <= 10 * 1000) {
    countdownEl.classList.add("countdown-danger")
  } else if (remaining <= 60 * 1000) {
    countdownEl.classList.add("countdown-warning")
  } else {
    countdownEl.classList.add("countdown-normal")
  }
}

async function maybeUpdateItemPrice(item){
  const ref = doc(db, "npc_market", item)

  const effectiveLastUpdate = await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref)
    const now = Date.now()

    if (!snap.exists()) {
      tx.set(ref, {
        price: round2(BASE_PRICES[item]),
        lastUpdate: now
      })
      return now
    }

    const data = snap.data()
    const lastUpdateMs = getLastUpdateMs(data)

    if ((now - lastUpdateMs) < UPDATE_INTERVAL_MS) {
      return lastUpdateMs
    }

    const currentPrice = Number(data.price ?? BASE_PRICES[item])
    let nextPrice = round2(currentPrice * randomFactor())
    if (nextPrice < 0.01) nextPrice = 0.01

    tx.set(ref, {
      price: nextPrice,
      lastUpdate: now
    }, { merge: true })
    return now
  })

  if (effectiveLastUpdate) {
    npcLastUpdates[item] = effectiveLastUpdate
  }
}

async function syncNpcPrices(){
  if (isSyncing) return
  isSyncing = true

  for (const item of ITEM_ORDER) {
    try {
      await maybeUpdateItemPrice(item)
    } catch (err) {
      console.error(`npc price update failed for ${item}`, err)
    }
  }

  isSyncing = false
  renderNpcCountdown()
}

async function loadMissingPrice(item){
  const snap = await getDoc(doc(db, "npc_market", item))
  if (snap.exists()) {
    const p = Number(snap.data().price)
    if (!Number.isNaN(p) && p > 0) {
      npcPrices[item] = round2(p)
    }
  }
}

export async function initNpcMarket(){
  await syncNpcPrices()

  if (!npcUnsubscribe) {
    npcUnsubscribe = onSnapshot(
      collection(db, "npc_market"),
      (snapshot) => {
        snapshot.forEach((d) => {
          const item = d.id
          if (!BASE_PRICES[item]) return

          npcLastUpdates[item] = getLastUpdateMs(d.data())

          const p = Number(d.data().price)
          if (!Number.isNaN(p) && p > 0) {
            npcPrices[item] = round2(p)
          }
        })

        // keep defaults for any missing docs
        for (const item of ITEM_ORDER) {
          if (!npcPrices[item]) npcPrices[item] = BASE_PRICES[item]
        }

        renderNpcPrices()
      },
      (err) => {
        console.error("npc market snapshot error", err)
      }
    )
  }

  if (!npcTickerId) {
    npcTickerId = setInterval(() => {
      renderNpcCountdown()

      if (getNextRemainingMs() <= 0) {
        syncNpcPrices()
      }
    }, 1000)
  }

  renderNpcPrices()
}

export async function sellToNpcMarket(){
  const item = document.getElementById("sellItem").value
  const amount = parseInt(document.getElementById("sellAmount").value)

  if (!amount || amount <= 0) {
    showMessage("Enter a valid amount to sell.", "error")
    return
  }

  await syncNpcPrices()

  if (!npcPrices[item]) {
    await loadMissingPrice(item)
  }

  const unitPrice = round2(npcPrices[item] || BASE_PRICES[item])
  const payout = round2(unitPrice * amount)

  const u = await getUser()
  if (!u) {
    showMessage("Could not load your account. Please re-login.", "error")
    return
  }

  if ((u[item] || 0) < amount) {
    showMessage("Not enough items in storage.", "error")
    return
  }

  u[item] -= amount
  u.money = round2((u.money || 0) + payout)

  await updateUser(u)
  await updateUI()

  showMessage(
    `Sold ${amount} ${item} to NPC for $${formatPrice(payout)} ($${formatPrice(unitPrice)} each).`,
    "info"
  )
}
