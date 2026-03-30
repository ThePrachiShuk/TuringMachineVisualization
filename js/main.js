/**
 * main.js — Application Controller
 *
 * Orchestrates all components:
 *   TuringMachine + Tape  →  core logic
 *   StateGraph            →  animated state diagram
 *   Timeline              →  computation trace table
 *   ComplexityTracker     →  live charts
 *   LoopDetector          →  infinite-loop detection
 *   BusyBeaverExplorer    →  busy beaver mode
 *
 * This file wires DOM events to machine actions and keeps all
 * subsystems in sync.
 */

/* ================================================================
   EXAMPLE MACHINES
   ================================================================ */
const EXAMPLE_MACHINES = [
	{
		name: "Binary Increment  (+1 to a binary number)",
		description:
			'Adds 1 to a binary number on the tape. Input: binary string. Try "1011" → should produce "1100".',
		input: "1011",
		config: {
			states: ["q0", "qCarry", "qBack", "qDone"],
			alphabet: ["0", "1", "_"],
			blank: "_",
			startState: "q0",
			haltStates: ["qDone"],
			rules: [
				// Scan to end of number
				{ state: "q0", read: "0", write: "0", direction: "R", nextState: "q0" },
				{ state: "q0", read: "1", write: "1", direction: "R", nextState: "q0" },
				{
					state: "q0",
					read: "_",
					write: "_",
					direction: "L",
					nextState: "qCarry",
				},
				// Increment from right
				{
					state: "qCarry",
					read: "0",
					write: "1",
					direction: "L",
					nextState: "qBack",
				},
				{
					state: "qCarry",
					read: "1",
					write: "0",
					direction: "L",
					nextState: "qCarry",
				},
				{
					state: "qCarry",
					read: "_",
					write: "1",
					direction: "R",
					nextState: "qDone",
				},
				// Return to start
				{
					state: "qBack",
					read: "0",
					write: "0",
					direction: "L",
					nextState: "qBack",
				},
				{
					state: "qBack",
					read: "1",
					write: "1",
					direction: "L",
					nextState: "qBack",
				},
				{
					state: "qBack",
					read: "_",
					write: "_",
					direction: "R",
					nextState: "qDone",
				},
			],
		},
	},
	{
		name: "Palindrome Checker (binary)",
		description:
			'Checks if a binary string is a palindrome. Input must end with #. Accepts (→ qY) or rejects (→ qN). Try "1001#".',
		input: "1001#",
		config: {
			states: ["q0", "q1", "q2", "q3", "q4", "qY", "qN"],
			alphabet: ["0", "1", "#", "X", "_"],
			blank: "_",
			startState: "q0",
			haltStates: ["qY", "qN"],
			rules: [
				// Read first symbol
				{ state: "q0", read: "0", write: "X", direction: "R", nextState: "q1" },
				{ state: "q0", read: "1", write: "X", direction: "R", nextState: "q2" },
				{ state: "q0", read: "#", write: "#", direction: "R", nextState: "qY" },
				{ state: "q0", read: "X", write: "X", direction: "R", nextState: "q0" },
				// Scan right looking for last char (0 needed)
				{ state: "q1", read: "0", write: "0", direction: "R", nextState: "q1" },
				{ state: "q1", read: "1", write: "1", direction: "R", nextState: "q1" },
				{ state: "q1", read: "X", write: "X", direction: "R", nextState: "q1" },
				{ state: "q1", read: "#", write: "#", direction: "L", nextState: "q3" },
				// Found # going left — check last char is 0
				{ state: "q3", read: "0", write: "X", direction: "L", nextState: "q4" },
				{ state: "q3", read: "1", write: "1", direction: "L", nextState: "qN" },
				{ state: "q3", read: "X", write: "X", direction: "L", nextState: "q0" },
				// Scan right looking for last char (1 needed)
				{ state: "q2", read: "0", write: "0", direction: "R", nextState: "q2" },
				{ state: "q2", read: "1", write: "1", direction: "R", nextState: "q2" },
				{ state: "q2", read: "X", write: "X", direction: "R", nextState: "q2" },
				{ state: "q2", read: "#", write: "#", direction: "L", nextState: "q4" }, // reuse q4 wrong
				// Found # going left — check last char is 1
				{ state: "q4", read: "1", write: "X", direction: "L", nextState: "q4" },
				{ state: "q4", read: "0", write: "0", direction: "L", nextState: "qN" },
				{ state: "q4", read: "X", write: "X", direction: "L", nextState: "q0" },
			],
		},
	},
	{
		name: "Unary Addition  (a + b)",
		description:
			'Adds two unary numbers separated by "+". E.g. "111+11" → "11111". Uses 1s to represent numbers.',
		input: "111+11",
		config: {
			states: ["q0", "q1", "q2", "qDone"],
			alphabet: ["1", "+", "_"],
			blank: "_",
			startState: "q0",
			haltStates: ["qDone"],
			rules: [
				// Scan to find the '+' sign, replace it with '1'
				{ state: "q0", read: "1", write: "1", direction: "R", nextState: "q0" },
				{ state: "q0", read: "+", write: "1", direction: "R", nextState: "q1" },
				// Scan to end of second number
				{ state: "q1", read: "1", write: "1", direction: "R", nextState: "q1" },
				{ state: "q1", read: "_", write: "_", direction: "L", nextState: "q2" },
				// Erase last '1' (since '+' became extra '1')
				{
					state: "q2",
					read: "1",
					write: "_",
					direction: "L",
					nextState: "qDone",
				},
			],
		},
	},
	{
		name: "Three-State Busy Beaver BB(3)",
		description:
			"Σ(3) champion: writes 6 ones in exactly 21 steps on a blank tape.",
		input: "",
		config: {
			states: ["A", "B", "C", "H"],
			alphabet: ["0", "1"],
			blank: "0",
			startState: "A",
			haltStates: ["H"],
			rules: [
				{ state: "A", read: "0", write: "1", direction: "R", nextState: "B" },
				{ state: "A", read: "1", write: "1", direction: "L", nextState: "C" },
				{ state: "B", read: "0", write: "1", direction: "R", nextState: "C" },
				{ state: "B", read: "1", write: "1", direction: "R", nextState: "B" },
				{ state: "C", read: "0", write: "1", direction: "L", nextState: "A" },
				{ state: "C", read: "1", write: "1", direction: "R", nextState: "H" },
			],
		},
	},
	{
		name: "Loop Machine (never halts)",
		description:
			"Deliberately non-halting machine that loops between two states forever. Demonstrates loop detection.",
		input: "0",
		config: {
			states: ["q0", "q1", "qH"],
			alphabet: ["0", "1", "_"],
			blank: "_",
			startState: "q0",
			haltStates: ["qH"],
			rules: [
				{ state: "q0", read: "0", write: "1", direction: "R", nextState: "q1" },
				{ state: "q0", read: "1", write: "0", direction: "R", nextState: "q1" },
				{ state: "q0", read: "_", write: "0", direction: "L", nextState: "q1" },
				{ state: "q1", read: "0", write: "0", direction: "L", nextState: "q0" },
				{ state: "q1", read: "1", write: "1", direction: "L", nextState: "q0" },
				{ state: "q1", read: "_", write: "_", direction: "R", nextState: "q0" },
			],
		},
	},
];

