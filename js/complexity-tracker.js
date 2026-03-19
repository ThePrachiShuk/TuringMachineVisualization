/**
 * complexity-tracker.js — Live computational complexity analysis
 *
 * Tracks time (steps) and space (tape cells) usage and visualises
 * them as live D3.js line charts that update during execution.
 *
 * Charts:
 *   1. Tape Cells Used  vs. Steps  (space complexity)
 *   2. Head Position    vs. Steps  (head movement pattern)
 *
 * Also maintains aggregate statistics displayed in the stat-cards.
 */

class ComplexityTracker {
	/**
	 * @param {string} chartTapeGrowthId  — container div id for chart 1
	 * @param {string} chartHeadPosId     — container div id for chart 2
	 */
	constructor(chartTapeGrowthId, chartHeadPosId) {
		this._tapeGrowthCtr = document.getElementById(chartTapeGrowthId);
		this._headPosCtr = document.getElementById(chartHeadPosId);

		// Data series
		this._tapeData = []; // [{step, cells}]
		this._headData = []; // [{step, pos}]

		// Aggregate stats
		this._maxTape = 0;
		this._maxSpan = 0;
		this._totalCells = 0; // sum for average

		// Stat-card elements
		this._elSteps = document.getElementById("stat-total-steps");
		this._elMaxTape = document.getElementById("stat-max-tape");
		this._elSpan = document.getElementById("stat-tape-span");
		this._elAvg = document.getElementById("stat-avg-cells");

		// D3 chart handles
		this._chartTape = null;
		this._chartHead = null;

		// Throttle chart updates to avoid excessive redraws
		this._lastRenderStep = -1;
		this._RENDER_EVERY = 5; // redraw every N steps

		// Build empty charts
		this._initCharts();
	}

	// ---------------------------------------------------------------
	// Public API
	// ---------------------------------------------------------------

	reset() {
		this._tapeData = [];
		this._headData = [];
		this._maxTape = 0;
		this._maxSpan = 0;
		this._totalCells = 0;
		this._lastRenderStep = -1;
		this._updateStatCards(0, 0, 0, 0);
		this._renderChart(
			this._chartTape,
			this._tapeData,
			"Steps",
			"Tape Cells",
			"#7c8cf8",
		);
		this._renderChart(
			this._chartHead,
			this._headData,
			"Steps",
			"Head Position",
			"#f6c90e",
		);
	}

	/**
	 * Record a single step's data.
	 * @param {object} result — from TuringMachine.step() or history entry
	 */
	record(result) {
		const step = result.step !== undefined ? result.step : result.stepCount;
		const cells = result.tapeNonBlank !== undefined ? result.tapeNonBlank : 0;
		const span = result.tapeSpan !== undefined ? result.tapeSpan : 0;
		const head = result.headPos !== undefined ? result.headPos : 0;

		this._tapeData.push({ step, cells });
		this._headData.push({ step, pos: head });

		if (cells > this._maxTape) this._maxTape = cells;
		if (span > this._maxSpan) this._maxSpan = span;
		this._totalCells += cells;

		const avg = step > 0 ? (this._totalCells / (step + 1)).toFixed(1) : 0;
		this._updateStatCards(step, this._maxTape, this._maxSpan, avg);

		// Throttle rendering
		if (step - this._lastRenderStep >= this._RENDER_EVERY || step === 0) {
			this._lastRenderStep = step;
			this._renderChart(
				this._chartTape,
				this._tapeData,
				"Steps",
				"Tape Cells",
				"#7c8cf8",
			);
			this._renderChart(
				this._chartHead,
				this._headData,
				"Steps",
				"Head Position",
				"#f6c90e",
			);
		}
	}

	/** Rebuild charts from a full history array */
	rebuildFrom(history) {
		this.reset();
		const step = history.length > 300 ? Math.ceil(history.length / 150) : 1;
		for (let i = 0; i < history.length; i += step) {
			const e = history[i];
			this._tapeData.push({ step: e.step, cells: e.tapeNonBlank });
			this._headData.push({ step: e.step, pos: e.headPos });
			if (e.tapeNonBlank > this._maxTape) this._maxTape = e.tapeNonBlank;
			if (e.tapeSpan > this._maxSpan) this._maxSpan = e.tapeSpan;
			this._totalCells += e.tapeNonBlank;
		}
		if (history.length > 0) {
			const last = history[history.length - 1];
			const avg = (this._totalCells / history.length).toFixed(1);
			this._updateStatCards(last.step, this._maxTape, this._maxSpan, avg);
		}
		this._renderChart(
			this._chartTape,
			this._tapeData,
			"Steps",
			"Tape Cells",
			"#7c8cf8",
		);
		this._renderChart(
			this._chartHead,
			this._headData,
			"Steps",
			"Head Position",
			"#f6c90e",
		);
	}

	// ---------------------------------------------------------------
	// Chart initialisation
	// ---------------------------------------------------------------

	_initCharts() {
		this._chartTape = this._createChartHandle(this._tapeGrowthCtr);
		this._chartHead = this._createChartHandle(this._headPosCtr);
	}

	_createChartHandle(container) {
		return { container, svg: null, xScale: null, yScale: null };
	}

