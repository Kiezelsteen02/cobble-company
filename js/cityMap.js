import { db } from "./firebase.js"
import { currentUser } from "./auth.js"
import { getUser, updateUser } from "./user.js"
import { updateUI, showMessage, formatMoney } from "./ui.js"

import {
  collection,
  doc,
  getDocs,
  onSnapshot,
  query,
  runTransaction,
  where
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js"

const GRID_SIDE = 10
const MAP_SIZE = GRID_SIDE * GRID_SIDE
const STORAGE_LIMIT = 250
const ROAD_STRIDE = 3
const MAP_COLLECTION = "city_map_cells"

const BUILDINGS = {
  forest: {
    name: "Forest",
    label: "🌲",
    cssClass: "tile-forest",
    cost: 75,
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

function isPatternRoadIndex(index){
  const row = Math.floor(index / GRID_SIDE)
  const col = index % GRID_SIDE
  return row % ROAD_STRIDE === 0 || col % ROAD_STRIDE === 0
}

function isRoadCell(index){
  return isPatternRoadIndex(index)
}

function applyTileVisual(tileEl, cell, index){
  tileEl.classList.remove("tile-empty", "tile-road", "tile-forest", "tile-mine", "tile-sawmill", "tile-own", "tile-other")

  if (!cell) {
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
}

async function placeBuilding(index, selectedType){
  const config = BUILDINGS[selectedType]
  const cellRef = doc(db, MAP_COLLECTION, String(index))
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
    ownerName
  }
  tileTimersMs[index] = config.intervalMs
  renderCityMap()
  showMessage(`${selectedType} built for $${formatMoney(config.cost)}.`)
}

async function deleteBuilding(index){
  const cellRef = doc(db, MAP_COLLECTION, String(index))
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
  renderCityMap()
  showMessage(`Building removed. Refunded $${formatMoney(refund)}.`)
}

async function onTileClick(index){
  const selectedType = getSelectedBuildingType()

  if (selectedType === "delete") {
    const existing = cityMapState[index]
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
        const index = Number(d.id)
        if (!Number.isInteger(index) || index < 0 || index >= MAP_SIZE) return

        const data = d.data()
        if (!BUILDINGS[data.buildingType]) return

        next[index] = {
          buildingType: data.buildingType,
          ownerUID: data.ownerUID || "",
          ownerName: data.ownerName || "Unknown"
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

    for (let i = 0; i < MAP_SIZE; i++) {
      const cell = cityMapState[i]
      if (!cell || cell.ownerUID !== currentUser) continue

      const buildingType = cell.buildingType
      if (!buildingType) continue

      tileTimersMs[i] -= 1000
      if (tileTimersMs[i] > 0) continue

      const config = BUILDINGS[buildingType]
      const produced = config.produce(u)
      tileTimersMs[i] = config.intervalMs

      if (produced) {
        changed = true
      }
    }

    if (!changed) return

    await updateUser(u)
    await updateUI()
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
