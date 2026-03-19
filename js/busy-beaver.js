/**
 * busy-beaver.js — Busy Beaver machines and explorer
 *
 * Contains the champion Busy Beaver machines for n = 1..5 states,
 * their theoretical properties, and helper functions for loading
 * them into the simulator.
 *
 * The Busy Beaver function Σ(n) = max number of 1s a halting
 * n-state, 2-symbol TM can write on an initially blank tape.
 *
 * S(n) = max steps before halting.
 */

const BUSY_BEAVERS = [
	// ── BB-1 ─────────────────────────────────────────────────────────
	{
		id: "bb1",
		title: "Busy Beaver BB(1)",
		states: ["A", "H"],
		alphabet: ["0", "1"],
		blank: "0",
		startState: "A",
		haltStates: ["H"],
		expected1s: 1,
		expectedSteps: 1,
		description:
			"The trivial 1-state Busy Beaver. Writes one 1 and halts immediately.",
		rules: [
			{ state: "A", read: "0", write: "1", direction: "R", nextState: "H" },
		],
	},

	// ── BB-2 ─────────────────────────────────────────────────────────
	{
		id: "bb2",
		title: "Busy Beaver BB(2)",
		states: ["A", "B", "H"],
		alphabet: ["0", "1"],
		blank: "0",
		startState: "A",
		haltStates: ["H"],
		expected1s: 4,
		expectedSteps: 6,
		description:
			"The 2-state champion. Writes four 1s in just 6 steps on a blank tape.",
		rules: [
			{ state: "A", read: "0", write: "1", direction: "R", nextState: "B" },
			{ state: "A", read: "1", write: "1", direction: "L", nextState: "B" },
			{ state: "B", read: "0", write: "1", direction: "L", nextState: "A" },
			{ state: "B", read: "1", write: "1", direction: "R", nextState: "H" },
		],
	},

	// ── BB-3 ─────────────────────────────────────────────────────────
	{
		id: "bb3",
		title: "Busy Beaver BB(3)",
		states: ["A", "B", "C", "H"],
		alphabet: ["0", "1"],
		blank: "0",
		startState: "A",
		haltStates: ["H"],
		expected1s: 6,
		expectedSteps: 21,
		description:
			"The 3-state champion. Writes six 1s in 21 steps. Proven optimal in 1983.",
		rules: [
			{ state: "A", read: "0", write: "1", direction: "R", nextState: "B" },
			{ state: "A", read: "1", write: "1", direction: "L", nextState: "C" },
			{ state: "B", read: "0", write: "1", direction: "R", nextState: "C" },
			{ state: "B", read: "1", write: "1", direction: "R", nextState: "B" },
			{ state: "C", read: "0", write: "1", direction: "L", nextState: "A" },
			{ state: "C", read: "1", write: "1", direction: "R", nextState: "H" },
		],
	},

	// ── BB-4 ─────────────────────────────────────────────────────────
	{
		id: "bb4",
		title: "Busy Beaver BB(4)",
		states: ["A", "B", "C", "D", "H"],
		alphabet: ["0", "1"],
		blank: "0",
		startState: "A",
		haltStates: ["H"],
		expected1s: 13,
		expectedSteps: 107,
		description:
			"The 4-state champion. Writes 13 ones in 107 steps. Proven optimal in 1983.",
		rules: [
			{ state: "A", read: "0", write: "1", direction: "R", nextState: "B" },
			{ state: "A", read: "1", write: "1", direction: "L", nextState: "B" },
			{ state: "B", read: "0", write: "1", direction: "L", nextState: "A" },
			{ state: "B", read: "1", write: "0", direction: "L", nextState: "C" },
			{ state: "C", read: "0", write: "1", direction: "R", nextState: "H" },
			{ state: "C", read: "1", write: "1", direction: "L", nextState: "D" },
			{ state: "D", read: "0", write: "1", direction: "R", nextState: "D" },
			{ state: "D", read: "1", write: "0", direction: "R", nextState: "A" },
		],
	},

	// ── BB-5 (partial — confirmed champion) ──────────────────────────
	{
		id: "bb5",
		title: "Busy Beaver BB(5)",
		states: ["A", "B", "C", "D", "E", "H"],
		alphabet: ["0", "1"],
		blank: "0",
		startState: "A",
		haltStates: ["H"],
		expected1s: 4098,
		expectedSteps: 47176870,
		description:
			"The 5-state champion (Marxen & Buntrock, 1990). Writes 4,098 ones in over 47 million steps! " +
			"Auto-run is recommended — do not try step-by-step unless you have time.",
		rules: [
			{ state: "A", read: "0", write: "1", direction: "R", nextState: "B" },
			{ state: "A", read: "1", write: "1", direction: "L", nextState: "C" },
			{ state: "B", read: "0", write: "1", direction: "R", nextState: "C" },
			{ state: "B", read: "1", write: "1", direction: "R", nextState: "B" },
			{ state: "C", read: "0", write: "1", direction: "R", nextState: "D" },
			{ state: "C", read: "1", write: "0", direction: "L", nextState: "E" },
			{ state: "D", read: "0", write: "1", direction: "L", nextState: "A" },
			{ state: "D", read: "1", write: "1", direction: "L", nextState: "D" },
			{ state: "E", read: "0", write: "1", direction: "R", nextState: "H" },
			{ state: "E", read: "1", write: "0", direction: "L", nextState: "A" },
		],
	},
];