/* ================================================================
   TAPE RENDERER
   Renders tape cells into the DOM tape strip.
   ================================================================ */
class TapeRenderer {
	constructor(scrollId) {
		this._scroll = document.getElementById(scrollId);
		this._posLabel = document.getElementById("tape-pos-label");
		this._flashSet = new Set(); // positions currently flashing
	}

	render(tape, flashPos = null) {
		if (!tape) return;
		const cells = tape.getVisibleRange(5);

		// Cell geometry must match CSS (.tape-cell width + .tape-scroll gap)
		const CELL_W = 52;
		const CELL_GAP = 2;
		const CELL_STRIDE = CELL_W + CELL_GAP;

		// Compute shift purely from the head's index — no DOM measurement needed.
		// This runs synchronously so the CSS transition always gets a clean before→after.
		const headIdx = cells.findIndex((c) => c.isHead);
		if (headIdx >= 0) {
			const containerW = this._scroll.parentElement.clientWidth;
			const headCenter = headIdx * CELL_STRIDE + CELL_W / 2;
			const shift = containerW / 2 - headCenter;
			this._scroll.style.transform = `translateX(${shift}px)`;
		}

		// Rebuild cells
		const now = flashPos !== null ? flashPos : null;
		this._scroll.innerHTML = "";
		for (const cell of cells) {
			const div = document.createElement("div");
			div.className = "tape-cell";
			if (cell.hasContent) div.classList.add("written");
			if (cell.isHead) div.classList.add("head");
			if (now !== null && cell.pos === now && !cell.isHead)
				div.classList.add("flash");

			const posSpan = document.createElement("span");
			posSpan.className = "cell-pos";
			posSpan.textContent = cell.pos;

			div.textContent = cell.symbol;
			div.appendChild(posSpan);
			this._scroll.appendChild(div);
		}

		if (this._posLabel) {
			this._posLabel.textContent = `Head @ ${tape.headPos}`;
		}
	}
}

