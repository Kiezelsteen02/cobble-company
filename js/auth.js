// auth.js
// --------
// Handles user authentication (register/login) and keeps track of
// the current Firebase user ID in `currentUser`.
// The module also creates an initial user document when registering.

import { auth, db } from "./firebase.js"

import {
createUserWithEmailAndPassword,
signInWithEmailAndPassword
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js"

import {
doc,
setDoc
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js"

// the UID of the signed-in user; set by login() or register().
export let currentUser = null

/**
 * Register a new player using email/password.
 * Creates a Firestore document with starting resources.
 */
export async function register(){
  let email = document.getElementById("email").value
  let password = document.getElementById("password").value

  const userCredential = await createUserWithEmailAndPassword(auth,email,password)

  currentUser = userCredential.user.uid

  // initialise game state for the new user
  await setDoc(doc(db,"users",currentUser),{
    money:100,
    wood:0,
    stone:0,
    planks:0,
    cityMap:Array(100).fill(null),
    mapBuildingCounts:{
      forest:0,
      mine:0,
      sawmill:0
    }
  })
}

/**
 * Log in an existing user with email/password.
 * After success we only store the UID; game state is read from Firestore.
 */
export async function login(){
  let email = document.getElementById("email").value
  let password = document.getElementById("password").value

  const userCredential = await signInWithEmailAndPassword(auth,email,password)

  currentUser = userCredential.user.uid
}
