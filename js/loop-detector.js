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
	}

	/** Reset detector state (call when machine is reset or re-configured) */
	reset() {
		this._configHashes.clear();
		this._tapeHistory = [];
		this._loopDetected = false;
		this._loopDetails = null;
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
		if (this._loopDetected) return { detected: true, ...this._loopDetails };
		if (result.status === "halted" || result.status === "accepted") return null;

		const step = tm.stepCount;

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
}
