/**
 * state-graph.js — Animated D3.js State Transition Graph
 *
 * Renders the Turing Machine's state diagram as an interactive,
 * force-directed graph where:
 *   • Nodes  = states (double-ring for halt states, arrow for start)
 *   • Edges  = transition rules, labelled "read/write,dir"
 *   • Active node and edge highlight in real-time during execution
 *
 * Requires D3.js v7 (loaded via CDN in index.html).
 */

class StateGraph {
	constructor(svgId, containerId) {
		this.svgEl = document.getElementById(svgId);
		this.containerEl = document.getElementById(containerId);
		this.svg = d3.select(`#${svgId}`);
		this.g = null; // main group (for zoom/pan)

		this._nodes = []; // { id, isStart, isHalt }
		this._links = []; // { source, target, labels[], id }
		this._simulation = null;
		this._zoom = null;

		this._activeState = null;
		this._activeTransition = null; // { fromState, nextState, read }

		// Visual constants
		this.NODE_R = 28;
		this.COLORS = {
			nodeFill: "#1e2035",
			nodeStroke: "#7c8cf8",
			haltStroke: "#2ecc71",
			startStroke: "#00d4ff",
			activeStroke: "#f6c90e",
			activeFill: "rgba(246,201,14,0.15)",
			edgeNormal: "#7c8cf8",
			edgeActive: "#f6c90e",
			labelNormal: "#8892b0",
			labelActive: "#f6c90e",
		};
	}

	// ---------------------------------------------------------------
	// Public API
	// ---------------------------------------------------------------

	/**
	 * (Re)build the graph for a new machine configuration.
	 * @param {string[]} states
	 * @param {Map}      transitions  — the tm.transitions Map
	 * @param {string}   startState
	 * @param {Set}      haltStates
	 */
	build(states, transitions, startState, haltStates) {
		this._activeState = startState;
		this._activeTransition = null;

		// Build node list
		this._nodes = states.map((s) => ({
			id: s,
			isStart: s === startState,
			isHalt: haltStates.has(s),
		}));

		// Build edge list — group multiple rules between the same
		// (source, target) pair into one edge with multiple labels
		const edgeMap = new Map();
		for (const [key, rule] of transitions.entries()) {
			const [fromState, readSym] = key.split(",");
			const edgeKey = `${fromState}→${rule.nextState}`;
			if (!edgeMap.has(edgeKey)) {
				edgeMap.set(edgeKey, {
					source: fromState,
					target: rule.nextState,
					id: edgeKey,
					labels: [],
					isSelf: fromState === rule.nextState,
				});
			}
			edgeMap.get(edgeKey).labels.push({
				read: readSym,
				write: rule.write,
				direction: rule.direction,
			});
		}
		this._links = [...edgeMap.values()];

		this._render();
	}

	/**
	 * Highlight the active state and the transition just taken.
	 * Called after every step().
	 */
	update(activeState, lastTransition) {
		this._activeState = activeState;
		this._activeTransition = lastTransition; // { fromState, nextState, read }
		this._applyHighlights();
	}

	/** Reset highlights to initial state */
	resetHighlights(startState) {
		this._activeState = startState;
		this._activeTransition = null;
		this._applyHighlights();
	}

	// ---------------------------------------------------------------
	// Rendering
	// ---------------------------------------------------------------