/* ================================================================
   APP CLASS — main controller
   ================================================================ */
class App {
	constructor() {
		// Core engine
		this.tm = new TuringMachine();
		this.loopDetector = new LoopDetector({
			hashCheckInterval: 1,
			growthWindowSize: 300,
			growthThreshold: 0.4,
		});

		// UI components (initialised after DOM is ready)
		this.tapeRenderer = null;
		this.stateGraph = null;
		this.timeline = null;
		this.complexityTracker = null;
		this.bbExplorer = null;

		// Playback state
		this._running = false;
		this._runInterval = null;
		this._currentInput = "";
		this._speed = 3; // 1-10
		this._loopWarned = false;
		this._machineReady = false;

		// Track which history index we last displayed
		this._displayedHistoryIndex = 0;
	}

	// ---------------------------------------------------------------
	// Bootstrap
	// ---------------------------------------------------------------

	init() {
		this.tapeRenderer = new TapeRenderer("tape-scroll");
		this.stateGraph = new StateGraph("state-graph-svg", "graph-container");
		this.timeline = new Timeline("timeline-tbody", (idx) =>
			this._jumpToStep(idx),
		);
		this.complexityTracker = new ComplexityTracker(
			"chart-tape-growth",
			"chart-head-pos",
		);
		this.bbExplorer = new BusyBeaverExplorer("beaver-cards", (bb, autoRun) =>
			this._loadBusyBeaver(bb, autoRun),
		);

		this._buildDefaultRules();
		this._bindEvents();
		this._buildExamplesList();
		this._showToast(
			"Welcome! Load an example or define your own machine.",
			"info",
			4000,
		);
	}

	// ---------------------------------------------------------------
	// Configuration panel: rules table management
	// ---------------------------------------------------------------

	_buildDefaultRules() {
		// Default: a simple binary copy / pass-through with return
		const defaults = [
			{ state: "q0", read: "0", write: "0", direction: "R", nextState: "q0" },
			{ state: "q0", read: "1", write: "1", direction: "R", nextState: "q0" },
			{ state: "q0", read: "_", write: "_", direction: "L", nextState: "qA" },
		];
		const tbody = document.getElementById("rules-tbody");
		tbody.innerHTML = "";
		for (const r of defaults) this._addRuleRow(r);
	}

	_addRuleRow(data = {}) {
		const tbody = document.getElementById("rules-tbody");
		const tr = document.createElement("tr");

		const fields = [
			{ key: "state", placeholder: "q0" },
			{ key: "read", placeholder: "0" },
			{ key: "write", placeholder: "0" },
			{ key: "nextState", placeholder: "q1" },
		];

		const dirCell = document.createElement("td");
		const dirSel = document.createElement("select");
		dirSel.className = "rule-select";
		["R", "L", "S"].forEach((d) => {
			const opt = document.createElement("option");
			opt.value = d;
			opt.textContent = d;
			if ((data.direction || "R") === d) opt.selected = true;
			dirSel.appendChild(opt);
		});

		for (const f of fields) {
			if (f.key === "write") {
				// Insert direction column before 'nextState'
				// (already done by inserting fields in order)
			}
		}

		// Build cells: State | Read | Write | Dir | Next | ✕
		const makeInput = (f) => {
			const td = document.createElement("td");
			const inp = document.createElement("input");
			inp.type = "text";
			inp.className = "rule-input";
			inp.placeholder = f.placeholder;
			inp.value = data[f.key] || "";
			inp.maxLength = 10;
			td.appendChild(inp);
			return td;
		};

		tr.appendChild(makeInput({ key: "state", placeholder: "q0" }));
		tr.appendChild(makeInput({ key: "read", placeholder: "0" }));
		tr.appendChild(makeInput({ key: "write", placeholder: "0" }));
		dirCell.appendChild(dirSel);
		tr.appendChild(dirCell);
		tr.appendChild(makeInput({ key: "nextState", placeholder: "q1" }));

		const delTd = document.createElement("td");
		const delBtn = document.createElement("button");
		delBtn.className = "btn-del-rule";
		delBtn.textContent = "✕";
		delBtn.title = "Remove this rule";
		delBtn.addEventListener("click", () => tr.remove());
		delTd.appendChild(delBtn);
		tr.appendChild(delTd);

		tbody.appendChild(tr);
		return tr;
	}

