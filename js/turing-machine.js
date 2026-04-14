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
		this.finalStates = new Set();
		this.rejectStates = new Set();
		this.haltingStates = new Set();
		// transitions: Map<"state,symbol" → {next, write, move, halt}>
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
	 *   acceptStates: string[]  (final/accepting states)
	 *   rejectStates: string[]  (explicit reject-halt states)
	 *   haltStates: string[]    (legacy alias for acceptStates)
	 *   rules:      Array<{state, read, write, move, next, halt}>
	 *   maxSteps:   number?
	 * }
	 */
	configure(config) {
		this.states = [...config.states];
		this.alphabet = [...config.alphabet];
		this.blank = config.blank || "_";
		this.startState = config.startState;
		this.finalStates = new Set(config.acceptStates || config.haltStates || []);
		this.rejectStates = new Set(config.rejectStates || []);
		this.haltingStates = new Set([...this.finalStates, ...this.rejectStates]);
		this.maxSteps = config.maxSteps || 50000;

		// Build the transition map
		this.transitions.clear();
		for (const rule of config.rules || []) {
			if (!rule.state || rule.read === undefined || rule.read === "") continue;
			const key = this._key(rule.state, rule.read);
			const move = rule.move || rule.direction || "R";
			const next = rule.next || rule.nextState || "";
			this.transitions.set(key, {
				next,
				write: rule.write,
				move,
				halt: Boolean(rule.halt),
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
			this.isHalted = true;
			this.isAccepted = this.finalStates.has(this.currentState);
			this.haltReason = "no_transition";
			this._record(null);
			return {
				status: "no_transition",
				accepted: this.isAccepted,
				state: this.currentState,
				symbol: readSym,
			};
		}

		if (transition.halt) {
			this.isHalted = true;
			this.isAccepted = this.finalStates.has(this.currentState);
			this.haltReason = "explicit_halt";
			const applied = {
				fromState: this.currentState,
				read: readSym,
				halt: true,
			};
			this._record(applied);
			return {
				status: "explicit_halt",
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

		// Execute the transition
		const fromState = this.currentState;
		this.tape.write(transition.write);

		if (transition.move === "L") this.tape.moveLeft();
		else this.tape.moveRight();

		this.currentState = transition.next;
		this.stepCount++;

		const applied = {
			fromState,
			read: readSym,
			write: transition.write,
			move: transition.move,
			next: transition.next,
			halt: false,
		};

		// Record the configuration after applying the transition
		this._record(applied);

		return {
			status: "running",
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
		this.isHalted = snap.isHalted;
		this.isAccepted = snap.isAccepted;
		this.haltReason = snap.haltReason || "";
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
		if (this.finalStates.size === 0)
			errors.push("No final states defined for acceptance");
		if (!this.states.includes(this.startState))
			errors.push(`Start state "${this.startState}" not in state list`);
		for (const h of this.finalStates) {
			if (!this.states.includes(h))
				errors.push(`Final state "${h}" not in state list`);
		}
		for (const r of this.rejectStates) {
			if (!this.states.includes(r))
				errors.push(`Reject state "${r}" not in state list`);
		}
		for (const a of this.finalStates) {
			if (this.rejectStates.has(a)) {
				errors.push(`State "${a}" cannot be both accept and reject`);
			}
		}

		for (const [key, t] of this.transitions.entries()) {
			const [state, symbol] = key.split(",");
			if (!this.states.includes(state)) {
				errors.push(`Transition uses unknown state "${state}"`);
			}
			if (!this.alphabet.includes(symbol) && symbol !== this.blank) {
				errors.push(`Transition reads invalid symbol "${symbol}"`);
			}
			if (t.halt) continue;
			if (!this.states.includes(t.next)) {
				errors.push(`Transition points to unknown state "${t.next}"`);
			}
			if (!this.alphabet.includes(t.write) && t.write !== this.blank) {
				errors.push(`Transition writes invalid symbol "${t.write}"`);
			}
			if (t.move !== "L" && t.move !== "R") {
				errors.push(`Transition move must be L or R, got "${t.move}"`);
			}
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
			haltReason: this.haltReason,
			tapeNonBlank: this.tape.getNonBlankCount(),
			tapeSpan: this.tape.getSpan(),
		});
	}
}
