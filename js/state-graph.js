/**
 * state-graph.js — Animated D3.js State Transition Graph
 *
 * Uses Dagre layered layout for clear directed-edge routing and
 * ResizeObserver-driven re-layout when the graph container changes size.
 */

class StateGraph {
	constructor(svgId, containerId) {
		this.svgEl = document.getElementById(svgId);
		this.containerEl = document.getElementById(containerId);
		this.svg = d3.select(`#${svgId}`);
		this.g = null;

		this._nodes = []; // { id, isStart, isHalt, x, y }
		this._links = []; // { source, target, labels[], id, isSelf, points[] }
		this._zoom = null;

		this._activeState = null;
		this._activeTransition = null; // { fromState, nextState, read }
		this._hasGraphData = false;

		this._resizeObserver = null;
		this._resizeRaf = null;
		this._lastSize = { width: 0, height: 0 };

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

		this._observeContainer();
	}

	// ---------------------------------------------------------------
	// Public API
	// ---------------------------------------------------------------

	/**
	 * (Re)build the graph for a new machine configuration.
	 * @param {string[]} states
	 * @param {Map} transitions — tm.transitions Map
	 * @param {string} startState
	 * @param {Set} haltStates
	 */
	build(states, transitions, startState, haltStates) {
		this._activeState = startState;
		this._activeTransition = null;

		this._nodes = states.map((s) => ({
			id: s,
			isStart: s === startState,
			isHalt: haltStates.has(s),
		}));

		const edgeMap = new Map();
		for (const [key, rule] of transitions.entries()) {
			const [fromState, readSym] = key.split(",");
			const edgeKey = `${fromState}->${rule.nextState}`;
			if (!edgeMap.has(edgeKey)) {
				edgeMap.set(edgeKey, {
					source: fromState,
					target: rule.nextState,
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

		this._links = [...edgeMap.values()].map((edge, idx) => ({
			...edge,
			id: `edge_${idx}`,
			points: [],
			pathId: `ep_${idx}`,
		}));

		this._hasGraphData = this._nodes.length > 0;
		this._render();
		this.fitView(0);
	}

	/** Highlight active state and transition. */
	update(activeState, lastTransition) {
		this._activeState = activeState;
		this._activeTransition = lastTransition;
		this._applyHighlights();
	}

	/** Reset highlights to initial state */
	resetHighlights(startState) {
		this._activeState = startState;
		this._activeTransition = null;
		this._applyHighlights();
	}

	/** Recompute layout and fit view */
	resetLayout() {
		if (!this._hasGraphData) return;
		this._render();
		this.fitView(300);
	}

	/** Fit graph within viewport */
	fitView(duration = 600) {
		if (!this.g || !this.svgEl || !this._zoom) return;

		const W = this.svgEl.clientWidth;
		const H = this.svgEl.clientHeight;
		if (!W || !H) return;

		const bounds = this.g.node().getBBox();
		if (!bounds.width || !bounds.height) return;

		const scale = Math.min(
			0.95,
			0.95 * Math.min(W / bounds.width, H / bounds.height),
		);
		const tx = (W - bounds.width * scale) / 2 - bounds.x * scale;
		const ty = (H - bounds.height * scale) / 2 - bounds.y * scale;
		const transform = d3.zoomIdentity.translate(tx, ty).scale(scale);

		if (duration > 0) {
			this.svg
				.transition()
				.duration(duration)
				.call(this._zoom.transform, transform);
		} else {
			this.svg.call(this._zoom.transform, transform);
		}
	}

	// ---------------------------------------------------------------
	// Resize handling
	// ---------------------------------------------------------------

	_observeContainer() {
		if (!this.containerEl || typeof ResizeObserver === "undefined") return;

		this._resizeObserver = new ResizeObserver((entries) => {
			const entry = entries[0];
			if (!entry) return;
			const { width, height } = entry.contentRect;
			this._handleContainerResize(width, height);
		});
		this._resizeObserver.observe(this.containerEl);
	}

	_handleContainerResize(width, height) {
		if (!this._hasGraphData) return;
		if (!width || !height) return;

		const dw = Math.abs(width - this._lastSize.width);
		const dh = Math.abs(height - this._lastSize.height);
		if (dw < 2 && dh < 2) return;

		this._lastSize = { width, height };
		if (this._resizeRaf) cancelAnimationFrame(this._resizeRaf);

		this._resizeRaf = requestAnimationFrame(() => {
			this._render();
			this.fitView(0);
		});
	}

	// ---------------------------------------------------------------
	// Rendering
	// ---------------------------------------------------------------

	_render() {
		if (!this.svgEl || !this.containerEl) return;

		const rect = this.containerEl.getBoundingClientRect();
		const W = Math.max(1, Math.floor(rect.width));
		const H = Math.max(1, Math.floor(rect.height));
		this._lastSize = { width: W, height: H };

		this.svg
			.attr("width", W)
			.attr("height", H)
			.attr("viewBox", `0 0 ${W} ${H}`);
		this.svg.selectAll("*").remove();

		const emptyMsg = document.getElementById("graph-empty-msg");
		if (emptyMsg)
			emptyMsg.style.display = this._hasGraphData ? "none" : "block";
		if (!this._hasGraphData) return;

		this._zoom = d3
			.zoom()
			.scaleExtent([0.3, 3])
			.on("zoom", (event) => {
				this.g.attr("transform", event.transform);
			});
		this.svg.call(this._zoom);

		this.g = this.svg.append("g");

		const defs = this.svg.append("defs");
		this._buildMarkers(defs);
		this._buildGlow(defs);
		this._computeDagreLayout();

		const edgeGroup = this.g.append("g").attr("class", "edges");
		const edgeSel = edgeGroup
			.selectAll("g.edge")
			.data(this._links, (d) => d.id)
			.enter()
			.append("g")
			.attr("class", "edge")
			.attr("data-source", (d) => d.source)
			.attr("data-target", (d) => d.target);

		edgeSel
			.append("path")
			.attr("class", "edge-path")
			.attr("id", (d) => d.pathId)
			.attr("d", (d) => this._edgePath(d))
			.attr("fill", "none")
			.attr("stroke", this.COLORS.edgeNormal)
			.attr("stroke-width", 1.5)
			.attr("opacity", 0.7)
			.attr("marker-end", "url(#arrow)");

		edgeSel
			.append("text")
			.attr("class", "edge-label")
			.attr("dy", -4)
			.attr("text-anchor", "middle")
			.append("textPath")
			.attr("href", (d) => `#${d.pathId}`)
			.attr("startOffset", "50%")
			.style("font-family", "'Fira Code', 'Consolas', monospace")
			.style("font-size", "9px")
			.style("fill", this.COLORS.labelNormal)
			.text((d) =>
				d.labels.map((l) => `${l.read}/${l.write},${l.direction}`).join(" | "),
			);

		const nodeGroup = this.g.append("g").attr("class", "nodes");
		const nodeSel = nodeGroup
			.selectAll("g.node")
			.data(this._nodes, (d) => d.id)
			.enter()
			.append("g")
			.attr("class", "node")
			.attr("data-id", (d) => d.id)
			.attr("transform", (d) => `translate(${d.x},${d.y})`);

		nodeSel
			.filter((d) => d.isHalt)
			.append("circle")
			.attr("r", this.NODE_R + 6)
			.attr("fill", "none")
			.attr("stroke", this.COLORS.haltStroke)
			.attr("stroke-width", 1.5)
			.attr("opacity", 0.7);

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

		const startNode = this._nodes.find((n) => n.isStart);
		if (startNode) {
			this.g
				.append("text")
				.attr("class", "start-arrow")
				.attr("x", startNode.x - this.NODE_R - 30)
				.attr("y", startNode.y + 6)
				.style("font-size", "20px")
				.style("fill", this.COLORS.startStroke)
				.style("pointer-events", "none")
				.text("→");
		}

		nodeSel
			.on("mouseover", function () {
				d3.select(this)
					.select("circle.node-circle")
					.attr("filter", "url(#glow)");
			})
			.on("mouseout", function () {
				d3.select(this).select("circle.node-circle").attr("filter", null);
			});

		this._applyHighlights();
	}

	_buildMarkers(defs) {
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
	}

	_buildGlow(defs) {
		const filter = defs.append("filter").attr("id", "glow");
		filter
			.append("feGaussianBlur")
			.attr("stdDeviation", "3")
			.attr("result", "coloredBlur");
		const merge = filter.append("feMerge");
		merge.append("feMergeNode").attr("in", "coloredBlur");
		merge.append("feMergeNode").attr("in", "SourceGraphic");
	}

	_computeDagreLayout() {
		if (!window.dagre || !window.dagre.graphlib) {
			this._computeFallbackLayout();
			return;
		}

		const graph = new window.dagre.graphlib.Graph({ multigraph: true });
		graph.setGraph({
			rankdir: "LR",
			nodesep: 70,
			ranksep: 120,
			edgesep: 30,
			marginx: 40,
			marginy: 30,
			ranker: "network-simplex",
		});
		graph.setDefaultEdgeLabel(() => ({}));

		const nodeWidth = this.NODE_R * 2 + 26;
		const nodeHeight = this.NODE_R * 2 + 26;
		for (const node of this._nodes) {
			graph.setNode(node.id, { width: nodeWidth, height: nodeHeight });
		}

		for (const link of this._links) {
			graph.setEdge(link.source, link.target, { id: link.id }, link.id);
		}

		window.dagre.layout(graph);

		for (const node of this._nodes) {
			const n = graph.node(node.id);
			if (n) {
				node.x = n.x;
				node.y = n.y;
			}
		}

		for (const link of this._links) {
			const e = graph.edge({ v: link.source, w: link.target, name: link.id });
			link.points = e && Array.isArray(e.points) ? e.points : [];
		}
	}

	_computeFallbackLayout() {
		const radius = 180;
		const cx = 320;
		const cy = 220;
		const step = (Math.PI * 2) / Math.max(1, this._nodes.length);

		this._nodes.forEach((node, idx) => {
			node.x = cx + Math.cos(idx * step) * radius;
			node.y = cy + Math.sin(idx * step) * radius;
		});

		const nodeMap = new Map(this._nodes.map((n) => [n.id, n]));
		for (const link of this._links) {
			const s = nodeMap.get(link.source);
			const t = nodeMap.get(link.target);
			if (!s || !t) {
				link.points = [];
				continue;
			}
			link.points = [
				{ x: s.x, y: s.y },
				{ x: (s.x + t.x) / 2, y: (s.y + t.y) / 2 },
				{ x: t.x, y: t.y },
			];
		}
	}

	_edgePath(d) {
		if (d.points && d.points.length > 1) {
			const line = d3
				.line()
				.x((p) => p.x)
				.y((p) => p.y)
				.curve(d3.curveBasis);
			return line(d.points);
		}

		const source = this._nodes.find((n) => n.id === d.source);
		const target = this._nodes.find((n) => n.id === d.target);
		if (!source || !target) return "";

		if (d.isSelf) {
			const loopR = this.NODE_R * 1.1;
			const x = source.x;
			const y = source.y - this.NODE_R;
			return `M ${x - loopR} ${y} A ${loopR} ${loopR} 0 1 1 ${x + loopR} ${y}`;
		}

		return `M ${source.x} ${source.y} L ${target.x} ${target.y}`;
	}

	// ---------------------------------------------------------------
	// Highlight active state and edge
	// ---------------------------------------------------------------

	_applyHighlights() {
		if (!this.g) return;

		const C = this.COLORS;
		const activeState = this._activeState;
		const at = this._activeTransition;

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

		this.g.selectAll("g.edge").each(function (d) {
			const isActive =
				at && at.fromState === d.source && at.nextState === d.target;

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
}
