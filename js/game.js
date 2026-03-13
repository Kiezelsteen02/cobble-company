// game.js
// -------
// Entry point for the client application.  This file wires up UI
// controls to the logic functions exported by the other modules, and
// handles the transition from the login screen to the main game screen.

import { login, register } from "./auth.js"
import { sellItem, loadMarket, collectPendingPayments } from "./market.js"
import { initNpcMarket, sellToNpcMarket, toggleNpcHistory } from "./npcMarket.js"
import { initTransactionsUI, toggleTransactionsPanel } from "./transactions.js"
import { changeUsername } from "./user.js"
import { updateUI, showMessage, formatMoney } from "./ui.js"
import { initCityMap, startCityMapProduction, toggleBuildingsPanel, toggleGovernmentPanel } from "./cityMap.js"

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
  const transactionsBtn = document.getElementById("transactionsBtn");
  if (transactionsBtn) transactionsBtn.style.display = "inline-block";
  const buildingsBtn = document.getElementById("buildingsBtn");
  if (buildingsBtn) buildingsBtn.style.display = "inline-block";
  const governmentBtn = document.getElementById("governmentBtn");
  if (governmentBtn) governmentBtn.style.display = "inline-block";
  const storagePanel = document.getElementById("storagePanel");
  if (storagePanel) storagePanel.style.display = "none";
  const transactionsPanel = document.getElementById("transactionsPanel");
  if (transactionsPanel) transactionsPanel.style.display = "none";
  const transactionsOverlay = document.getElementById("transactionsOverlay");
  if (transactionsOverlay) transactionsOverlay.style.display = "none";
  const buildingsPanel = document.getElementById("buildingsPanel");
  if (buildingsPanel) buildingsPanel.style.display = "none";
  const buildingsOverlay = document.getElementById("buildingsOverlay");
  if (buildingsOverlay) buildingsOverlay.style.display = "none";
  const governmentPanel = document.getElementById("governmentPanel");
  if (governmentPanel) governmentPanel.style.display = "none";
  const governmentOverlay = document.getElementById("governmentOverlay");
  if (governmentOverlay) governmentOverlay.style.display = "none";

  // attach change-name listener now that currentUser is guaranteed
  const changeBtn = document.getElementById("changeNameBtn");
  if (changeBtn) {
    console.log("attaching changeNameBtn listener");
    changeBtn.addEventListener("click", changeUsername);
  }

  // wire storage panel toggles
  if (storageBtn) {
    storageBtn.addEventListener("click", async () => {
      await updateUI()
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

  const collected = await collectPendingPayments()
  if (collected > 0) {
    showMessage(`You received $${formatMoney(collected)} from sold market listings.`, "info")
  }

  await initNpcMarket()
  initTransactionsUI()
  await initCityMap()
  startCityMapProduction()
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

document.getElementById("sellBtn").addEventListener("click",sellItem)
document.getElementById("sellNpcBtn").addEventListener("click",sellToNpcMarket)
document.getElementById("npcHistoryBtn").addEventListener("click",toggleNpcHistory)
document.getElementById("transactionsBtn").addEventListener("click",toggleTransactionsPanel)
document.getElementById("buildingsBtn").addEventListener("click",toggleBuildingsPanel)
document.getElementById("governmentBtn").addEventListener("click",toggleGovernmentPanel)

const sellPriceInput = document.getElementById("sellPrice")
if (sellPriceInput) {
  sellPriceInput.addEventListener("blur", () => {
    const raw = sellPriceInput.value.trim()
    if (!raw) return

    const numeric = Number(raw)
    if (!Number.isFinite(numeric)) return

    sellPriceInput.value = numeric.toFixed(2)
  })
}

// user/settings listeners
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