	// ---------------------------------------------------------------
	// D3 rendering
	// ---------------------------------------------------------------

	_renderChart(chart, data, xLabel, yLabel, lineColor) {
		if (!chart.container) return;

		const margin = { top: 15, right: 20, bottom: 35, left: 50 };
		const W = chart.container.clientWidth || 400;
		const H = chart.container.clientHeight || 200;
		const iW = W - margin.left - margin.right;
		const iH = H - margin.top - margin.bottom;

		if (iW <= 0 || iH <= 0) return;

		// Clear and rebuild SVG
		d3.select(chart.container).selectAll("svg").remove();

		const svg = d3
			.select(chart.container)
			.append("svg")
			.attr("width", W)
			.attr("height", H);

		const g = svg
			.append("g")
			.attr("transform", `translate(${margin.left},${margin.top})`);

		// Empty state
		if (!data || data.length === 0) {
			g.append("text")
				.attr("x", iW / 2)
				.attr("y", iH / 2)
				.attr("text-anchor", "middle")
				.style("fill", "#525a7a")
				.style("font-size", "12px")
				.text("Run the machine to see chart data");
			return;
		}

		const xKey = data[0].step !== undefined ? "step" : "step";
		const yKey = data[0].cells !== undefined ? "cells" : "pos";

		const xExtent = d3.extent(data, (d) => d[xKey]);
		const yExtent = d3.extent(data, (d) => d[yKey]);

		// Handle flat series (all zeros)
		const yMin = Math.min(0, yExtent[0] || 0);
		const yMax = Math.max(1, yExtent[1] || 1);

		const xScale = d3.scaleLinear().domain(xExtent).range([0, iW]).nice();
		const yScale = d3.scaleLinear().domain([yMin, yMax]).range([iH, 0]).nice();

		// Grid lines
		g.append("g")
			.attr("class", "chart-grid")
			.call(d3.axisLeft(yScale).ticks(4).tickSize(-iW).tickFormat(""))
			.call((gEl) => {
				gEl.select(".domain").remove();
				gEl
					.selectAll("line")
					.style("stroke", "#2a2d4a")
					.style("stroke-dasharray", "3,5")
					.style("opacity", 0.6);
			});

		// Area fill
		const area = d3
			.area()
			.x((d) => xScale(d[xKey]))
			.y0(iH)
			.y1((d) => yScale(d[yKey]))
			.curve(d3.curveCatmullRom.alpha(0.5));

		g.append("path")
			.datum(data)
			.attr("fill", lineColor)
			.attr("opacity", 0.1)
			.attr("d", area);

		// Line
		const line = d3
			.line()
			.x((d) => xScale(d[xKey]))
			.y((d) => yScale(d[yKey]))
			.curve(d3.curveCatmullRom.alpha(0.5));

		g.append("path")
			.datum(data)
			.attr("fill", "none")
			.attr("stroke", lineColor)
			.attr("stroke-width", 2)
			.attr("stroke-linejoin", "round")
			.attr("stroke-linecap", "round")
			.attr("d", line);

		// Last point dot
		const last = data[data.length - 1];
		g.append("circle")
			.attr("cx", xScale(last[xKey]))
			.attr("cy", yScale(last[yKey]))
			.attr("r", 4)
			.attr("fill", lineColor)
			.attr("stroke", "#0d0e17")
			.attr("stroke-width", 2);

		// Axes
		g.append("g")
			.attr("transform", `translate(0,${iH})`)
			.call(d3.axisBottom(xScale).ticks(5).tickFormat(d3.format("~s")))
			.call((gEl) => {
				gEl.select(".domain").style("stroke", "#2a2d4a");
				gEl
					.selectAll("text")
					.style("fill", "#525a7a")
					.style("font-size", "10px")
					.style("font-family", "'Fira Code', monospace");
				gEl.selectAll("line").style("stroke", "#2a2d4a");
			});

		g.append("g")
			.call(d3.axisLeft(yScale).ticks(4).tickFormat(d3.format("~s")))
			.call((gEl) => {
				gEl.select(".domain").style("stroke", "#2a2d4a");
				gEl
					.selectAll("text")
					.style("fill", "#525a7a")
					.style("font-size", "10px")
					.style("font-family", "'Fira Code', monospace");
				gEl.selectAll("line").style("stroke", "#2a2d4a");
			});

		// Axis labels
		g.append("text")
			.attr("transform", `translate(${iW / 2}, ${iH + 28})`)
			.style("text-anchor", "middle")
			.style("fill", "#525a7a")
			.style("font-size", "10px")
			.text(xLabel);

		g.append("text")
			.attr("transform", "rotate(-90)")
			.attr("y", -40)
			.attr("x", -(iH / 2))
			.style("text-anchor", "middle")
			.style("fill", "#525a7a")
			.style("font-size", "10px")
			.text(yLabel);
	}

	_updateStatCards(steps, maxTape, span, avg) {
		if (this._elSteps) this._elSteps.textContent = steps;
		if (this._elMaxTape) this._elMaxTape.textContent = maxTape;
		if (this._elSpan) this._elSpan.textContent = span;
		if (this._elAvg) this._elAvg.textContent = avg;
	}
}
