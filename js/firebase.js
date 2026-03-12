// firebase.js
// ---------
// Initializes Firebase app and exports configured Auth/Firestore

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyDWnhvx1NVwdZBcINS45ovIQN8xj36_3wY",
  authDomain: "cobble-company-733ac.firebaseapp.com",
  projectId: "cobble-company-733ac"
};

const app = initializeApp(firebaseConfig);

export const db = getFirestore(app);
export const auth = getAuth(app);