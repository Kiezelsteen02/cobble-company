// production.js
// -------------
// Contains functions for converting player resources (wood, stone, planks)
// and updating the user's Firestore document accordingly.

import { getUser, updateUser } from "./user.js"
import { updateUI, showMessage } from "./ui.js"

// maximum total resources allowed in storage
const STORAGE_LIMIT = 250;
function total(u) {
  return (u.wood||0) + (u.stone||0) + (u.planks||0);
}

/**
 * Give the player one unit of wood and save immediately.
 */
export async function produceWood(){
	let u = await getUser();
	if (!u) {
		console.error("produceWood: no user data (permission?)");
		showMessage("Unable to produce wood: could not load your data. Check permissions or login again.", "error");
		return;
	}
	if (total(u) >= STORAGE_LIMIT) {
		showMessage("Storage is full (" + STORAGE_LIMIT + " resources). Sell or use something first.", "error");
		return;
	}
	u.wood = (u.wood||0) + 1;
	await updateUser(u);
	updateUI();
}

/**
 * Mine a stone unit for the player.
 */
export async function produceStone(){
	let u = await getUser();
	if (!u) {
		console.error("produceStone: no user data (permission?)");
		showMessage("Unable to mine stone: could not load your data. Check permissions or login again.", "error");
		return;
	}
	if (total(u) >= STORAGE_LIMIT) {
		showMessage("Storage is full (" + STORAGE_LIMIT + " resources). Sell or use something first.", "error");
		return;
	}
	u.stone = (u.stone||0) + 1;
	await updateUser(u);
	updateUI();
}

/**
 * Convert 3 wood into 1 plank if the player has enough wood.
 */
export async function makePlanks(){
	let u = await getUser();
	if (!u) {
		showMessage("Unable to craft planks: could not load your data. Check permissions or login again.", "error");
		return;
	}
	if(u.wood < 3) {
		showMessage("Niet genoeg hout", "error");
		return;
	}
	if (total(u) >= STORAGE_LIMIT) {
		showMessage("Storage is full (" + STORAGE_LIMIT + " resources). Sell or use something first.", "error");
		return;
	}
	u.wood -= 3;
	u.planks = (u.planks||0) + 1;
	await updateUser(u);
	updateUI();
}