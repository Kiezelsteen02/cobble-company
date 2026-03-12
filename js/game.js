// game.js
// -------
// Entry point for the client application.  This file wires up UI
// controls to the logic functions exported by the other modules, and
// handles the transition from the login screen to the main game screen.

import { login, register } from "./auth.js"
import { produceWood, produceStone, makePlanks } from "./production.js"
import { sellItem, loadMarket } from "./market.js"
import { changeUsername } from "./user.js"
import { updateUI } from "./ui.js"

/**
 * Called after a successful login/registration.  Hides the auth panel,
 * displays the game panel, reveals the settings button, refreshes the
 * UI, and starts the market listener.
 */
async function startGame(){
  document.getElementById("auth").style.display="none"
  document.getElementById("game").style.display="block"

  // show settings button and hide panel when game starts
  const btn = document.getElementById("settingsBtn");
  if(btn) btn.style.display = "block";
  const panel = document.getElementById("settingsPanel");
  if(panel) panel.style.display = "none";

  // ensure storage button is shown and panel hidden as well
  const storageBtn = document.getElementById("storageBtn");
  if (storageBtn) storageBtn.style.display = "block";
  const storagePanel = document.getElementById("storagePanel");
  if (storagePanel) storagePanel.style.display = "none";

  // attach change-name listener now that currentUser is guaranteed
  const changeBtn = document.getElementById("changeNameBtn");
  if (changeBtn) {
    console.log("attaching changeNameBtn listener");
    changeBtn.addEventListener("click", changeUsername);
  }

  // wire storage panel toggles
  if (storageBtn) {
    storageBtn.addEventListener("click", () => {
      // copy current resource values & show panel + overlay
      document.getElementById("storageWood").textContent =
        document.getElementById("wood").textContent;
      document.getElementById("storageStone").textContent =
        document.getElementById("stone").textContent;
      document.getElementById("storagePlanks").textContent =
        document.getElementById("planks").textContent;
      document.getElementById("storageTotal").textContent =
        Number(document.getElementById("wood").textContent || 0) +
        Number(document.getElementById("stone").textContent || 0) +
        Number(document.getElementById("planks").textContent || 0);

      const panel = document.getElementById("storagePanel");
      if (panel) panel.style.display = "block";
      const overlay = document.getElementById("storageOverlay");
      if (overlay) overlay.style.display = "block";
    });
  }
  const closeStorageBtn = document.getElementById("closeStorageBtn");
  if (closeStorageBtn) {
    closeStorageBtn.addEventListener("click", () => {
      const panel = document.getElementById("storagePanel");
      if (panel) panel.style.display = "none";
      const overlay = document.getElementById("storageOverlay");
      if (overlay) overlay.style.display = "none";
    });
  }

  // clicking overlay also closes the panel
  const overlayEl = document.getElementById("storageOverlay");
  if (overlayEl) {
    overlayEl.addEventListener("click", () => {
      const panel = document.getElementById("storagePanel");
      if (panel) panel.style.display = "none";
      overlayEl.style.display = "none";
    });
  }

  // update UI with user data; catch permission errors so the page still
  // loads even if Firestore rules are misconfigured.
  try {
    await updateUI()
  } catch (err) {
    console.error("Failed to update UI:", err);
  }

  loadMarket()
}



// auth button handlers
document.getElementById("loginBtn").addEventListener("click", async ()=>{
  await login()
  startGame()
})

document.getElementById("registerBtn").addEventListener("click", async ()=>{
  await register()
  startGame()
})



document.getElementById("woodBtn").addEventListener("click", function() {
	const btn = document.getElementById("woodBtn");
		btn.disabled = true;
		btn.classList.add("busy");
		let seconds = 3;
		let countdownSpan = document.createElement("span");
		countdownSpan.className = "countdown";
		countdownSpan.textContent = seconds;
		btn.appendChild(countdownSpan);
		let interval = setInterval(() => {
			seconds--;
			countdownSpan.textContent = seconds;
			if (seconds <= 0) {
				clearInterval(interval);
			}
		}, 1000);
		setTimeout(() => {
			btn.disabled = false;
			btn.classList.remove("busy");
			btn.removeChild(countdownSpan);
			produceWood();
		}, 3000);
});
document.getElementById("stoneBtn").addEventListener("click", function() {
	const btn = document.getElementById("stoneBtn");
		btn.disabled = true;
		btn.classList.add("busy");
		let seconds = 5;
		let countdownSpan = document.createElement("span");
		countdownSpan.className = "countdown";
		countdownSpan.textContent = seconds;
		btn.appendChild(countdownSpan);
		let interval = setInterval(() => {
			seconds--;
			countdownSpan.textContent = seconds;
			if (seconds <= 0) {
				clearInterval(interval);
			}
		}, 1000);
		setTimeout(() => {
			btn.disabled = false;
			btn.classList.remove("busy");
			btn.removeChild(countdownSpan);
			produceStone();
		}, 5000);
});
document.getElementById("plankBtn").addEventListener("click", function() {
	const btn = document.getElementById("plankBtn");
		btn.disabled = true;
		btn.classList.add("busy");
		let seconds = 12;
		let countdownSpan = document.createElement("span");
		countdownSpan.className = "countdown";
		countdownSpan.textContent = seconds;
		btn.appendChild(countdownSpan);
		let interval = setInterval(() => {
			seconds--;
			countdownSpan.textContent = seconds;
			if (seconds <= 0) {
				clearInterval(interval);
			}
		}, 1000);
		setTimeout(() => {
			btn.disabled = false;
			btn.classList.remove("busy");
			btn.removeChild(countdownSpan);
			makePlanks();
		}, 12000);
});

document.getElementById("sellBtn").addEventListener("click",sellItem)

// user/settings listeners
const changeBtn = document.getElementById("changeNameBtn");
if (changeBtn) {
  console.log("attaching changeNameBtn listener");
  changeBtn.addEventListener("click", changeUsername);
}

const settingsBtn = document.getElementById("settingsBtn");
const closeSettingsBtn = document.getElementById("closeSettingsBtn");
if (settingsBtn) {
  settingsBtn.addEventListener("click", () => {
    const panel = document.getElementById("settingsPanel");
    if (panel) {
      panel.style.display = panel.style.display === "block" ? "none" : "block";
    }
  });
}
if (closeSettingsBtn) {
  closeSettingsBtn.addEventListener("click", () => {
    const panel = document.getElementById("settingsPanel");
    if (panel) panel.style.display = "none";
  });
}