	_readRulesFromTable() {
		const rows = document.querySelectorAll("#rules-tbody tr");
		const rules = [];
		for (const row of rows) {
			const inputs = row.querySelectorAll(".rule-input");
			const sel = row.querySelector(".rule-select");
			if (inputs.length < 4) continue;
			const state = inputs[0].value.trim();
			const read = inputs[1].value.trim();
			const write = inputs[2].value.trim();
			const nextState = inputs[3].value.trim();
			const direction = sel ? sel.value : "R";
			if (!state || read === "" || write === "" || !nextState) continue;
			rules.push({ state, read, write, direction, nextState });
		}
		return rules;
	}

	// ---------------------------------------------------------------
	// Machine configuration
	// ---------------------------------------------------------------

	_applyConfig() {
		const statesStr = document.getElementById("cfg-states").value;
		const alphStr = document.getElementById("cfg-alphabet").value;
		const blank = (document.getElementById("cfg-blank").value.trim() || "_")[0];
		const start = document.getElementById("cfg-start").value.trim();
		const haltStr = document.getElementById("cfg-halt").value;
		const inputStr = document.getElementById("cfg-input").value;
		const maxSteps =
			parseInt(document.getElementById("cfg-maxsteps").value, 10) || 50000;

		const parse = (str) =>
			str
				.split(",")
				.map((s) => s.trim())
				.filter(Boolean);

		const states = parse(statesStr);
		const alphabet = parse(alphStr);
		const haltStates = parse(haltStr);
		const rules = this._readRulesFromTable();

		const config = {
			states,
			alphabet,
			blank,
			startState: start,
			haltStates,
			rules,
			maxSteps,
		};

		this.tm.configure(config);
		const errors = this.tm.validate();
		if (errors.length > 0) {
			this._showToast("Configuration error: " + errors[0], "error", 5000);
			return false;
		}

		this._currentInput = inputStr;
		this.tm.initialize(inputStr);

		// Reset all subsystems
		this.loopDetector.reset();
		this._loopWarned = false;
		this.timeline.reset();
		this.complexityTracker.reset();

		// Record initial step
		const initEntry = this.tm.history[0];
		if (initEntry) {
			this.timeline.appendStep(initEntry, this.tm.history.length);
			this.complexityTracker.record({
				step: 0,
				tapeNonBlank: this.tm.tape.getNonBlankCount(),
				tapeSpan: this.tm.tape.getSpan(),
				headPos: this.tm.tape.headPos,
			});
		}

		// Rebuild state graph
		this.stateGraph.build(
			[...this.tm.states],
			this.tm.transitions,
			this.tm.startState,
			this.tm.haltStates,
		);
		setTimeout(() => this.stateGraph.fitView(), 400);

		// Render initial tape
		this.tapeRenderer.render(this.tm.tape);

		// Update info bar
		this._updateInfoBar(null);
		this._setStatusBadge("READY", "");

		this._machineReady = true;
		this._displayedHistoryIndex = 0;
		this.timeline.setCurrentStep(0);
		this.stateGraph.resetHighlights(this.tm.startState);

		this._showToast(
			`Machine configured: ${states.length} states, ${rules.length} rules`,
			"success",
			2500,
		);
		return true;
	}

	// ---------------------------------------------------------------
	// Playback controls
	// ---------------------------------------------------------------

	_step() {
		if (!this._machineReady) {
			this._showToast("Apply a configuration first", "error");
			return;
		}
		if (this.tm.isHalted) {
			this._showHaltModal();
			return;
		}

		const result = this.tm.step();
		this._afterStep(result);
	}