// ----------------------------------------------------------------
// Busy Beaver Explorer UI component
// ----------------------------------------------------------------

class BusyBeaverExplorer {
	/**
	 * @param {string}   cardsContainerId  — id of the div to render cards into
	 * @param {Function} onSelect          — callback(bbConfig) when user selects + loads a machine
	 */
	constructor(cardsContainerId, onSelect) {
		this._container = document.getElementById(cardsContainerId);
		this._onSelect = onSelect;
		this._selected = null;

		this._elInfo = document.getElementById("beaver-selected-info");
		this._btnLoad = document.getElementById("btn-bb-load");
		this._btnRunFull = document.getElementById("btn-bb-run-full");

		this._render();
		this._bindButtons();
	}

	// ---------------------------------------------------------------
	// Public
	// ---------------------------------------------------------------

	getSelected() {
		return this._selected;
	}

	// ---------------------------------------------------------------
	// Private
	// ---------------------------------------------------------------

	_render() {
		if (!this._container) return;
		this._container.innerHTML = "";

		for (const bb of BUSY_BEAVERS) {
			const card = document.createElement("div");
			card.className = "beaver-card";
			card.dataset.id = bb.id;

			const rulesStr = bb.rules
				.map(
					(r) =>
						`(${r.state},${r.read}) → ${r.write},${r.direction},${r.nextState}`,
				)
				.join("\n");

			card.innerHTML = `
        <div class="beaver-card-title">${bb.title}</div>
        <div class="beaver-card-stats">
          <span class="bb-stat">States: <span>${bb.states.length - 1}</span></span>
          <span class="bb-stat">Σ(n): <span>${bb.expected1s.toLocaleString()}</span></span>
          <span class="bb-stat">S(n): <span>${bb.expectedSteps.toLocaleString()}</span></span>
        </div>
        <p style="font-size:11px;color:var(--text-muted);margin-bottom:8px">${bb.description}</p>
        <div class="beaver-card-rules">${rulesStr}</div>
      `;

			card.addEventListener("click", () => this._selectCard(bb, card));
			this._container.appendChild(card);
		}
	}

	_selectCard(bb, cardEl) {
		// Deselect previous
		this._container
			.querySelectorAll(".beaver-card")
			.forEach((c) => c.classList.remove("selected"));
		cardEl.classList.add("selected");
		this._selected = bb;

		if (this._elInfo) {
			this._elInfo.innerHTML = `
        <strong style="color:var(--accent-purple)">${bb.title}</strong> selected —
        Expected: <span style="color:var(--accent-cyan)">${bb.expected1s.toLocaleString()} ones</span> in
        <span style="color:var(--accent-yellow)">${bb.expectedSteps.toLocaleString()} steps</span>.
        ${bb.id === "bb5" ? '<br><span style="color:var(--accent-red)">⚠ BB-5 takes 47 million steps — use Auto-Run!</span>' : ""}
      `;
		}

		if (this._btnLoad) this._btnLoad.disabled = false;
		if (this._btnRunFull) this._btnRunFull.disabled = false;
	}

	_bindButtons() {
		if (this._btnLoad) {
			this._btnLoad.addEventListener("click", () => {
				if (this._selected && this._onSelect) {
					this._onSelect(this._selected, false);
				}
			});
		}
		if (this._btnRunFull) {
			this._btnRunFull.addEventListener("click", () => {
				if (this._selected && this._onSelect) {
					this._onSelect(this._selected, true); // true = auto-run
				}
			});
		}
	}
}
