// production.js
// -------------
// Contains functions for converting player resources (wood, stone, planks)
// and updating the user's Firestore document accordingly.

import { getUser, updateUser } from "./user.js"
import { updateUI } from "./ui.js"

/**
 * Give the player one unit of wood and save immediately.
 */
export async function produceWood(){
	let u = await getUser();
	if (!u) {
		console.error("produceWood: no user data (permission?)");
		alert("Unable to produce wood: could not load your data. Check permissions or login again.");
		return;
	}
	u.wood++;
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
		alert("Unable to mine stone: could not load your data. Check permissions or login again.");
		return;
	}
	u.stone++;
	await updateUser(u);
	updateUI();
}

/**
 * Convert 3 wood into 1 plank if the player has enough wood.
 */
export async function makePlanks(){
	let u = await getUser();
	if (!u) {
		alert("Unable to craft planks: could not load your data. Check permissions or login again.");
		return;
	}
	if(u.wood < 3) return alert("Niet genoeg hout");
	u.wood -= 3;
	u.planks++;
	await updateUser(u);
	updateUI();
}