	_afterStep(result) {
		// Render tape
		const flashPos = result.transition
			? result.headPos -
				(result.transition.direction === "R"
					? 1
					: result.transition.direction === "L"
						? -1
						: 0)
			: null;
		this.tapeRenderer.render(this.tm.tape, flashPos);

		// Flash the instruction bar
		const _td = document.getElementById("transition-display");
		if (_td) {
			_td.classList.remove("step-flash");
			void _td.offsetWidth;
			_td.classList.add("step-flash");
		}

		// Update state graph
		this.stateGraph.update(this.tm.currentState, result.transition || null);

		// Update info bar
		this._updateInfoBar(result);
		this._displayedHistoryIndex = this.tm.history.length - 1;
		this.timeline.setCurrentStep(this._displayedHistoryIndex);

		// Append to timeline (every step, but table only re-renders in batches)
		const lastEntry = this.tm.history[this.tm.history.length - 1];
		if (lastEntry) {
			this.timeline.appendStep(lastEntry, this.tm.history.length);
		}

		// Track complexity
		this.complexityTracker.record({
			step: this.tm.stepCount,
			tapeNonBlank: this.tm.tape.getNonBlankCount(),
			tapeSpan: this.tm.tape.getSpan(),
			headPos: this.tm.tape.headPos,
		});

		// Loop detection
		if (!this._loopWarned && !this.tm.isHalted) {
			const loopResult = this.loopDetector.check(this.tm, result);
			if (loopResult && loopResult.detected) {
				this._loopWarned = true;
				this._pauseRun();
				this._showLoopModal(loopResult.details);
				this._setStatusBadge("LOOP", "loop");
			}
		}

		// Check halt
		if (this.tm.isHalted) {
			this._pauseRun();
			this._setStatusBadge(
				result.accepted ? "ACCEPTED" : "REJECTED",
				result.accepted ? "accepted" : "halted",
			);
			this._showHaltModal(result);
		} else {
			this._setStatusBadge("RUNNING", "running");
		}
	}

	_run() {
		if (!this._machineReady) {
			this._showToast("Apply a configuration first", "error");
			return;
		}
		if (this.tm.isHalted) {
			this._showHaltModal();
			return;
		}
		if (this._running) return;

		this._running = true;
		document.getElementById("btn-run").disabled = true;
		document.getElementById("btn-pause").disabled = false;
		document.getElementById("btn-step").disabled = true;

		this._setStatusBadge("RUNNING", "running");
		this._scheduleRun();
	}

	_scheduleRun() {
		if (!this._running) return;

		// Speed: 1 = 800ms/step, 10 = 8ms/step (logarithmic)
		const delay = Math.round(800 / Math.pow(1.7, this._speed - 1));

		this._runInterval = setTimeout(() => {
			if (!this._running) return;

			// For very fast speeds, do multiple steps per tick
			const batchSize = this._speed >= 8 ? 20 : this._speed >= 6 ? 5 : 1;
			let lastResult = null;

			for (let i = 0; i < batchSize; i++) {
				if (this.tm.isHalted) break;
				lastResult = this.tm.step();
				// Record but don't render every sub-step
				const entry = this.tm.history[this.tm.history.length - 1];
				if (entry) {
					this.timeline.appendStep(entry, this.tm.history.length);
					this.complexityTracker.record({
						step: this.tm.stepCount,
						tapeNonBlank: this.tm.tape.getNonBlankCount(),
						tapeSpan: this.tm.tape.getSpan(),
						headPos: this.tm.tape.headPos,
					});
				}
				if (!this._loopWarned) {
					const lr = this.loopDetector.check(this.tm, lastResult);
					if (lr && lr.detected) {
						this._loopWarned = true;
						this._pauseRun();
						this._showLoopModal(lr.details);
						this._setStatusBadge("LOOP", "loop");
						return;
					}
				}
				if (this.tm.isHalted) break;
			}

			if (lastResult) {
				// Render the final state of the batch
				this.tapeRenderer.render(this.tm.tape);
				this.stateGraph.update(
					this.tm.currentState,
					lastResult.transition || null,
				);
				this._updateInfoBar(lastResult);
				this._displayedHistoryIndex = this.tm.history.length - 1;
				this.timeline.setCurrentStep(this._displayedHistoryIndex);
			}

			if (this.tm.isHalted) {
				this._pauseRun();
				this._setStatusBadge(
					lastResult && lastResult.accepted ? "ACCEPTED" : "REJECTED",
					lastResult && lastResult.accepted ? "accepted" : "halted",
				);
				this._showHaltModal(lastResult);
				return;
			}

			this._scheduleRun();
		}, delay);
	}

	_pauseRun() {
		this._running = false;
		if (this._runInterval) {
			clearTimeout(this._runInterval);
			this._runInterval = null;
		}
		document.getElementById("btn-run").disabled = false;
		document.getElementById("btn-pause").disabled = true;
		document.getElementById("btn-step").disabled = false;
		if (!this.tm.isHalted) this._setStatusBadge("PAUSED", "paused");
	}

