/**
 * tape.js — Infinite Tape data structure for Turing Machine
 *
 * Uses a sparse hash-map (plain JS object) to store tape cells,
 * giving us true infinite tape support in both directions without
 * pre-allocating memory.
 */

class Tape {
	/**
	 * @param {string} input  — initial tape contents (string of symbols)
	 * @param {string} blank  — the blank symbol (default '_')
	 */
	constructor(input = "", blank = "_") {
		this.blank = blank;
		this.cells = {}; // { position (int) : symbol (string) }
		this.headPos = 0;
		this.leftmost = 0;
		this.rightmost = 0;

		// Write each input character onto the tape starting at position 0
		for (let i = 0; i < input.length; i++) {
			const sym = input[i];
			if (sym !== this.blank) {
				this.cells[i] = sym;
			}
			if (i > this.rightmost) this.rightmost = i;
		}
	}

	// -----------------------------------------------------------------
	// Core operations
	// -----------------------------------------------------------------

	/** Read the symbol under the head (returns blank if cell is empty) */
	read() {
		return this.cells[this.headPos] !== undefined
			? this.cells[this.headPos]
			: this.blank;
	}

	/** Write a symbol under the head */
	write(symbol) {
		if (symbol === this.blank) {
			// Erasure: remove cell to keep tape sparse
			delete this.cells[this.headPos];
		} else {
			this.cells[this.headPos] = symbol;
		}
		this._updateBounds();
	}

	/** Move head one cell to the left */
	moveLeft() {
		this.headPos--;
		if (this.headPos < this.leftmost) this.leftmost = this.headPos;
	}

	/** Move head one cell to the right */
	moveRight() {
		this.headPos++;
		if (this.headPos > this.rightmost) this.rightmost = this.headPos;
	}

	// -----------------------------------------------------------------
	// Metrics
	// -----------------------------------------------------------------

	/** Number of non-blank cells currently on the tape */
	getNonBlankCount() {
		return Object.keys(this.cells).length;
	}

	/**
	 * Total span from leftmost ever-visited position
	 * to rightmost ever-visited position.
	 */
	getSpan() {
		return this.rightmost - this.leftmost + 1;
	}

	// -----------------------------------------------------------------
	// Rendering helpers
	// -----------------------------------------------------------------

	/**
	 * Returns an array of {pos, symbol, isHead, hasContent} objects
	 * covering from (leftmost - padding) to (rightmost + padding),
	 * always including the current head position.
	 */
	getVisibleRange(padding = 4) {
		const start = Math.min(this.leftmost, this.headPos) - padding;
		const end = Math.max(this.rightmost, this.headPos) + padding;
		const result = [];
		for (let i = start; i <= end; i++) {
			result.push({
				pos: i,
				symbol: this.cells[i] !== undefined ? this.cells[i] : this.blank,
				isHead: i === this.headPos,
				hasContent: this.cells[i] !== undefined,
			});
		}
		return result;
	}

	/**
	 * Human-readable tape string, e.g. "_10[1]01_"
	 * where [x] marks the head position.
	 */
	toString() {
		return this.getVisibleRange(1)
			.map((c) => (c.isHead ? `[${c.symbol}]` : c.symbol))
			.join("");
	}

	/**
	 * Compact representation showing only non-blank cells + head,
	 * useful for the timeline snapshot column.
	 */
	toCompactString() {
		const positions = [
			...new Set([...Object.keys(this.cells).map(Number), this.headPos]),
		].sort((a, b) => a - b);

		return positions
			.map((p) => {
				const sym = this.cells[p] !== undefined ? this.cells[p] : this.blank;
				return p === this.headPos ? `[${sym}]` : sym;
			})
			.join("");
	}

	// -----------------------------------------------------------------
	// Loop detection
	// -----------------------------------------------------------------

	/**
	 * Returns a deterministic string hash of the full tape configuration
	 * (current state must be passed in, since the tape alone is not enough
	 * to identify a configuration).
	 */
	getConfigHash(state) {
		const positions = Object.keys(this.cells)
			.map(Number)
			.sort((a, b) => a - b);
		const tapeStr = positions.map((p) => `${p}:${this.cells[p]}`).join(",");
		return `${state}|${this.headPos}|${tapeStr}`;
	}

	// -----------------------------------------------------------------
	// History / snapshot
	// -----------------------------------------------------------------

	/** Returns a deep-copyable snapshot of the current tape state */
	snapshot() {
		return {
			cells: { ...this.cells },
			headPos: this.headPos,
			leftmost: this.leftmost,
			rightmost: this.rightmost,
		};
	}

	/** Restore tape to a previously captured snapshot */
	restore(snap) {
		this.cells = { ...snap.cells };
		this.headPos = snap.headPos;
		this.leftmost = snap.leftmost;
		this.rightmost = snap.rightmost;
	}

	// -----------------------------------------------------------------
	// Private helpers
	// -----------------------------------------------------------------

	_updateBounds() {
		const positions = Object.keys(this.cells).map(Number);
		if (positions.length > 0) {
			this.leftmost = Math.min(this.headPos, ...positions);
			this.rightmost = Math.max(this.headPos, ...positions);
		} else {
			this.leftmost = this.headPos;
			this.rightmost = this.headPos;
		}
	}
}
