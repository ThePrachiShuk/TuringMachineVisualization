/**
 * timeline.js — Computation Trace Timeline
 *
 * Maintains and renders the full history of machine configurations
 * as a scrollable, clickable table — enabling "time-travel" debugging.
 *
 * Each row shows:
 *   Step | State | Head | Read | Write | Dir | Next State | Tape Snapshot
 *
 * Clicking any row triggers a callback so main.js can restore
 * the machine and UI to that moment in history.
 */

class Timeline {
	/**
	 * @param {string}   tbodyId   — id of the <tbody> element
	 * @param {Function} onJump    — callback(stepIndex) when a row is clicked
	 */
	constructor(tbodyId, onJump) {
		this.tbody = document.getElementById(tbodyId);
		this.onJump = onJump;
		this._currentStep = 0;

		// Stats elements
		this._elStepCount = document.getElementById("tl-step-count");
		this._elTapeCells = document.getElementById("tl-tape-cells");

		// Virtual rendering: only render recent rows to the DOM
		// to handle very long computations without freezing the browser.
		this._renderedUpTo = -1;
		this._BATCH_SIZE = 50;
	}

	// ---------------------------------------------------------------
	// Public API
	// ---------------------------------------------------------------

	/** Clear all rows (called on machine reset) */
	reset() {
		this.tbody.innerHTML = `
      <tr class="timeline-empty-row">
        <td colspan="8">Run the simulation to see computation history</td>
      </tr>`;
		this._renderedUpTo = -1;
		this._currentStep = 0;
		this._updateStats(0, 0);
	}

	/**
	 * Append a new history entry for the step that just occurred.
	 * @param {object} entry — from tm.history (the latest entry)
	 * @param {number} historyLength — total entries in tm.history
	 */
	appendStep(entry, historyLength) {
		// Remove the placeholder row if it's still there
		const emptyRow = this.tbody.querySelector(".timeline-empty-row");
		if (emptyRow) emptyRow.remove();

		if (this._renderedUpTo < 0) {
			this._renderedUpTo = 0;
			this.tbody.innerHTML = "";
		}

		// Only render every few steps for performance, always render step 0
		if (
			entry.step === 0 ||
			historyLength - 1 <= this._renderedUpTo + this._BATCH_SIZE
		) {
			const tr = this._buildRow(entry, historyLength - 1);
			this.tbody.appendChild(tr);
			this._renderedUpTo = historyLength - 1;
		}

		this._updateStats(entry.step, entry.tapeNonBlank);
	}

	/**
	 * Batch-rebuild the entire table from a history array.
	 * Used when jumping to a step or reloading.
	 */
	rebuildFrom(history) {
		this.tbody.innerHTML = "";
		this._renderedUpTo = -1;

		if (!history || history.length === 0) {
			this.reset();
			return;
		}

		// For large histories show a summary at intervals
		const step = history.length > 500 ? Math.floor(history.length / 200) : 1;

		for (let i = 0; i < history.length; i += step) {
			const tr = this._buildRow(history[i], i);
			this.tbody.appendChild(tr);
		}
		// Always show the last entry
		if ((history.length - 1) % step !== 0) {
			const tr = this._buildRow(
				history[history.length - 1],
				history.length - 1,
			);
			this.tbody.appendChild(tr);
		}

		this._renderedUpTo = history.length - 1;
		const last = history[history.length - 1];
		this._updateStats(last.step, last.tapeNonBlank);
	}

	/**
	 * Highlight the row for the currently active step.
	 */
	setCurrentStep(historyIndex) {
		this._currentStep = historyIndex;

		// Remove old highlight
		const prev = this.tbody.querySelector("tr.current-step");
		if (prev) prev.classList.remove("current-step");

		// Find the row with matching data-index
		const rows = this.tbody.querySelectorAll("tr[data-index]");
		let best = null,
			bestDist = Infinity;
		for (const row of rows) {
			const idx = parseInt(row.dataset.index, 10);
			const dist = Math.abs(idx - historyIndex);
			if (dist < bestDist) {
				bestDist = dist;
				best = row;
			}
		}
		if (best) {
			best.classList.add("current-step");
			best.scrollIntoView({ block: "nearest", behavior: "smooth" });
		}
	}

	// ---------------------------------------------------------------
	// CSV Export
	// ---------------------------------------------------------------

	exportCSV(history) {
		const headers = [
			"Step",
			"State",
			"Head",
			"Read",
			"Write",
			"Direction",
			"NextState",
			"TapeSnapshot",
		];
		const rows = history.map((e) => [
			e.step,
			e.state,
			e.headPos,
			e.transition ? e.transition.read : "",
			e.transition ? e.transition.write : "",
			e.transition ? e.transition.direction : "",
			e.transition ? e.transition.nextState : "",
			`"${e.tapeStr}"`,
		]);

		const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
		const blob = new Blob([csv], { type: "text/csv" });
		const url = URL.createObjectURL(blob);
		const a = document.createElement("a");
		a.href = url;
		a.download = "tm_trace.csv";
		a.click();
		URL.revokeObjectURL(url);
	}

	// ---------------------------------------------------------------
	// Private helpers
	// ---------------------------------------------------------------

	_buildRow(entry, historyIndex) {
		const tr = document.createElement("tr");
		tr.dataset.index = historyIndex;
		if (historyIndex === this._currentStep) tr.classList.add("current-step");

		const t = entry.transition;

		tr.innerHTML = `
      <td>${entry.step}</td>
      <td style="color:var(--accent-purple);font-weight:700">${entry.state}</td>
      <td style="font-family:var(--font-mono)">${entry.headPos}</td>
      <td style="font-family:var(--font-mono);color:var(--accent-cyan)">${t ? t.read : "—"}</td>
      <td style="font-family:var(--font-mono);color:var(--accent-yellow)">${t ? t.write : "—"}</td>
      <td style="color:var(--text-secondary)">${t ? t.direction : "—"}</td>
      <td style="color:var(--accent-blue)">${t ? t.nextState : "—"}</td>
      <td class="tape-snapshot-cell">${this._renderTapeSnap(entry)}</td>
    `;

		tr.addEventListener("click", () => {
			if (this.onJump) this.onJump(historyIndex);
		});

		return tr;
	}

	_renderTapeSnap(entry) {
		const raw = entry.tapeStr || "";
		// Split on [X] tokens (head marker) so we never apply a second regex
		// over already-generated HTML, which would corrupt the tag attributes.
		return raw
			.split(/(\[.\])/)
			.map((part) => {
				if (!part) return "";
				if (/^\[.\]$/.test(part))
					return `<span class="tape-snap-head">${part}</span>`;
				return `<span class="tape-snap-written">${part}</span>`;
			})
			.join("");
	}

	_updateStats(step, tapeCells) {
		if (this._elStepCount) this._elStepCount.textContent = step;
		if (this._elTapeCells) this._elTapeCells.textContent = tapeCells;
	}
}