	_reset() {
		this._pauseRun();
		if (!this._machineReady) return;

		this.tm.initialize(this._currentInput);
		this.loopDetector.reset();
		this._loopWarned = false;

		this.timeline.reset();
		this.complexityTracker.reset();

		const initEntry = this.tm.history[0];
		if (initEntry) {
			this.timeline.appendStep(initEntry, this.tm.history.length);
			this.complexityTracker.record({
				step: 0,
				tapeNonBlank: this.tm.tape.getNonBlankCount(),
				tapeSpan: this.tm.tape.getSpan(),
				headPos: 0,
			});
		}

		this.tapeRenderer.render(this.tm.tape);
		this.stateGraph.resetHighlights(this.tm.startState);
		this._updateInfoBar(null);
		this._setStatusBadge("READY", "");
		this._displayedHistoryIndex = 0;
		this.timeline.setCurrentStep(0);
	}

	// ---------------------------------------------------------------
	// Time-travel: jump to a specific step in history
	// ---------------------------------------------------------------

	_jumpToStep(historyIndex) {
		if (!this._machineReady) return;
		this._pauseRun();

		if (!this.tm.jumpToHistory(historyIndex)) return;

		this.tapeRenderer.render(this.tm.tape);
		const entry = this.tm.history[historyIndex];
		this.stateGraph.update(entry.state, entry.transition || null);
		this._displayedHistoryIndex = historyIndex;
		this.timeline.setCurrentStep(historyIndex);

		// Sync complexity to that point
		const sliced = this.tm.history.slice(0, historyIndex + 1);
		this.complexityTracker.rebuildFrom(sliced);

		this._updateInfoBar(
			entry.transition
				? {
						transition: entry.transition,
						headPos: entry.headPos,
						stepCount: entry.step,
					}
				: null,
		);
		this._setStatusBadge("PAUSED", "paused");
	}

	// ---------------------------------------------------------------
	// Load example machine
	// ---------------------------------------------------------------

	_loadExample(example) {
		this._pauseRun();
		document.getElementById("examples-modal").style.display = "none";

		const c = example.config;
		const stateStr = c.states.join(", ");
		const alphabStr = c.alphabet.join(", ");
		const haltStr = c.haltStates.join(", ");

		document.getElementById("cfg-states").value = stateStr;
		document.getElementById("cfg-alphabet").value = alphabStr;
		document.getElementById("cfg-blank").value = c.blank;
		document.getElementById("cfg-start").value = c.startState;
		document.getElementById("cfg-halt").value = haltStr;
		document.getElementById("cfg-input").value = example.input;

		// Rebuild rules table
		const tbody = document.getElementById("rules-tbody");
		tbody.innerHTML = "";
		for (const r of c.rules) this._addRuleRow(r);

		this._applyConfig();
	}

	// ---------------------------------------------------------------
	// Busy Beaver integration
	// ---------------------------------------------------------------

	_loadBusyBeaver(bb, autoRun) {
		this._pauseRun();

		// Switch to simulator tab
		this._switchTab("simulator");

		// Fill config fields
		document.getElementById("cfg-states").value = bb.states.join(", ");
		document.getElementById("cfg-alphabet").value = bb.alphabet.join(", ");
		document.getElementById("cfg-blank").value = bb.blank;
		document.getElementById("cfg-start").value = bb.startState;
		document.getElementById("cfg-halt").value = bb.haltStates.join(", ");
		document.getElementById("cfg-input").value = "";
		document.getElementById("cfg-maxsteps").value = Math.max(
			bb.expectedSteps * 2,
			100000,
		);

		// Build rules table
		const tbody = document.getElementById("rules-tbody");
		tbody.innerHTML = "";
		for (const r of bb.rules) this._addRuleRow(r);

		const ok = this._applyConfig();
		if (!ok) return;

		if (autoRun) {
			setTimeout(() => this._run(), 200);
		} else {
			this._showToast(
				`${bb.title} loaded! Expected: ${bb.expected1s} ones in ${bb.expectedSteps} steps.`,
				"success",
				4000,
			);
		}
	}

	// ---------------------------------------------------------------
	// UI helpers
	// ---------------------------------------------------------------

