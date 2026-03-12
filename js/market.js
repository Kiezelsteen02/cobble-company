// market.js
// ---------
// Full player-to-player World Market:
//   - Sellers post listings; items are deducted from inventory immediately.
//   - Sellers can cancel their own listings; items are refunded.
//   - Buyers can purchase any other player's listing.
//   - Seller income is queued in `pendingPayments` (we cannot write to
//     another player's document directly) and credited on next login.

import { db } from "./firebase.js"
import { getUser, updateUser } from "./user.js"
import { updateUI, showMessage } from "./ui.js"
import { logTransaction } from "./transactions.js"
import { currentUser } from "./auth.js"

import {
  collection,
  addDoc,
  onSnapshot,
  doc,
  query,
  where,
  getDocs,
  deleteDoc,
  runTransaction
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js"

const ITEM_ICON = { wood: "🌲", stone: "🪨", planks: "📦" }


/**
 * Post a new listing on the market.
 * Items are removed from the seller's inventory right away.
 */
export async function sellItem() {
  const item   = document.getElementById("sellItem").value
  const amount = parseInt(document.getElementById("sellAmount").value)
  const price  = Math.round(parseFloat(document.getElementById("sellPrice").value) * 100) / 100

  if (!amount || amount <= 0 || !price || price <= 0) {
    showMessage("Enter a valid amount and price.", "error")
    return
  }

  const u = await getUser()
  if (!u) { showMessage("Could not load your account. Please re-login.", "error"); return }

  if ((u[item] || 0) < amount) {
    showMessage("Not enough items.", "error")
    return
  }

  u[item] -= amount
  await updateUser(u)

  await addDoc(collection(db, "market"), {
    sellerUID:  currentUser,
    sellerName: u.username || "unknown",
    item,
    amount,
    price,
    createdAt: Date.now()
  })

  updateUI()

  await logTransaction({
    type: "market_listed",
    resource: item,
    amount: -amount,
    moneyChange: 0,
    note: `Placed listing at $${price} each`
  })
}


/**
 * Cancel your own listing.
 * The listed items are returned to your inventory.
 */
export async function cancelListing(id, data) {
  const u = await getUser()
  if (!u) { showMessage("Could not load your account.", "error"); return }

  u[data.item] = (u[data.item] || 0) + data.amount
  await updateUser(u)

  await deleteDoc(doc(db, "market", id))
  updateUI()

  await logTransaction({
    type: "market_canceled",
    resource: data.item,
    amount: data.amount,
    moneyChange: 0,
    note: "Canceled own listing"
  })

  showMessage(`Listing canceled. Refunded ${data.amount} ${data.item}.`, "info")
}


/**
 * Buy another player's listing.
 * Buyer money and items are updated immediately.
 * The seller's payment is queued in `pendingPayments` and credited on
 * their next login (avoiding a forbidden cross-user document write).
 */
export async function buy(id, data) {
  if (data.sellerUID === currentUser) {
    showMessage("You cannot buy your own listing.", "error")
    return
  }

  const buyerRef = doc(db, "users", currentUser)
  const marketRef = doc(db, "market", id)
  const total = data.amount * data.price

  try {
    await runTransaction(db, async (tx) => {
      const listingSnap = await tx.get(marketRef)
      if (!listingSnap.exists()) {
        throw new Error("This listing is no longer available.")
      }

      const listing = listingSnap.data()
      if (listing.sellerUID === currentUser) {
        throw new Error("You cannot buy your own listing.")
      }

      const buyerSnap = await tx.get(buyerRef)
      if (!buyerSnap.exists()) {
        throw new Error("Could not load your account. Please re-login.")
      }

      const buyer = buyerSnap.data()
      const total = listing.amount * listing.price

      if ((buyer.money || 0) < total) {
        throw new Error(`Not enough money. You need $${total} but only have $${buyer.money || 0}.`)
      }

      tx.set(buyerRef, {
        money: (buyer.money || 0) - total,
        [listing.item]: (buyer[listing.item] || 0) + listing.amount
      }, { merge: true })

      const paymentRef = doc(collection(db, "pendingPayments"))
      tx.set(paymentRef, {
        sellerUID: listing.sellerUID,
        amount: total
      })

      tx.delete(marketRef)
    })
  } catch (err) {
    console.error("buy failed", err)
    showMessage("Purchase failed: " + err.message, "error")
    return
  }

  updateUI()

  await logTransaction({
    type: "market_bought",
    resource: data.item,
    amount: data.amount,
    moneyChange: -total,
    note: `Bought from player market at $${data.price} each`
  })

  showMessage(`Purchase complete: ${data.amount} ${data.item} bought.`, "info")
}


/**
 * Collect any pending payments waiting for the current user and credit
 * them to their account.  Call once right after login.
 */
export async function collectPendingPayments() {
  const q = query(
    collection(db, "pendingPayments"),
    where("sellerUID", "==", currentUser)
  )

  let snap
  try {
    snap = await getDocs(q)
  } catch (err) {
    console.error("collectPendingPayments failed", err)
    return 0
  }

  if (snap.empty) return 0

  const u = await getUser()
  if (!u) return 0

  let collected = 0

  for (const d of snap.docs) {
    const amount = d.data().amount || 0
    collected += amount
    u.money += amount
    await deleteDoc(doc(db, "pendingPayments", d.id))
  }

  await updateUser(u)
  updateUI()

  await logTransaction({
    type: "market_payout",
    resource: "money",
    amount: 0,
    moneyChange: collected,
    note: "Collected sales payout"
  })

  return collected
}


/**
 * Start a real-time listener for the market and render all active listings.
 * Own listings show a red "Cancel" button.
 * Other players' listings show a green "Buy" button with the total cost.
 */
export function loadMarket() {
  const div = document.getElementById("market")

  onSnapshot(
    collection(db, "market"),
    (snapshot) => {
      div.innerHTML = ""

      if (snapshot.empty) {
        div.innerHTML = "<p style='color:#888;margin:6px 0'>No listings yet.</p>"
        return
      }

      snapshot.forEach(d => {
        const o     = d.data()
        const isOwn = o.sellerUID === currentUser
        const icon  = ITEM_ICON[o.item] || ""
        const total = o.amount * o.price

        const el = document.createElement("div")
        el.className = "market-item"

        const info = document.createElement("span")
        info.innerHTML =
          `${icon} <strong>${o.amount}x ${o.item}</strong> &mdash; ` +
          `$${o.price.toFixed(2)} each &nbsp;<em style="color:#aaa">(total: $${total.toFixed(2)})</em>` +
          `&nbsp;&nbsp;by <strong>${o.sellerName}</strong>` +
          (isOwn ? `&nbsp;<span style="color:#f0a030">(you)</span>` : "")
        el.appendChild(info)

        if (isOwn) {
          const cancelBtn = document.createElement("button")
          cancelBtn.textContent = "Cancel"
          cancelBtn.className = "cancel-btn"
          cancelBtn.onclick = () => cancelListing(d.id, o)
          el.appendChild(cancelBtn)
        } else {
          const buyBtn = document.createElement("button")
          buyBtn.textContent = `Buy ($${total})`
          buyBtn.onclick = async () => {
            if (buyBtn.disabled) return
            buyBtn.disabled = true
            buyBtn.textContent = "Buying..."
            await buy(d.id, o)
            if (document.body.contains(buyBtn)) {
              buyBtn.disabled = false
              buyBtn.textContent = `Buy ($${total})`
            }
          }
          el.appendChild(buyBtn)
        }

        div.appendChild(el)
      })
    },
    (err) => {
      console.error("market snapshot error", err)
    }
  )
}