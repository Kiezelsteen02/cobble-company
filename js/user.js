import { db } from "./firebase.js"
import { currentUser } from "./auth.js"
import { updateUI, showMessage } from "./ui.js"

import {
doc,
getDoc,
setDoc,
collection,
query,
where,
getDocs
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js"



/**
 * Fetch the document for the current user.
 * If the userID is missing or rules forbid access, returns null.
 */
export async function getUser(){
  const ref = doc(db,"users",currentUser)
  try {
    const snap = await getDoc(ref)
    if(!snap.exists()) return null
    return snap.data()
  } catch (err) {
    console.error("getUser failed", err)
    // permission errors here usually mean your Firestore rules are too strict.
    // See README or previous chat messages for the recommended security rules.
    return null
  }
}



/**
 * Write the provided object back to Firestore for the current user.
 * The caller is responsible for mutating the object before passing it.
 */
export async function updateUser(data){
  // use merge so we don't accidentally overwrite missing fields
  await setDoc(doc(db,"users",currentUser), data, { merge: true })
}



export async function changeUsername(){
  try {
    console.log("changeUsername called");
    // give immediate visual feedback so user knows the button worked
    let newName = document.getElementById("newUsername").value
    showMessage("Attempting to change name to: " + newName, "info");

if(newName.length < 3){
showMessage("Naam te kort", "error")
return
}

if(newName.length > 16){
showMessage("Naam te lang", "error")
return
}



const q = query(
  collection(db,"users"),
  where("username","==",newName)
)

let querySnapshot = null
try {
  querySnapshot = await getDocs(q)
} catch (err) {
  console.error("username uniqueness check failed", err)
  // permission denied here means Firestore rules don't allow listing
  showMessage("Kan huidige gebruikers niet controleren. Zorg dat Firestore-regels lezen toelaten of verwijder de duplicatiecontrole.", "error")
}

if (querySnapshot && !querySnapshot.empty){
  if (!(querySnapshot.size === 1 && querySnapshot.docs[0].id === currentUser)) {
    showMessage("Naam bestaat al", "error")
    return
  }
}



let u = await getUser()
if (!u) {
  showMessage("Kon gebruiker niet laden – probeer opnieuw inloggen", "error");
  return
}

console.log("user data before update", u);

u.username = newName

try {
  await updateUser(u)
  console.log("updateUser wrote", u);
} catch (err) {
  console.error("updateUser failed", err);
  showMessage("Kon naam niet opslaan: " + err.message, "error");
  return;
}

showMessage("Naam aangepast", "info")
updateUI()
// also update the player span directly, in case updateUI didn't pick
// up the new value immediately
const playerSpan = document.getElementById("player");
if (playerSpan) {
  playerSpan.innerText = newName;
}

// fetch again just to verify persistence
try {
  const after = await getUser();
  console.log("user data after update (re-read)", after);
} catch (err) {
  console.error("re-read failed", err);
}

// close settings panel if visible
const panel = document.getElementById("settingsPanel");
if(panel) panel.style.display = "none";

document.getElementById("newUsername").value = "";
  } catch (err) {
    console.error("unexpected error in changeUsername", err);
    showMessage("Fout bij naam veranderen: " + err.message, "error");
  }
}