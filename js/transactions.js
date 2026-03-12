import { db } from "./firebase.js"
import { currentUser } from "./auth.js"

import {
  addDoc,
  collection,
  getDocs,
  orderBy,
  query,
  where
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js"

const TIME_FILTER_MS = {
  hour: 60 * 60 * 1000,
  day: 24 * 60 * 60 * 1000,
  week: 7 * 24 * 60 * 60 * 1000
}

let uiInitialized = false

function transactionsRef(){
  if (!currentUser) return null
  return collection(db, "users", currentUser, "transactions")
}

function formatDate(ms){
  const d = new Date(ms)
  const dd = String(d.getDate()).padStart(2, "0")
  const mm = String(d.getMonth() + 1).padStart(2, "0")
  const hh = String(d.getHours()).padStart(2, "0")
  const mi = String(d.getMinutes()).padStart(2, "0")
  return `${dd}/${mm} ${hh}:${mi}`
}

function formatSignedNumber(value, decimals = 0){
  const n = Number(value || 0)
  const absText = Math.abs(n).toFixed(decimals)
  if (n > 0) return `+${absText}`
  if (n < 0) return `-${absText}`
  return decimals > 0 ? `0.${"0".repeat(decimals)}` : "0"
}

function renderTransactions(items){
  const body = document.getElementById("transactionsBody")
  if (!body) return

  if (!items.length) {
    body.innerHTML = "No transactions found for this filter."
    return
  }

  body.innerHTML = items.map((x) => {
    const amount = Number(x.amount || 0)
    const money = Number(x.moneyChange || 0)

    const resourceText = `${x.resource}: ${formatSignedNumber(amount)}`
    const moneyText = `money: ${formatSignedNumber(money, 2)}`

    return `<div class="tx-row">
      <div class="tx-top">
        <strong>${x.type}</strong>
        <span>${formatDate(x.timestamp)}</span>
      </div>
      <div class="tx-meta">${resourceText} | ${moneyText}</div>
      <div class="tx-note">${x.note || ""}</div>
    </div>`
  }).join("")
}

export async function logTransaction({ type, resource, amount = 0, moneyChange = 0, note = "" }){
  try {
    const ref = transactionsRef()
    if (!ref) return

    await addDoc(ref, {
      type,
      resource,
      amount,
      moneyChange,
      note,
      timestamp: Date.now()
    })
  } catch (err) {
    console.error("logTransaction failed", err)
  }
}

export async function loadTransactions(){
  const body = document.getElementById("transactionsBody")
  const timeFilterEl = document.getElementById("txTimeFilter")
  const resourceFilterEl = document.getElementById("txResourceFilter")

  if (!body || !timeFilterEl || !resourceFilterEl) return

  const ref = transactionsRef()
  if (!ref) {
    body.innerHTML = "Log in to see your transactions."
    return
  }

  body.innerHTML = "Loading transactions..."

  const timeFilter = timeFilterEl.value
  const resourceFilter = resourceFilterEl.value
  const since = Date.now() - (TIME_FILTER_MS[timeFilter] || TIME_FILTER_MS.day)

  try {
    const q = query(
      ref,
      where("timestamp", ">=", since),
      orderBy("timestamp", "desc")
    )

    const snap = await getDocs(q)
    let rows = []

    snap.forEach((d) => {
      const x = d.data()
      rows.push(x)
    })

    if (resourceFilter !== "all") {
      rows = rows.filter((x) => x.resource === resourceFilter)
    }

    renderTransactions(rows)
  } catch (err) {
    console.error("loadTransactions failed", err)
    body.innerHTML = "Could not load transactions."
  }
}

export async function toggleTransactionsPanel(){
  const panel = document.getElementById("transactionsPanel")
  const overlay = document.getElementById("transactionsOverlay")
  const btn = document.getElementById("transactionsBtn")

  if (!panel || !overlay || !btn) return

  const opening = panel.style.display !== "block"

  panel.style.display = opening ? "block" : "none"
  overlay.style.display = opening ? "block" : "none"
  btn.textContent = opening ? "Hide Transactions" : "Transactions"

  if (opening) {
    await loadTransactions()
  }
}

export function initTransactionsUI(){
  if (uiInitialized) return

  const timeFilterEl = document.getElementById("txTimeFilter")
  const resourceFilterEl = document.getElementById("txResourceFilter")
  const closeBtn = document.getElementById("closeTransactionsBtn")
  const overlay = document.getElementById("transactionsOverlay")

  if (timeFilterEl) timeFilterEl.addEventListener("change", loadTransactions)
  if (resourceFilterEl) resourceFilterEl.addEventListener("change", loadTransactions)

  if (closeBtn) {
    closeBtn.addEventListener("click", () => {
      const panel = document.getElementById("transactionsPanel")
      const overlayEl = document.getElementById("transactionsOverlay")
      const btn = document.getElementById("transactionsBtn")

      if (panel) panel.style.display = "none"
      if (overlayEl) overlayEl.style.display = "none"
      if (btn) btn.textContent = "Transactions"
    })
  }

  if (overlay) {
    overlay.addEventListener("click", () => {
      const panel = document.getElementById("transactionsPanel")
      const btn = document.getElementById("transactionsBtn")

      if (panel) panel.style.display = "none"
      overlay.style.display = "none"
      if (btn) btn.textContent = "Transactions"
    })
  }

  uiInitialized = true
}