	_updateInfoBar(result) {
		const cfg = this.tm.getConfiguration();

		document.getElementById("info-current-state").textContent =
			cfg.state || "—";
		document.getElementById("info-step").textContent = cfg.step || 0;
		document.getElementById("info-tape-cells").textContent =
			cfg.tapeNonBlank || 0;

		if (result && result.transition) {
			const t = result.transition;
			document.getElementById("info-reading").textContent = t.read || "—";
			document.getElementById("info-writing").textContent = t.write || "—";
			document.getElementById("info-direction").textContent =
				t.direction || "—";
			document.getElementById("td-rule").textContent =
				`(${t.fromState}, ${t.read}) → (${t.write}, ${t.direction}, ${t.nextState})`;
		} else {
			document.getElementById("info-reading").textContent = cfg.symbol || "—";
			document.getElementById("info-writing").textContent = "—";
			document.getElementById("info-direction").textContent = "—";
			document.getElementById("td-rule").textContent = "—";
		}
	}

	_setStatusBadge(text, cls) {
		const badge = document.getElementById("machine-status-badge");
		if (!badge) return;
		badge.textContent = text;
		badge.className = "status-badge";
		if (cls) badge.classList.add(cls);
	}

	_switchTab(tabId) {
		document
			.querySelectorAll(".tab-btn")
			.forEach((b) => b.classList.remove("active"));
		document
			.querySelectorAll(".tab-pane")
			.forEach((p) => p.classList.remove("active"));
		const btn = document.querySelector(`.tab-btn[data-tab="${tabId}"]`);
		const pane = document.getElementById(`tab-${tabId}`);
		if (btn) btn.classList.add("active");
		if (pane) pane.classList.add("active");

		// Trigger chart re-render when switching to complexity tab
		if (tabId === "complexity") {
			setTimeout(() => this.complexityTracker.rebuildFrom(this.tm.history), 50);
		}
	}

	// ---------------------------------------------------------------
	// Modal helpers
	// ---------------------------------------------------------------

	_showHaltModal(result) {
		const modal = document.getElementById("halt-modal");
		const title = document.getElementById("halt-modal-title");
		const info = document.getElementById("halt-info");
		const inner = document.getElementById("halt-modal-inner");
		if (!modal) return;

		const accepted = result && result.accepted;
		title.textContent = accepted
			? "✓ Machine Accepted (Halted)"
			: "✗ Machine Rejected / Halted";
		inner.className = `modal ${accepted ? "modal-success" : ""}`;
		info.innerHTML = `
      <p>The machine has <strong>${accepted ? "accepted (reached a halt state)" : "halted without accepting"}</strong>.</p>
      <p>Total steps: <span style="color:var(--accent-cyan)">${this.tm.stepCount}</span></p>
      <p>Final state: <span style="color:var(--accent-purple)">${this.tm.currentState}</span></p>
      <p>Non-blank tape cells: <span style="color:var(--accent-yellow)">${this.tm.tape.getNonBlankCount()}</span></p>
      <p>Tape span used: <span style="color:var(--accent-yellow)">${this.tm.tape.getSpan()}</span> cells</p>
      ${result && result.status === "max_steps" ? '<p style="color:var(--accent-red)">⚠ Safety step limit reached</p>' : ""}
    `;
		modal.style.display = "flex";
	}

	_showLoopModal(details) {
		const modal = document.getElementById("loop-modal");
		const infoEl = document.getElementById("loop-details");
		if (!modal || !infoEl) return;
		infoEl.textContent = details
			? details.message
			: "Repeating configuration detected.";
		modal.style.display = "flex";
	}

	_buildExamplesList() {
		const list = document.getElementById("example-list");
		if (!list) return;
		list.innerHTML = "";
		for (const ex of EXAMPLE_MACHINES) {
			const item = document.createElement("div");
			item.className = "example-item";
			item.innerHTML = `
        <div class="example-name">${ex.name}</div>
        <div class="example-desc">${ex.description}</div>
      `;
			item.addEventListener("click", () => this._loadExample(ex));
			list.appendChild(item);
		}
	}

	_showToast(msg, type = "info", duration = 3000) {
		let container = document.getElementById("toast-container");
		if (!container) {
			container = document.createElement("div");
			container.id = "toast-container";
			document.body.appendChild(container);
		}
		const toast = document.createElement("div");
		toast.className = `toast ${type}`;
		toast.textContent = msg;
		container.appendChild(toast);
		setTimeout(() => {
			toast.style.animation = "toastOut 0.3s ease forwards";
			setTimeout(() => toast.remove(), 300);
		}, duration);
	}

	// ---------------------------------------------------------------
	// Event binding
	// ---------------------------------------------------------------

