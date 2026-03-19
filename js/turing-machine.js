/**
 * turing-machine.js — Core Turing Machine engine
 *
 * Supports:
 *   - Arbitrary finite state sets
 *   - Any tape alphabet with configurable blank symbol
 *   - Left (L), Right (R), and Stay (S) head moves
 *   - Multiple halt / accept states
 *   - Full computation history for time-travel replay
 *   - The tape is provided by tape.js (loaded first)
 */

class TuringMachine {
	constructor() {
		// Machine definition
		this.states = [];
		this.alphabet = [];
		this.blank = "_";
		this.startState = "";
		this.haltStates = new Set();
		// transitions: Map<"state,symbol" → {write, direction, nextState}>
		this.transitions = new Map();

		// Runtime state
		this.tape = null;
		this.currentState = "";
		this.stepCount = 0;
		this.isHalted = false;
		this.isAccepted = false;
		this.haltReason = ""; // 'accepted' | 'no_transition' | 'max_steps'

		// History: array of configuration snapshots
		this.history = [];

		// Safety limit
		this.maxSteps = 50000;
	}

	// ---------------------------------------------------------------
	// Configuration
	// ---------------------------------------------------------------

	/**
	 * Configure the machine with a definition object:
	 * {
	 *   states:     string[]   — list of state names
	 *   alphabet:   string[]   — tape symbols (including blank)
	 *   blank:      string     — the blank symbol
	 *   startState: string
	 *   haltStates: string[]
	 *   rules:      Array<{state, read, write, direction, nextState}>
	 *   maxSteps:   number?
	 * }
	 */
	configure(config) {
		this.states = [...config.states];
		this.alphabet = [...config.alphabet];
		this.blank = config.blank || "_";
		this.startState = config.startState;
		this.haltStates = new Set(config.haltStates);
		this.maxSteps = config.maxSteps || 50000;

		// Build the transition map
		this.transitions.clear();
		for (const rule of config.rules || []) {
			if (!rule.state || rule.read === undefined || rule.read === "") continue;
			const key = this._key(rule.state, rule.read);
			this.transitions.set(key, {
				write: rule.write,
				direction: rule.direction || "R",
				nextState: rule.nextState,
			});
		}
	}

	/**
	 * Initialise (or re-initialise) the machine with a given input string.
	 * Resets all runtime state and history.
	 */
	initialize(input = "") {
		this.tape = new Tape(input, this.blank);
		this.currentState = this.startState;
		this.stepCount = 0;
		this.isHalted = false;
		this.isAccepted = false;
		this.haltReason = "";
		this.history = [];

		// Check whether the start state itself is a halt state
		if (this.haltStates.has(this.currentState)) {
			this.isHalted = true;
			this.isAccepted = true;
			this.haltReason = "accepted";
		}

		// Record step 0 (initial configuration)
		this._record(null);
	}

	// ---------------------------------------------------------------
	// Execution
	// ---------------------------------------------------------------

	/**
	 * Execute exactly one transition step.
	 * Returns a result object describing what happened.
	 */
	step() {
		if (this.isHalted) {
			return { status: this.haltReason || "halted", accepted: this.isAccepted };
		}

		if (this.stepCount >= this.maxSteps) {
			this.isHalted = true;
			this.haltReason = "max_steps";
			return {
				status: "max_steps",
				accepted: false,
				message: `Safety limit reached: ${this.maxSteps} steps`,
			};
		}

		const readSym = this.tape.read();
		const key = this._key(this.currentState, readSym);
		const transition = this.transitions.get(key);

		if (!transition) {
			// Reject: no transition defined for (state, symbol)
			this.isHalted = true;
			this.isAccepted = false;
			this.haltReason = "no_transition";
			this._record(null);
			return {
				status: "no_transition",
				accepted: false,
				state: this.currentState,
				symbol: readSym,
			};
		}

		// Execute the transition
		const fromState = this.currentState;
		this.tape.write(transition.write);

		if (transition.direction === "L") this.tape.moveLeft();
		else if (transition.direction === "R") this.tape.moveRight();
		// 'S' (Stay) — no head movement

		this.currentState = transition.nextState;
		this.stepCount++;

		const applied = {
			fromState,
			read: readSym,
			write: transition.write,
			direction: transition.direction,
			nextState: transition.nextState,
		};

		// Record the configuration after applying the transition
		this._record(applied);

		// Check halt
		if (this.haltStates.has(this.currentState)) {
			this.isHalted = true;
			this.isAccepted = true;
			this.haltReason = "accepted";
		}

		return {
			status: this.isHalted ? "halted" : "running",
			accepted: this.isAccepted,
			transition: applied,
			stepCount: this.stepCount,
			currentState: this.currentState,
			headPos: this.tape.headPos,
			symbol: readSym,
			tapeNonBlank: this.tape.getNonBlankCount(),
			tapeSpan: this.tape.getSpan(),
		};
	}

	// ---------------------------------------------------------------
	// Time-travel replay
	// ---------------------------------------------------------------

	/**
	 * Restore the machine to the configuration recorded at historyIndex.
	 * This does NOT truncate history — it is a read-only jump for display/review.
	 */
	jumpToHistory(index) {
		if (index < 0 || index >= this.history.length) return false;
		const snap = this.history[index];
		this.tape.restore(snap.tape);
		this.currentState = snap.state;
		this.stepCount = snap.step;
		this.isHalted = this.haltStates.has(this.currentState) || snap.isHalted;
		this.isAccepted = snap.isAccepted;
		return true;
	}

	// ---------------------------------------------------------------
	// Getters
	// ---------------------------------------------------------------

	getConfiguration() {
		return {
			state: this.currentState,
			headPos: this.tape.headPos,
			symbol: this.tape.read(),
			step: this.stepCount,
			isHalted: this.isHalted,
			isAccepted: this.isAccepted,
			haltReason: this.haltReason,
			tapeNonBlank: this.tape.getNonBlankCount(),
			tapeSpan: this.tape.getSpan(),
		};
	}

	getConfigHash() {
		return this.tape.getConfigHash(this.currentState);
	}

	/** Return the transition rule for (state, symbol), or null */
	getTransition(state, symbol) {
		return this.transitions.get(this._key(state, symbol)) || null;
	}

	/** Validation: check machine is properly configured */
	validate() {
		const errors = [];
		if (!this.startState) errors.push("No start state defined");
		if (this.haltStates.size === 0) errors.push("No halt states defined");
		if (!this.states.includes(this.startState))
			errors.push(`Start state "${this.startState}" not in state list`);
		for (const h of this.haltStates) {
			if (!this.states.includes(h))
				errors.push(`Halt state "${h}" not in state list`);
		}
		return errors;
	}

	// ---------------------------------------------------------------
	// Private helpers
	// ---------------------------------------------------------------

	_key(state, symbol) {
		return `${state},${symbol}`;
	}

	_record(appliedTransition) {
		this.history.push({
			step: this.stepCount,
			state: this.currentState,
			headPos: this.tape.headPos,
			tape: this.tape.snapshot(),
			tapeStr: this.tape.toCompactString(),
			transition: appliedTransition,
			isHalted: this.isHalted,
			isAccepted: this.isAccepted,
			tapeNonBlank: this.tape.getNonBlankCount(),
			tapeSpan: this.tape.getSpan(),
		});
	}
}
