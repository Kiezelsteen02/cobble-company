// market.js
// ---------
// Implements a simple player-to-player market where users can post
// listings and buy each other's resources.  Real time updates are
// delivered via Firestore onSnapshot listeners.

import { db } from "./firebase.js"
import { getUser, updateUser } from "./user.js"
import { updateUI } from "./ui.js"
import { currentUser } from "./auth.js"

import {
collection,
addDoc,
onSnapshot,
doc,
getDoc,
setDoc,
deleteDoc
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js"



/**
 * Create a new listing on the market using the values entered in the
 * sell form.  The user's inventory is decremented immediately; the
 * listing is stored in the `market` collection for others to see.
 */
export async function sellItem(){
  let item = document.getElementById("sellItem").value
  let amount = parseInt(document.getElementById("sellAmount").value)
  let price = parseInt(document.getElementById("sellPrice").value)

  let u = await getUser()

  // basic validation
  if(amount <= 0 || price <= 0){
    alert("Invalid amount or price")
    return
  }
  if(u[item] < amount){
    alert("Niet genoeg items")
    return
  }

  u[item] -= amount
  await updateUser(u)

  await addDoc(collection(db,"market"),{
    sellerUID: currentUser,
    sellerName: u.username || "unknown",
    item,
    amount,
    price
  })

  updateUI()
}



export function loadMarket(){

const div = document.getElementById("market")

onSnapshot(collection(db,"market"),
  (snapshot)=>{

  div.innerHTML=""

  snapshot.forEach(d=>{

const o = d.data()

let el = document.createElement("div")
el.className="market-item"

el.innerHTML =
`${o.amount} ${o.item} - $${o.price} (seller ${o.sellerName})`

let b = document.createElement("button")
b.innerText="buy"

b.onclick = ()=>buy(d.id,o)

el.appendChild(b)

div.appendChild(el)

})

},
(err)=>{
  console.error("market snapshot error", err);
}
)

}



export async function buy(id,data){

// voorkomen dat je jezelf koopt
if(data.sellerUID === currentUser){

alert("Je kunt je eigen items niet kopen")

return

}

let u = await getUser()

let total = data.amount * data.price

if(u.money < total){

alert("Not enough money")

return

}

// geld en items aanpassen
u.money -= total
u[data.item] += data.amount

await updateUser(u)



// geld naar verkoper
const sellerRef = doc(db,"users",data.sellerUID)
const sellerSnap = await getDoc(sellerRef)

if(sellerSnap.exists()){

let seller = sellerSnap.data()

seller.money += total

await setDoc(sellerRef,seller)

}



// listing verwijderen
await deleteDoc(doc(db,"market",id))

updateUI()

}