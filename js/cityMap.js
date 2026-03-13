import { db } from "./firebase.js"
import { currentUser } from "./auth.js"
import { getUser, updateUser } from "./user.js"
import { updateUI, showMessage, formatMoney } from "./ui.js"
import { logTransaction } from "./transactions.js"

import {
  collection,
  doc,
  getDocs,
  onSnapshot,
  query,
  runTransaction,
  setDoc,
  where
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js"

const GRID_SIDE = 20
const MAP_SIZE = GRID_SIDE * GRID_SIDE
const STORAGE_LIMIT = 250
const ROAD_STRIDE = 3
const MAP_COLLECTION = "city_map_cells"
const LEGACY_GRID_SIDE = 10
const UPKEEP_EVERY_PRODUCTIONS = 50

const SPECIAL_CITY_BUILDINGS = [
  {
    id: "town_hall",
    name: "Town Hall",
    label: "🏛️",
    cssClass: "tile-city-building",
    row: 10,
    col: 10,
    comingSoonText: "City services coming soon."
  }
]

const SPECIAL_CITY_BUILDINGS_BY_INDEX = new Map(
  SPECIAL_CITY_BUILDINGS
    .filter((x) => Number.isInteger(x.row) && Number.isInteger(x.col))
    .map((x) => [rowColToIndex(x.row, x.col), x])
)

const BUILDINGS = {
  forest: {
    name: "Forest",
    label: "🌲",
    cssClass: "tile-forest",
    cost: 75,
    upkeepCost: 1.50,
    maxCount: 2,
    intervalMs: 10000,
    produce(u){
      if (totalResources(u) >= STORAGE_LIMIT) return false
      u.wood = (u.wood || 0) + 1
      return true
    }
  },
  mine: {
    name: "Mine",
    label: "🪨",
    cssClass: "tile-mine",
    cost: 120,
    upkeepCost: 2.25,
    maxCount: 2,
    intervalMs: 15000,
    produce(u){
      if (totalResources(u) >= STORAGE_LIMIT) return false
      u.stone = (u.stone || 0) + 1
      return true
    }
  },
  sawmill: {
    name: "Sawmill",
    label: "🪚",
    cssClass: "tile-sawmill",
    cost: 350,
    upkeepCost: 4.00,
    maxCount: 1,
    intervalMs: 20000,
    produce(u){
      if ((u.wood || 0) < 3) return false
      if (totalResources(u) >= STORAGE_LIMIT) return false
      u.wood = (u.wood || 0) - 3
      u.planks = (u.planks || 0) + 1
      return true
    }
  }
}

let cityMapState = Array(MAP_SIZE).fill(null)
let tileTimersMs = Array(MAP_SIZE).fill(0)
let productionLoop = null
let tickBusy = false
let mapUnsubscribe = null
let selectedBuildingIndex = null
let popupTickerId = null
let popupUiInitialized = false
let buildingsPanelUiInitialized = false
let governmentPanelUiInitialized = false

function formatCountdown(ms){
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
}

function emptyCounts(){
  return {
    forest: 0,
    mine: 0,
    sawmill: 0
  }
}

function normalizeCounts(raw){
  const base = emptyCounts()
  if (!raw || typeof raw !== "object") return base

  for (const type of Object.keys(base)) {
    const n = Number(raw[type] || 0)
    base[type] = Number.isFinite(n) && n > 0 ? Math.floor(n) : 0
  }

  return base
}

function totalResources(u){
  return (u.wood || 0) + (u.stone || 0) + (u.planks || 0)
}

function countBuildings(type){
  return cityMapState.reduce((count, x) => {
    if (x && x.ownerUID === currentUser && x.buildingType === type) return count + 1
    return count
  }, 0)
}

function getSelectedBuildingType(){
  const select = document.getElementById("buildingType")
  if (!select) return "forest"
  const value = select.value
  if (value === "delete") return "delete"
  return BUILDINGS[value] ? value : "forest"
}

function indexToRowCol(index){
  return {
    row: Math.floor(index / GRID_SIDE),
    col: index % GRID_SIDE
  }
}

function rowColToIndex(row, col){
  return row * GRID_SIDE + col
}

function isLegacyTopLeftDisplayIndex(displayIndex){
  const { row, col } = indexToRowCol(displayIndex)
  return row < LEGACY_GRID_SIDE && col < LEGACY_GRID_SIDE
}

function legacyIndexToDisplayIndex(legacyIndex){
  if (!Number.isInteger(legacyIndex)) return null
  if (legacyIndex < 0 || legacyIndex >= (LEGACY_GRID_SIDE * LEGACY_GRID_SIDE)) return null

  const row = Math.floor(legacyIndex / LEGACY_GRID_SIDE)
  const col = legacyIndex % LEGACY_GRID_SIDE
  return rowColToIndex(row, col)
}

function displayIndexToStorageDocId(displayIndex){
  if (!Number.isInteger(displayIndex)) return null
  if (displayIndex < 0 || displayIndex >= MAP_SIZE) return null

  if (isLegacyTopLeftDisplayIndex(displayIndex)) {
    const { row, col } = indexToRowCol(displayIndex)
    return String(row * LEGACY_GRID_SIDE + col)
  }

  return `n-${displayIndex}`
}

function columnNumberToLetters(value){
  let n = Number(value)
  if (!Number.isInteger(n) || n <= 0) return "?"

  let out = ""
  while (n > 0) {
    const rem = (n - 1) % 26
    out = String.fromCharCode(65 + rem) + out
    n = Math.floor((n - 1) / 26)
  }

  return out
}

function storageDocIdToDisplayIndex(docId){
  if (typeof docId !== "string") return null

  if (docId.startsWith("n-")) {
    const n = Number(docId.slice(2))
    if (!Number.isInteger(n)) return null
    if (n < 0 || n >= MAP_SIZE) return null
    return n
  }

  const n = Number(docId)
  if (!Number.isInteger(n)) return null

  if (n >= 0 && n < (LEGACY_GRID_SIDE * LEGACY_GRID_SIDE)) {
    return legacyIndexToDisplayIndex(n)
  }

  if (n >= 0 && n < MAP_SIZE) {
    return n
  }

  return null
}

function isPatternRoadIndex(index){
  const row = Math.floor(index / GRID_SIDE)
  const col = index % GRID_SIDE
  return row % ROAD_STRIDE === 0 || col % ROAD_STRIDE === 0
}

function isRoadCell(index){
  return isPatternRoadIndex(index)
}

function getSpecialCityBuilding(index){
  return SPECIAL_CITY_BUILDINGS_BY_INDEX.get(index) || null
}

function applyTileVisual(tileEl, cell, index){
  tileEl.classList.remove("tile-empty", "tile-road", "tile-forest", "tile-mine", "tile-sawmill", "tile-city-building", "tile-own", "tile-other")

  if (!cell) {
    const special = getSpecialCityBuilding(index)
    if (special) {
      tileEl.classList.add(special.cssClass)
      tileEl.textContent = special.label
      tileEl.title = `${special.name} • City Building`
      return
    }

    if (isRoadCell(index)) {
      tileEl.classList.add("tile-road")
      tileEl.textContent = "🛣️"
      tileEl.title = "Road"
      return
    }

    tileEl.classList.add("tile-empty")
    tileEl.textContent = ""
    tileEl.title = "Empty cell"
    return
  }

  const config = BUILDINGS[cell.buildingType]
  if (!config) {
    tileEl.classList.add("tile-empty")
    tileEl.textContent = ""
    tileEl.title = "Empty cell"
    return
  }

  tileEl.classList.add(config.cssClass)
  tileEl.classList.add(cell.ownerUID === currentUser ? "tile-own" : "tile-other")
  tileEl.textContent = config.label

  const ownerLabel = cell.ownerUID === currentUser ? "You" : (cell.ownerName || "Another player")
  tileEl.title = `${config.name} • ${ownerLabel}`
}

function updateBuildingDropdownLabels(){
  const select = document.getElementById("buildingType")
  if (!select) return

  for (const [type, config] of Object.entries(BUILDINGS)) {
    const option = select.querySelector(`option[value="${type}"]`)
    if (!option) continue

    const current = countBuildings(type)
    option.textContent = `${config.name} ($${formatMoney(config.cost)}, ${current}/${config.maxCount})`
  }
}

function updateProductionRatesUI(){
  const woodRateEl = document.getElementById("prodWoodRate")
  const stoneRateEl = document.getElementById("prodStoneRate")
  const planksRateEl = document.getElementById("prodPlanksRate")
  if (!woodRateEl || !stoneRateEl || !planksRateEl) return

  let woodPerMinute = 0
  let stonePerMinute = 0
  let planksPerMinute = 0

  for (let i = 0; i < MAP_SIZE; i++) {
    const cell = cityMapState[i]
    if (!cell || cell.ownerUID !== currentUser || cell.isPaused) continue

    const level = Number(cell.level || 1)
    if (!Number.isFinite(level) || level <= 0) continue

    if (cell.buildingType === "forest") {
      woodPerMinute += 6 * level
    } else if (cell.buildingType === "mine") {
      stonePerMinute += 4 * level
    } else if (cell.buildingType === "sawmill") {
      woodPerMinute -= 9 * level
      planksPerMinute += 3 * level
    }
  }

  woodRateEl.textContent = woodPerMinute.toFixed(2)
  stoneRateEl.textContent = stonePerMinute.toFixed(2)
  planksRateEl.textContent = planksPerMinute.toFixed(2)
}

function renderCityMap(){
  const grid = document.getElementById("cityMapGrid")
  if (!grid) return

  const tiles = grid.children
  for (let i = 0; i < MAP_SIZE; i++) {
    const tile = tiles[i]
    if (!tile) continue
    applyTileVisual(tile, cityMapState[i], i)
  }

  updateBuildingDropdownLabels()
  updateProductionRatesUI()
  renderBuildingsPanel()
  renderGovernmentPanel()
  renderBuildingPopup()
}

function getOwnedBuildingEntries(){
  const rows = []

  for (let index = 0; index < MAP_SIZE; index++) {
    const cell = cityMapState[index]
    if (!cell || cell.ownerUID !== currentUser) continue

    const cfg = BUILDINGS[cell.buildingType]
    if (!cfg) continue

    const { row, col } = indexToRowCol(index)
    rows.push({
      index,
      name: cfg.name,
      coordinate: `X:${columnNumberToLetters(col + 1)}, Y:${row + 1}`,
      upkeepCost: Number(cell.upkeepCost ?? cfg.upkeepCost ?? 0),
      isPaused: Boolean(cell.isPaused)
    })
  }

  return rows
}

function renderBuildingsPanel(){
  const panel = document.getElementById("buildingsPanel")
  const body = document.getElementById("buildingsListBody")
  const totalEl = document.getElementById("buildingsTotalUpkeep")
  if (!panel || !body || !totalEl) return

  if (panel.style.display !== "block") return

  const rows = getOwnedBuildingEntries()
  const total = rows.reduce((sum, x) => sum + x.upkeepCost, 0)
  totalEl.textContent = formatMoney(total)

  if (!rows.length) {
    body.innerHTML = "No buildings found."
    return
  }

  body.innerHTML = rows.map((x) => {
    return `<div class="building-row">
      <div>
        <div><strong>${x.name}</strong> (${x.coordinate})</div>
        <div class="building-meta">Upkeep: $${formatMoney(x.upkeepCost)} | ${x.isPaused ? "Paused" : "Running"}</div>
      </div>
      <button class="building-toggle-btn" data-index="${x.index}">${x.isPaused ? "Start" : "Pause"}</button>
    </div>`
  }).join("")
}

function closeBuildingsPanel(){
  const panel = document.getElementById("buildingsPanel")
  const overlay = document.getElementById("buildingsOverlay")
  const btn = document.getElementById("buildingsBtn")

  if (panel) panel.style.display = "none"
  if (overlay) overlay.style.display = "none"
  if (btn) btn.textContent = "Buildings"
}

function getGovernmentBuildingEntries(){
  return SPECIAL_CITY_BUILDINGS
    .filter((x) => Number.isInteger(x.row) && Number.isInteger(x.col))
    .map((x) => {
      return {
        id: x.id,
        name: x.name,
        coordinate: `X:${columnNumberToLetters(x.col + 1)}, Y:${x.row + 1}`,
        description: x.comingSoonText || "Interaction coming soon."
      }
    })
}

function renderGovernmentPanel(){
  const panel = document.getElementById("governmentPanel")
  const body = document.getElementById("governmentListBody")
  if (!panel || !body) return

  if (panel.style.display !== "block") return

  const rows = getGovernmentBuildingEntries()
  if (!rows.length) {
    body.innerHTML = "No government buildings found."
    return
  }

  body.innerHTML = rows.map((x) => {
    return `<div class="government-row">
      <div>
        <div><strong>${x.name}</strong> (${x.coordinate})</div>
        <div class="government-meta">${x.description}</div>
      </div>
      <button class="government-interact-btn" data-id="${x.id}">Interact</button>
    </div>`
  }).join("")
}

function closeGovernmentPanel(){
  const panel = document.getElementById("governmentPanel")
  const overlay = document.getElementById("governmentOverlay")
  const btn = document.getElementById("governmentBtn")

  if (panel) panel.style.display = "none"
  if (overlay) overlay.style.display = "none"
  if (btn) btn.textContent = "Government"
}

function interactWithGovernmentBuilding(buildingId){
  const target = SPECIAL_CITY_BUILDINGS.find((x) => x.id === buildingId)
  if (!target) {
    showMessage("This government building is unavailable right now.", "error")
    return
  }

  showMessage(`${target.name}: ${target.comingSoonText || "Interaction coming soon."}`)
}

export function toggleGovernmentPanel(){
  const panel = document.getElementById("governmentPanel")
  const overlay = document.getElementById("governmentOverlay")
  const btn = document.getElementById("governmentBtn")
  if (!panel || !overlay || !btn) return

  const opening = panel.style.display !== "block"
  panel.style.display = opening ? "block" : "none"
  overlay.style.display = opening ? "block" : "none"
  btn.textContent = opening ? "Hide Government" : "Government"

  if (opening) renderGovernmentPanel()
}

export function toggleBuildingsPanel(){
  const panel = document.getElementById("buildingsPanel")
  const overlay = document.getElementById("buildingsOverlay")
  const btn = document.getElementById("buildingsBtn")
  if (!panel || !overlay || !btn) return

  const opening = panel.style.display !== "block"
  panel.style.display = opening ? "block" : "none"
  overlay.style.display = opening ? "block" : "none"
  btn.textContent = opening ? "Hide Buildings" : "Buildings"

  if (opening) renderBuildingsPanel()
}

function ensureMapAxisBuilt(){
  const leftAxis = document.getElementById("cityMapLeftAxis")
  if (leftAxis && leftAxis.children.length !== GRID_SIDE) {
    leftAxis.innerHTML = ""
    for (let row = 0; row < GRID_SIDE; row++) {
      const label = document.createElement("div")
      label.className = "city-map-axis-label"
      label.textContent = String(row + 1)
      leftAxis.appendChild(label)
    }
  }

  const topAxis = document.getElementById("cityMapTopAxis")
  if (topAxis && topAxis.children.length !== GRID_SIDE) {
    topAxis.innerHTML = ""
    for (let col = 0; col < GRID_SIDE; col++) {
      const label = document.createElement("div")
      label.className = "city-map-axis-label"
      label.textContent = String.fromCharCode(65 + col)
      topAxis.appendChild(label)
    }
  }
}

function closeBuildingPopup(){
  const panel = document.getElementById("buildingInfoPanel")
  const overlay = document.getElementById("buildingInfoOverlay")

  if (panel) panel.style.display = "none"
  if (overlay) overlay.style.display = "none"

  selectedBuildingIndex = null

  if (popupTickerId) {
    clearInterval(popupTickerId)
    popupTickerId = null
  }
}

function renderBuildingPopup(){
  if (selectedBuildingIndex === null) return

  const panel = document.getElementById("buildingInfoPanel")
  if (!panel || panel.style.display !== "block") return

  const cell = cityMapState[selectedBuildingIndex]
  if (!cell || cell.ownerUID !== currentUser) {
    closeBuildingPopup()
    return
  }

  const config = BUILDINGS[cell.buildingType]
  if (!config) {
    closeBuildingPopup()
    return
  }

  const nameEl = document.getElementById("buildingInfoName")
  const ownerEl = document.getElementById("buildingInfoOwner")
  const coordinateEl = document.getElementById("buildingInfoCoordinate")
  const levelEl = document.getElementById("buildingInfoLevel")
  const upkeepEl = document.getElementById("buildingInfoUpkeep")
  const upkeepProgressEl = document.getElementById("buildingInfoUpkeepProgress")
  const timerEl = document.getElementById("buildingInfoTimer")
  const toggleBtn = document.getElementById("toggleBuildingProductionBtn")

  const { row, col } = indexToRowCol(selectedBuildingIndex)

  if (nameEl) nameEl.textContent = config.name
  if (ownerEl) ownerEl.textContent = cell.ownerName || "You"
  if (coordinateEl) coordinateEl.textContent = `X:${columnNumberToLetters(col + 1)}, Y:${row + 1}`
  if (levelEl) levelEl.textContent = String(cell.level || 1)
  if (upkeepEl) upkeepEl.textContent = formatMoney(cell.upkeepCost ?? config.upkeepCost)

  const progress = Number(cell.productionCount || 0)
  const safeProgress = Number.isFinite(progress) ? Math.max(0, progress) : 0
  const untilUpkeep = Math.max(0, UPKEEP_EVERY_PRODUCTIONS - safeProgress)
  if (upkeepProgressEl) {
    upkeepProgressEl.textContent = `${safeProgress}/${UPKEEP_EVERY_PRODUCTIONS} (${untilUpkeep} left)`
  }

  const remaining = tileTimersMs[selectedBuildingIndex] || config.intervalMs
  if (timerEl) {
    timerEl.textContent = cell.isPaused
      ? `Paused (${formatCountdown(remaining)})`
      : formatCountdown(remaining)
  }

  if (toggleBtn) {
    toggleBtn.textContent = cell.isPaused ? "Start Production" : "Pause Production"
  }
}

function openBuildingPopup(index){
  const cell = cityMapState[index]
  if (!cell || cell.ownerUID !== currentUser) return

  selectedBuildingIndex = index

  const panel = document.getElementById("buildingInfoPanel")
  const overlay = document.getElementById("buildingInfoOverlay")
  if (panel) panel.style.display = "block"
  if (overlay) overlay.style.display = "block"

  renderBuildingPopup()

  if (!popupTickerId) {
    popupTickerId = setInterval(() => {
      renderBuildingPopup()
    }, 1000)
  }
}

async function toggleSelectedBuildingProduction(){
  if (selectedBuildingIndex === null) return

  const index = selectedBuildingIndex
  const storageDocId = displayIndexToStorageDocId(index)
  if (!storageDocId) throw new Error("Invalid map tile.")

  const cellRef = doc(db, MAP_COLLECTION, storageDocId)
  let nextPaused = false

  await runTransaction(db, async (tx) => {
    const cellSnap = await tx.get(cellRef)
    if (!cellSnap.exists()) throw new Error("Building no longer exists.")

    const cell = cellSnap.data()
    if (cell.ownerUID !== currentUser) throw new Error("You can only control your own buildings.")

    nextPaused = !Boolean(cell.isPaused)
    tx.set(cellRef, { isPaused: nextPaused }, { merge: true })
  })

  const local = cityMapState[index]
  if (local) {
    local.isPaused = nextPaused
    if (!nextPaused && tileTimersMs[index] <= 0) {
      const cfg = BUILDINGS[local.buildingType]
      tileTimersMs[index] = cfg ? cfg.intervalMs : 0
    }
  }

  renderCityMap()
  showMessage(nextPaused ? "Production paused." : "Production started.")
}

async function toggleBuildingProductionAtIndex(index){
  const storageDocId = displayIndexToStorageDocId(index)
  if (!storageDocId) throw new Error("Invalid map tile.")

  const cellRef = doc(db, MAP_COLLECTION, storageDocId)
  let nextPaused = false

  await runTransaction(db, async (tx) => {
    const cellSnap = await tx.get(cellRef)
    if (!cellSnap.exists()) throw new Error("Building no longer exists.")

    const cell = cellSnap.data()
    if (cell.ownerUID !== currentUser) throw new Error("You can only control your own buildings.")

    nextPaused = !Boolean(cell.isPaused)
    tx.set(cellRef, { isPaused: nextPaused }, { merge: true })
  })

  const local = cityMapState[index]
  if (local) {
    local.isPaused = nextPaused
    if (!nextPaused && tileTimersMs[index] <= 0) {
      const cfg = BUILDINGS[local.buildingType]
      tileTimersMs[index] = cfg ? cfg.intervalMs : 0
    }
  }

  renderCityMap()
  showMessage(nextPaused ? "Production paused." : "Production started.")
}

function initBuildingPopupUI(){
  if (popupUiInitialized) return

  const closeBtn = document.getElementById("closeBuildingInfoBtn")
  const overlay = document.getElementById("buildingInfoOverlay")
  const toggleBtn = document.getElementById("toggleBuildingProductionBtn")

  if (closeBtn) closeBtn.addEventListener("click", closeBuildingPopup)
  if (overlay) overlay.addEventListener("click", closeBuildingPopup)

  if (toggleBtn) {
    toggleBtn.addEventListener("click", async () => {
      try {
        await toggleSelectedBuildingProduction()
      } catch (err) {
        showMessage(err.message || "Could not update production state.", "error")
      }
    })
  }

  popupUiInitialized = true
}

function initBuildingsPanelUI(){
  if (buildingsPanelUiInitialized) return

  const closeBtn = document.getElementById("closeBuildingsBtn")
  const overlay = document.getElementById("buildingsOverlay")
  const body = document.getElementById("buildingsListBody")

  if (closeBtn) closeBtn.addEventListener("click", closeBuildingsPanel)
  if (overlay) overlay.addEventListener("click", closeBuildingsPanel)

  if (body) {
    body.addEventListener("click", async (evt) => {
      const target = evt.target
      if (!(target instanceof HTMLElement)) return

      const btn = target.closest(".building-toggle-btn")
      if (!btn) return

      const raw = btn.getAttribute("data-index")
      const index = Number(raw)
      if (!Number.isInteger(index)) return

      try {
        await toggleBuildingProductionAtIndex(index)
      } catch (err) {
        showMessage(err.message || "Could not update production state.", "error")
      }
    })
  }

  buildingsPanelUiInitialized = true
}

function initGovernmentPanelUI(){
  if (governmentPanelUiInitialized) return

  const closeBtn = document.getElementById("closeGovernmentBtn")
  const overlay = document.getElementById("governmentOverlay")
  const body = document.getElementById("governmentListBody")

  if (closeBtn) closeBtn.addEventListener("click", closeGovernmentPanel)
  if (overlay) overlay.addEventListener("click", closeGovernmentPanel)

  if (body) {
    body.addEventListener("click", (evt) => {
      const target = evt.target
      if (!(target instanceof HTMLElement)) return

      const btn = target.closest(".government-interact-btn")
      if (!btn) return

      const buildingId = btn.getAttribute("data-id")
      if (!buildingId) return

      interactWithGovernmentBuilding(buildingId)
    })
  }

  governmentPanelUiInitialized = true
}

async function placeBuilding(index, selectedType){
  const config = BUILDINGS[selectedType]
  const storageDocId = displayIndexToStorageDocId(index)
  if (!storageDocId) throw new Error("Invalid map tile.")

  const cellRef = doc(db, MAP_COLLECTION, storageDocId)
  const userRef = doc(db, "users", currentUser)
  let ownerName = "You"

  await runTransaction(db, async (tx) => {
    const [cellSnap, userSnap] = await Promise.all([
      tx.get(cellRef),
      tx.get(userRef)
    ])

    if (cellSnap.exists()) {
      throw new Error("This cell is already occupied.")
    }

    if (!userSnap.exists()) {
      throw new Error("Could not load your account data.")
    }

    const userData = userSnap.data()
    ownerName = userData.username || "You"
    const money = Number(userData.money || 0)
    if (money < config.cost) {
      throw new Error(`Not enough money. ${selectedType} costs $${formatMoney(config.cost)}.`)
    }

    const counts = normalizeCounts(userData.mapBuildingCounts)
    if (counts[selectedType] >= config.maxCount) {
      throw new Error(`Limit reached for ${selectedType}.`)
    }

    counts[selectedType] += 1

    tx.set(cellRef, {
      index,
      buildingType: selectedType,
      ownerUID: currentUser,
      ownerName: userData.username || "Unknown",
      level: 1,
      upkeepCost: config.upkeepCost,
      isPaused: false,
      productionCount: 0,
      placedAt: Date.now()
    })

    tx.set(userRef, {
      money: Number((money - config.cost).toFixed(2)),
      mapBuildingCounts: counts
    }, { merge: true })
  })

  cityMapState[index] = {
    buildingType: selectedType,
    ownerUID: currentUser,
    ownerName,
    level: 1,
    upkeepCost: config.upkeepCost,
    isPaused: false,
    productionCount: 0
  }
  tileTimersMs[index] = config.intervalMs
  renderCityMap()
  showMessage(`${selectedType} built for $${formatMoney(config.cost)}.`)
}

async function deleteBuilding(index){
  const storageDocId = displayIndexToStorageDocId(index)
  if (!storageDocId) throw new Error("Invalid map tile.")

  const cellRef = doc(db, MAP_COLLECTION, storageDocId)
  const userRef = doc(db, "users", currentUser)

  let refund = 0

  await runTransaction(db, async (tx) => {
    const [cellSnap, userSnap] = await Promise.all([
      tx.get(cellRef),
      tx.get(userRef)
    ])

    if (!cellSnap.exists()) {
      throw new Error("This cell is already empty.")
    }

    const cell = cellSnap.data()
    if (cell.ownerUID !== currentUser) {
      throw new Error("You can only delete your own buildings.")
    }

    if (!userSnap.exists()) {
      throw new Error("Could not load your account data.")
    }

    const buildingType = cell.buildingType
    const config = BUILDINGS[buildingType]
    if (!config) {
      throw new Error("Unknown building type.")
    }

    refund = Number((config.cost * 0.45).toFixed(2))

    const userData = userSnap.data()
    const counts = normalizeCounts(userData.mapBuildingCounts)
    counts[buildingType] = Math.max(0, counts[buildingType] - 1)

    tx.delete(cellRef)
    tx.set(userRef, {
      money: Number((Number(userData.money || 0) + refund).toFixed(2)),
      mapBuildingCounts: counts
    }, { merge: true })
  })

  cityMapState[index] = null
  tileTimersMs[index] = 0

  if (selectedBuildingIndex === index) {
    closeBuildingPopup()
  }

  renderCityMap()
  showMessage(`Building removed. Refunded $${formatMoney(refund)}.`)
}

async function onTileClick(index){
  const selectedType = getSelectedBuildingType()
  const existing = cityMapState[index]
  const special = existing ? null : getSpecialCityBuilding(index)

  if (special) {
    showMessage(`${special.name}: ${special.comingSoonText}`)
    return
  }

  if (existing && existing.ownerUID === currentUser && selectedType !== "delete") {
    openBuildingPopup(index)
    return
  }

  if (selectedType === "delete") {
    if (!existing) {
      if (isRoadCell(index)) {
        showMessage("Road tiles cannot be deleted.", "error")
        return
      }

      showMessage("This cell is already empty.", "error")
      return
    }

    try {
      await deleteBuilding(index)
      await updateUI()
    } catch (err) {
      showMessage(err.message || "Could not delete building.", "error")
    }

    return
  }

  if (existing && existing.ownerUID !== currentUser) {
    showMessage("This building belongs to another player.", "error")
    return
  }

  if (isRoadCell(index)) {
    showMessage("You cannot build on a road tile.", "error")
    return
  }

  if (cityMapState[index]) {
    showMessage("This cell already has a building.", "error")
    return
  }

  try {
    await placeBuilding(index, selectedType)
    await updateUI()
  } catch (err) {
    showMessage(err.message || "Could not place building.", "error")
  }
}

function ensureGridBuilt(){
  const grid = document.getElementById("cityMapGrid")
  if (!grid) return

  ensureMapAxisBuilt()

  if (grid.children.length === MAP_SIZE) return

  grid.innerHTML = ""

  for (let i = 0; i < MAP_SIZE; i++) {
    const tile = document.createElement("button")
    tile.type = "button"
    tile.className = "city-map-tile tile-empty"
    tile.dataset.index = String(i)
    tile.addEventListener("click", () => {
      onTileClick(i)
    })
    grid.appendChild(tile)
  }
}

function syncTimersWithMap(){
  for (let i = 0; i < MAP_SIZE; i++) {
    const cell = cityMapState[i]
    if (!cell || cell.ownerUID !== currentUser) {
      tileTimersMs[i] = 0
      continue
    }

    const config = BUILDINGS[cell.buildingType]
    if (!config) {
      tileTimersMs[i] = 0
      continue
    }

    if (tileTimersMs[i] <= 0) {
      tileTimersMs[i] = config.intervalMs
    }
  }
}

async function ensureUserMapMeta(){
  const u = await getUser()
  if (!u) return

  const counts = normalizeCounts(u.mapBuildingCounts)
  const needsCounts = !u.mapBuildingCounts

  if (needsCounts) {
    await updateUser({ mapBuildingCounts: counts })
  }
}

async function recalculateOwnCountsFromSharedMap(){
  const q = query(
    collection(db, MAP_COLLECTION),
    where("ownerUID", "==", currentUser)
  )

  const snap = await getDocs(q)
  const counts = emptyCounts()

  snap.forEach((d) => {
    const displayIndex = storageDocIdToDisplayIndex(d.id)
    if (displayIndex === null) return

    const x = d.data()
    if (!BUILDINGS[x.buildingType]) return
    counts[x.buildingType] += 1
  })

  await updateUser({ mapBuildingCounts: counts })
}

function startSharedMapListener(){
  if (mapUnsubscribe) return

  mapUnsubscribe = onSnapshot(
    collection(db, MAP_COLLECTION),
    (snapshot) => {
      const next = Array(MAP_SIZE).fill(null)

      snapshot.forEach((d) => {
        const index = storageDocIdToDisplayIndex(d.id)
        if (index === null) return

        const data = d.data()
        if (!BUILDINGS[data.buildingType]) return

        next[index] = {
          buildingType: data.buildingType,
          ownerUID: data.ownerUID || "",
          ownerName: data.ownerName || "Unknown",
          level: Number(data.level || 1),
          upkeepCost: Number(data.upkeepCost || BUILDINGS[data.buildingType].upkeepCost || 0),
          isPaused: Boolean(data.isPaused),
          productionCount: Number(data.productionCount || 0)
        }
      })

      cityMapState = next
      syncTimersWithMap()
      renderCityMap()
    },
    (err) => {
      console.error("city map snapshot error", err)
      // keep local visuals rendered even if realtime listener fails
      renderCityMap()
    }
  )
}

export async function initCityMap(){
  ensureGridBuilt()
  initBuildingPopupUI()
  initBuildingsPanelUI()
  initGovernmentPanelUI()

  try {
    await ensureUserMapMeta()
    await recalculateOwnCountsFromSharedMap()
  } catch (err) {
    console.error("city map init metadata failed", err)
  }

  startSharedMapListener()
  renderCityMap()
}

async function productionTick(){
  if (tickBusy) return
  tickBusy = true

  try {
    const hasBuildings = cityMapState.some((x) => x && x.ownerUID === currentUser)
    if (!hasBuildings) return

    const u = await getUser()
    if (!u) return

    let changed = false
    const cellUpdates = []
    const txLogs = []

    for (let i = 0; i < MAP_SIZE; i++) {
      const cell = cityMapState[i]
      if (!cell || cell.ownerUID !== currentUser) continue
      if (cell.isPaused) continue

      const buildingType = cell.buildingType
      if (!buildingType) continue

      tileTimersMs[i] -= 1000
      if (tileTimersMs[i] > 0) continue

      if (totalResources(u) >= STORAGE_LIMIT) {
        cell.isPaused = true
        cellUpdates.push({
          index: i,
          productionCount: Number(cell.productionCount || 0),
          isPaused: true
        })
        continue
      }

      const config = BUILDINGS[buildingType]
      const produced = config.produce(u)
      tileTimersMs[i] = config.intervalMs

      if (produced) {
        changed = true

        const currentCount = Number(cell.productionCount || 0)
        let nextCount = currentCount + 1
        let nextPaused = false

        if (nextCount >= UPKEEP_EVERY_PRODUCTIONS) {
          const upkeep = Number(cell.upkeepCost ?? config.upkeepCost ?? 0)
          const { row, col } = indexToRowCol(i)
          const coord = `X:${columnNumberToLetters(col + 1)}, Y:${row + 1}`

          if ((u.money || 0) >= upkeep) {
            u.money = Number(((u.money || 0) - upkeep).toFixed(2))
            nextCount = 0

            txLogs.push({
              type: "upkeep_paid",
              resource: "money",
              amount: 0,
              moneyChange: -upkeep,
              note: `${config.name} upkeep paid at ${coord}`
            })
          } else {
            nextPaused = true
            nextCount = 0

            txLogs.push({
              type: "upkeep_failed_auto_paused",
              resource: "money",
              amount: 0,
              moneyChange: 0,
              note: `${config.name} auto-paused at ${coord} (needed $${formatMoney(upkeep)}, had $${formatMoney(u.money || 0)})`
            })
          }
        }

        cell.productionCount = nextCount
        if (nextPaused) {
          cell.isPaused = true
        }

        cellUpdates.push({
          index: i,
          productionCount: nextCount,
          isPaused: cell.isPaused
        })
      }
    }

    if (!changed) return

    if (cellUpdates.length) {
      await Promise.all(cellUpdates.map((x) => {
        const storageDocId = displayIndexToStorageDocId(x.index)
        if (!storageDocId) return Promise.resolve()

        return setDoc(
          doc(db, MAP_COLLECTION, storageDocId),
          {
            productionCount: x.productionCount,
            isPaused: Boolean(x.isPaused)
          },
          { merge: true }
        )
      }))
    }

    await updateUser(u)
    await updateUI()

    if (txLogs.length) {
      await Promise.all(txLogs.map((x) => logTransaction(x)))
    }
  } finally {
    tickBusy = false
  }
}

export function startCityMapProduction(){
  if (productionLoop) {
    clearInterval(productionLoop)
  }

  productionLoop = setInterval(() => {
    productionTick()
  }, 1000)
}