	_bindEvents() {
		// Config actions
		document
			.getElementById("btn-apply-config")
			.addEventListener("click", () => this._applyConfig());
		document
			.getElementById("btn-add-rule")
			.addEventListener("click", () => this._addRuleRow());

		// Playback controls
		document
			.getElementById("btn-step")
			.addEventListener("click", () => this._step());
		document
			.getElementById("btn-run")
			.addEventListener("click", () => this._run());
		document
			.getElementById("btn-pause")
			.addEventListener("click", () => this._pauseRun());
		document
			.getElementById("btn-reset")
			.addEventListener("click", () => this._reset());

		// Speed slider
		const speedSlider = document.getElementById("speed-slider");
		const speedValue = document.getElementById("speed-value");
		speedSlider.addEventListener("input", () => {
			this._speed = parseInt(speedSlider.value, 10);
			speedValue.textContent = this._speed;
		});

		// Tab navigation
		document.querySelectorAll(".tab-btn").forEach((btn) => {
			btn.addEventListener("click", () => this._switchTab(btn.dataset.tab));
		});

		// Examples modal
		document
			.getElementById("btn-load-example")
			.addEventListener("click", () => {
				document.getElementById("examples-modal").style.display = "flex";
			});

		// Modal close buttons
		document.querySelectorAll(".modal-close").forEach((btn) => {
			btn.addEventListener("click", () => {
				const targetId = btn.dataset.close;
				if (targetId) document.getElementById(targetId).style.display = "none";
			});
		});
		// Close modal on overlay click
		document.querySelectorAll(".modal-overlay").forEach((overlay) => {
			overlay.addEventListener("click", (e) => {
				if (e.target === overlay) overlay.style.display = "none";
			});
		});

		// Loop modal stop button
		const loopStop = document.getElementById("btn-loop-stop");
		if (loopStop) {
			loopStop.addEventListener("click", () => {
				document.getElementById("loop-modal").style.display = "none";
				this._pauseRun();
			});
		}

		// Timeline jump
		document
			.getElementById("btn-timeline-jump")
			.addEventListener("click", () => {
				const val = parseInt(
					document.getElementById("timeline-jump-input").value,
					10,
				);
				if (!isNaN(val) && val >= 0 && val < this.tm.history.length) {
					this._jumpToStep(val);
				} else {
					this._showToast(`Step ${val} not yet recorded`, "error");
				}
			});

		// Timeline CSV export
		document
			.getElementById("btn-timeline-export")
			.addEventListener("click", () => {
				if (this.tm.history.length <= 1) {
					this._showToast("No computation to export yet", "error");
					return;
				}
				this.timeline.exportCSV(this.tm.history);
				this._showToast("CSV exported!", "success");
			});

		// State graph toolbar
		document
			.getElementById("btn-graph-reset-layout")
			.addEventListener("click", () => {
				this.stateGraph.resetLayout();
			});
		document
			.getElementById("btn-graph-zoom-fit")
			.addEventListener("click", () => {
				this.stateGraph.fitView();
			});

		// Config panel collapse toggle
		document
			.getElementById("btn-toggle-config")
			.addEventListener("click", () => {
				const panel = document.getElementById("config-panel");
				const btn = document.getElementById("btn-toggle-config");
				panel.classList.toggle("collapsed");
				btn.textContent = panel.classList.contains("collapsed") ? "▶" : "◀";
			});

		// Keyboard shortcuts
		document.addEventListener("keydown", (e) => {
			if (
				e.target.tagName === "INPUT" ||
				e.target.tagName === "TEXTAREA" ||
				e.target.tagName === "SELECT"
			)
				return;
			if (e.key === " " || e.key === "n" || e.key === "N") {
				e.preventDefault();
				if (this._running) this._pauseRun();
				else this._step();
			}
			if (e.key === "r" || e.key === "R") {
				e.preventDefault();
				this._run();
			}
			if (e.key === "Escape") this._pauseRun();
		});

		// Window resize — re-render charts and fit graph
		let resizeTimer;
		window.addEventListener("resize", () => {
			clearTimeout(resizeTimer);
			resizeTimer = setTimeout(() => {
				if (this._machineReady) {
					this.tapeRenderer.render(this.tm.tape);
				}
			}, 200);
		});
	}
}

/* ================================================================
   BOOTSTRAP
   ================================================================ */
document.addEventListener("DOMContentLoaded", () => {
	const app = new App();
	app.init();
	window._app = app; // expose for debugging in browser console
});