	_render() {
		const svgEl = this.svgEl;
		if (!svgEl) return;

		const W = svgEl.clientWidth || 800;
		const H = svgEl.clientHeight || 500;

		// Clear previous content
		this.svg.selectAll("*").remove();

		// Show/hide the empty-state message
		const emptyMsg = document.getElementById("graph-empty-msg");
		if (emptyMsg) emptyMsg.style.display = "none";

		// ── Zoom/pan behaviour ────────────────────────────────────────
		this._zoom = d3
			.zoom()
			.scaleExtent([0.3, 3])
			.on("zoom", (event) => {
				this.g.attr("transform", event.transform);
			});
		this.svg.call(this._zoom);

		this.g = this.svg.append("g");

		// ── Arrow markers ─────────────────────────────────────────────
		const defs = this.svg.select("defs");

		defs.select("#arrow").remove();
		defs.select("#arrow-active").remove();

		["arrow", "arrow-active"].forEach((id) => {
			const color =
				id === "arrow-active" ? this.COLORS.edgeActive : this.COLORS.edgeNormal;
			defs
				.append("marker")
				.attr("id", id)
				.attr("viewBox", "0 -5 10 10")
				.attr("refX", this.NODE_R + 11)
				.attr("refY", 0)
				.attr("markerWidth", 8)
				.attr("markerHeight", 8)
				.attr("orient", "auto")
				.append("path")
				.attr("d", "M0,-5L10,0L0,5")
				.attr("fill", color);
		});

		// ── D3 Force Simulation ───────────────────────────────────────
		const nodeCount = this._nodes.length;
		const idealDist = Math.min(200, Math.max(120, 600 / (nodeCount || 1)));

		this._simulation = d3
			.forceSimulation(this._nodes)
			.force(
				"link",
				d3
					.forceLink(this._links)
					.id((d) => d.id)
					.distance(idealDist)
					.strength(0.6),
			)
			.force("charge", d3.forceManyBody().strength(-400))
			.force("center", d3.forceCenter(W / 2, H / 2))
			.force("collide", d3.forceCollide(this.NODE_R + 20));

		// ── Edges ─────────────────────────────────────────────────────
		const edgeGroup = this.g.append("g").attr("class", "edges");

		const edgeSel = edgeGroup
			.selectAll("g.edge")
			.data(this._links, (d) => d.id)
			.enter()
			.append("g")
			.attr("class", "edge")
			.attr("data-source", (d) => d.source.id || d.source)
			.attr("data-target", (d) => d.target.id || d.target);

		// Curved path
		edgeSel
			.append("path")
			.attr("class", "edge-path")
			.attr("id", (d) => `ep-${d.id.replace(/[^a-zA-Z0-9]/g, "_")}`)
			.attr("fill", "none")
			.attr("stroke", this.COLORS.edgeNormal)
			.attr("stroke-width", 1.5)
			.attr("opacity", 0.7)
			.attr("marker-end", "url(#arrow)");

		// Edge label (on path)
		edgeSel
			.append("text")
			.attr("class", "edge-label")
			.attr("dy", -4)
			.attr("text-anchor", "middle")
			.append("textPath")
			.attr("href", (d) => `#ep-${d.id.replace(/[^a-zA-Z0-9]/g, "_")}`)
			.attr("startOffset", "50%")
			.style("font-family", "'Fira Code', 'Consolas', monospace")
			.style("font-size", "9px")
			.style("fill", this.COLORS.labelNormal)
			.text((d) =>
				d.labels.map((l) => `${l.read}/${l.write},${l.direction}`).join(" | "),
			);

		// ── Nodes ─────────────────────────────────────────────────────
		const nodeGroup = this.g.append("g").attr("class", "nodes");

		const nodeSel = nodeGroup
			.selectAll("g.node")
			.data(this._nodes, (d) => d.id)
			.enter()
			.append("g")
			.attr("class", "node")
			.attr("data-id", (d) => d.id)
			.call(
				d3
					.drag()
					.on("start", (event, d) => {
						if (!event.active) this._simulation.alphaTarget(0.3).restart();
						d.fx = d.x;
						d.fy = d.y;
					})
					.on("drag", (event, d) => {
						d.fx = event.x;
						d.fy = event.y;
					})
					.on("end", (event, d) => {
						if (!event.active) this._simulation.alphaTarget(0);
						d.fx = null;
						d.fy = null;
					}),
			);

		// Outer circle (second circle for halt states)
		nodeSel
			.filter((d) => d.isHalt)
			.append("circle")
			.attr("r", this.NODE_R + 6)
			.attr("fill", "none")
			.attr("stroke", this.COLORS.haltStroke)
			.attr("stroke-width", 1.5)
			.attr("opacity", 0.7);

		// Main circle
		nodeSel
			.append("circle")
			.attr("class", "node-circle")
			.attr("r", this.NODE_R)
			.attr("fill", this.COLORS.nodeFill)
			.attr("stroke-width", 2.5)
			.attr("stroke", (d) => {
				if (d.isHalt) return this.COLORS.haltStroke;
				if (d.isStart) return this.COLORS.startStroke;
				return this.COLORS.nodeStroke;
			});

		// State label
		nodeSel
			.append("text")
			.attr("class", "node-label")
			.style("font-family", "'Fira Code', 'Consolas', monospace")
			.style("font-size", "12px")
			.style("font-weight", "700")
			.style("fill", "#e8eaf6")
			.style("text-anchor", "middle")
			.style("dominant-baseline", "central")
			.style("pointer-events", "none")
			.text((d) => d.id);

		// Start arrow (→ node)
		const startNode = this._nodes.find((n) => n.isStart);
		if (startNode) {
			this.g
				.append("text")
				.attr("class", "start-arrow")
				.style("font-size", "20px")
				.style("fill", this.COLORS.startStroke)
				.style("pointer-events", "none")
				.text("→");
		}

		// ── Tooltip on hover ──────────────────────────────────────────
		nodeSel
			.on("mouseover", function (event, d) {
				d3.select(this)
					.select("circle.node-circle")
					.attr("filter", "url(#glow)");
			})
			.on("mouseout", function () {
				d3.select(this).select("circle.node-circle").attr("filter", null);
			});

		// ── Simulation tick ───────────────────────────────────────────
		this._simulation.on("tick", () => this._onTick(nodeSel, edgeSel));

		// Initial highlight
		this._applyHighlights();
	}

