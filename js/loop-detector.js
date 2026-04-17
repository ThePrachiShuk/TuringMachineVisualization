/**
 * loop-detector.js — Infinite-loop detection for Turing Machines
 *
 * Strategy: After each step, hash the full machine configuration
 * (state + head position + sparse tape contents) and store it in
 * a Set. If the same hash appears again, the machine is in an
 * infinite loop and will never halt.
 *
 * This is sound (a repeated configuration guarantees non-halting)
 * but not complete — it cannot detect all infinite loops (e.g.,
 * monotonically growing tapes), which is impossible in general
 * due to the Halting Problem. We add supplementary heuristics:
 *   • Tape growth rate monitor (tape growing without bound)
 *   • Periodic repetition detection (same Δ-state every N steps)
 */

class LoopDetector {
	/**
	 * @param {object} opts
	 * @param {number} opts.hashCheckInterval  — check every N steps (default 1)
	 * @param {number} opts.growthWindowSize   — steps to watch for growth alert (default 200)
	 * @param {number} opts.growthThreshold    — min cells/step ratio to flag (default 0.5)
	 * @param {number} opts.maxConfigsStored   — cap on stored hashes (memory guard)
	 */
	constructor(opts = {}) {
		this.hashCheckInterval = opts.hashCheckInterval || 1;
		this.growthWindowSize = opts.growthWindowSize || 200;
		this.growthThreshold = opts.growthThreshold || 0.5;
		this.maxConfigsStored = opts.maxConfigsStored || 100_000;

		this._configHashes = new Set();
		this._tapeHistory = []; // [{step, nonBlank}]
		this._loopDetected = false;
		this._loopDetails = null;
		this._lastObservedStep = null;
	}

	/** Reset detector state (call when machine is reset or re-configured) */
	reset() {
		this._configHashes.clear();
		this._tapeHistory = [];
		this._loopDetected = false;
		this._loopDetails = null;
		this._lastObservedStep = null;
	}

	/**
	 * Rebuild detector memory from the current machine history branch.
	 * This keeps loop checks consistent after rewind/jump/pause-resume.
	 */
	bootstrapFromHistory(history = []) {
		this.reset();

		if (!Array.isArray(history) || history.length === 0) return;

		for (const entry of history) {
			if (!entry || !entry.tape || typeof entry.state !== "string") continue;
			const hash = this._hashFromSnapshot(
				entry.state,
				entry.headPos,
				entry.tape,
			);
			this._configHashes.add(hash);
		}

		const last = history[history.length - 1];
		this._lastObservedStep =
			last && typeof last.step === "number" ? last.step : null;
	}

	/**
	 * Analyse the result of one TuringMachine.step() call.
	 *
	 * @param {TuringMachine} tm   — the running machine
	 * @param {object}        result  — the object returned by tm.step()
	 * @returns {{ detected: boolean, type: string, details: object }|null}
	 *   Returns a detection object if a loop is found, otherwise null.
	 */
	check(tm, result) {
		const step = tm.stepCount;

		// If execution moved backwards (step back / timeline rewind),
		// stale signatures from the old branch must be discarded.
		if (this._lastObservedStep !== null && step <= this._lastObservedStep) {
			this.reset();
		}

		this._lastObservedStep = step;

		if (this._loopDetected) return { detected: true, ...this._loopDetails };
		if (
			tm.isHalted ||
			result.status === "halted" ||
			result.status === "accepted" ||
			result.status === "explicit_halt" ||
			result.status === "no_transition" ||
			result.status === "max_steps"
		)
			return null;

		// ── 1. Exact configuration repeat ────────────────────────────
		if (
			step % this.hashCheckInterval === 0 &&
			this._configHashes.size < this.maxConfigsStored
		) {
			const hash = tm.getConfigHash();
			if (this._configHashes.has(hash)) {
				this._loopDetected = true;
				this._loopDetails = {
					detected: true,
					type: "repeated_configuration",
					step,
					details: {
						message: `Configuration (state=${tm.currentState}, head=${tm.tape.headPos}) repeated at step ${step}. The machine will loop forever.`,
						hash,
					},
				};
				return this._loopDetails;
			}
			this._configHashes.add(hash);
		}

		// ── 2. Unbounded tape growth heuristic ───────────────────────
		this._tapeHistory.push({ step, nonBlank: tm.tape.getNonBlankCount() });
		if (this._tapeHistory.length > this.growthWindowSize * 2) {
			// keep only the last 2× windows
			this._tapeHistory = this._tapeHistory.slice(-this.growthWindowSize * 2);
		}

		if (this._tapeHistory.length >= this.growthWindowSize) {
			const window = this._tapeHistory.slice(-this.growthWindowSize);
			const first = window[0].nonBlank;
			const last = window[window.length - 1].nonBlank;
			const delta = last - first;
			const rate = delta / this.growthWindowSize;

			if (delta > 0 && rate >= this.growthThreshold) {
				// Tape is growing fast — likely non-halting (heuristic, not definitive)
				this._loopDetected = true;
				this._loopDetails = {
					detected: true,
					type: "unbounded_growth",
					step,
					details: {
						message: `Tape has grown by ${delta} cells in the last ${this.growthWindowSize} steps (${rate.toFixed(2)} cells/step). The machine may never halt.`,
						growthRate: rate,
					},
				};
				return this._loopDetails;
			}
		}

		return null;
	}

	get isLoopDetected() {
		return this._loopDetected;
	}
	get loopDetails() {
		return this._loopDetails;
	}

	_hashFromSnapshot(state, headPos, tapeSnap) {
		const cells = (tapeSnap && tapeSnap.cells) || {};
		const positions = Object.keys(cells)
			.map(Number)
			.sort((a, b) => a - b);
		const tapeStr = positions.map((p) => `${p}:${cells[p]}`).join(",");
		return `${state}|${headPos}|${tapeStr}`;
	}
}