	_onTick(nodeSel, edgeSel) {
		const R = this.NODE_R;

		// Update node positions
		nodeSel.attr("transform", (d) => `translate(${d.x},${d.y})`);

		// Update start arrow position
		const startNode = this._nodes.find((n) => n.isStart);
		if (startNode) {
			this.g
				.select(".start-arrow")
				.attr("x", startNode.x - R - 30)
				.attr("y", startNode.y + 6);
		}

		// Update edge paths
		edgeSel.select("path").attr("d", (d) => this._edgePath(d));
	}

	/**
	 * Compute the SVG path for an edge.
	 * Self-loops use a special circular arc.
	 * Parallel edges between same pair use a quadratic curve.
	 */
	_edgePath(d) {
		const sx = d.source.x,
			sy = d.source.y;
		const tx = d.target.x,
			ty = d.target.y;

		if (d.isSelf) {
			// Self-loop: draw a small circle above the node
			const loopR = this.NODE_R * 1.1;
			const x = sx,
				y = sy - this.NODE_R;
			return `M ${x - loopR} ${y}
              A ${loopR} ${loopR} 0 1 1 ${x + loopR} ${y}`;
		}

		// Check if there's a reverse edge (bidirectional pair)
		// giving us a slight curve offset
		const reverseExists = this._links.some(
			(l) =>
				(l.source.id || l.source) === (d.target.id || d.target) &&
				(l.target.id || l.target) === (d.source.id || d.source),
		);

		if (reverseExists) {
			// Quadratic bezier with perpendicular offset
			const dx = tx - sx,
				dy = ty - sy;
			const len = Math.sqrt(dx * dx + dy * dy) || 1;
			const offset = 40;
			const mx = (sx + tx) / 2 - (dy / len) * offset;
			const my = (sy + ty) / 2 + (dx / len) * offset;
			return `M ${sx} ${sy} Q ${mx} ${my} ${tx} ${ty}`;
		}

		// Straight line
		return `M ${sx} ${sy} L ${tx} ${ty}`;
	}

	// ---------------------------------------------------------------
	// Highlight active state and edge
	// ---------------------------------------------------------------

	_applyHighlights() {
		if (!this.g) return;

		const C = this.COLORS;
		const activeState = this._activeState;
		const at = this._activeTransition;

		// Nodes
		this.g.selectAll("g.node").each(function (d) {
			const isActive = d.id === activeState;
			d3.select(this)
				.select("circle.node-circle")
				.attr("fill", isActive ? C.activeFill : C.nodeFill)
				.attr("stroke", () => {
					if (isActive) return C.activeStroke;
					if (d.isHalt) return C.haltStroke;
					if (d.isStart) return C.startStroke;
					return C.nodeStroke;
				})
				.attr("stroke-width", isActive ? 3.5 : 2.5)
				.attr("filter", isActive ? "url(#glow)" : null);
		});

		// Edges
		this.g.selectAll("g.edge").each(function (d) {
			const srcId = d.source.id || d.source;
			const tgtId = d.target.id || d.target;
			const isActive = at && at.fromState === srcId && at.nextState === tgtId;

			d3.select(this)
				.select("path")
				.attr("stroke", isActive ? C.edgeActive : C.edgeNormal)
				.attr("stroke-width", isActive ? 3 : 1.5)
				.attr("opacity", isActive ? 1 : 0.6)
				.attr("marker-end", isActive ? "url(#arrow-active)" : "url(#arrow)")
				.attr("filter", isActive ? "url(#glow)" : null);

			d3.select(this)
				.select(".edge-label textPath")
				.style("fill", isActive ? C.labelActive : C.labelNormal)
				.style("font-weight", isActive ? "700" : "400");
		});
	}

	// ---------------------------------------------------------------
	// Utility
	// ---------------------------------------------------------------

	/** Re-run force simulation to reset layout */
	resetLayout() {
		if (this._simulation) {
			this._nodes.forEach((n) => {
				n.fx = null;
				n.fy = null;
			});
			this._simulation.alpha(1).restart();
		}
	}

	/** Fit graph within viewport */
	fitView() {
		if (!this.g || !this.svgEl) return;

		const W = this.svgEl.clientWidth;
		const H = this.svgEl.clientHeight;
		const bounds = this.g.node().getBBox();
		if (!bounds.width || !bounds.height) return;

		const scale = Math.min(
			0.9,
			0.9 * Math.min(W / bounds.width, H / bounds.height),
		);
		const tx = (W - bounds.width * scale) / 2 - bounds.x * scale;
		const ty = (H - bounds.height * scale) / 2 - bounds.y * scale;

		this.svg
			.transition()
			.duration(600)
			.call(
				this._zoom.transform,
				d3.zoomIdentity.translate(tx, ty).scale(scale),
			);
	}
}
