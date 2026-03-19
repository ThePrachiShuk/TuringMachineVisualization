/* ============================================================
   landing.js — Turing Machine Simulator Landing Page
   Scroll reveal + tape animation + nav effects
   ============================================================ */

(function () {
	"use strict";

	/* -------------------------
     Scroll-reveal
  ------------------------- */
	const revealEls = document.querySelectorAll(".reveal");

	const revealObserver = new IntersectionObserver(
		(entries) => {
			entries.forEach((entry) => {
				if (entry.isIntersecting) {
					entry.target.classList.add("visible");
					revealObserver.unobserve(entry.target);
				}
			});
		},
		{ threshold: 0.12, rootMargin: "0px 0px -40px 0px" },
	);

	revealEls.forEach((el) => revealObserver.observe(el));

	/* -------------------------
     Nav background on scroll
  ------------------------- */
	const nav = document.querySelector(".nav");
	const updateNavBackground = () => {
		if (!nav) return;
		const css = getComputedStyle(document.documentElement);
		const topBg = css.getPropertyValue("--nav-bg").trim();
		const scrollBg = css.getPropertyValue("--nav-bg-scrolled").trim();
		nav.style.background = window.scrollY > 40 ? scrollBg : topBg;
	};
	window.addEventListener("scroll", updateNavBackground, { passive: true });
	window.addEventListener("themechange", updateNavBackground);
	updateNavBackground();

	/* -------------------------
     Smooth anchor scroll
  ------------------------- */
	document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
		anchor.addEventListener("click", (e) => {
			const target = document.querySelector(anchor.getAttribute("href"));
			if (target) {
				e.preventDefault();
				target.scrollIntoView({ behavior: "smooth", block: "start" });
			}
		});
	});

	/* -------------------------
     Interactive Tape Animation
  ------------------------- */
	const STEPS = [
		// step: { tape cells[0..8], headIndex, fromState, toState, rule,
		//          direction: "L"|"R"|null, write }
		{
			cells: ["_", "_", "_", "1", "0", "1", "_", "_", "_"],
			head: 3,
			from: "q0",
			to: "q0",
			rule: "read 1 → write 1, move R",
		},
		{
			cells: ["_", "_", "_", "1", "0", "1", "_", "_", "_"],
			head: 4,
			from: "q0",
			to: "q0",
			rule: "read 0 → write 0, move R",
		},
		{
			cells: ["_", "_", "_", "1", "0", "1", "_", "_", "_"],
			head: 5,
			from: "q0",
			to: "q0",
			rule: "read 1 → write 1, move R",
		},
		{
			cells: ["_", "_", "_", "1", "0", "1", "_", "_", "_"],
			head: 6,
			from: "q0",
			to: "q1",
			rule: "read _ → move L",
		},
		{
			cells: ["_", "_", "_", "1", "0", "X", "_", "_", "_"],
			head: 5,
			from: "q1",
			to: "q1",
			rule: "read 1 → write X, move L",
		},
		{
			cells: ["_", "_", "_", "1", "0", "X", "_", "_", "_"],
			head: 4,
			from: "q1",
			to: "q1",
			rule: "read 0 → write 0, move L",
		},
		{
			cells: ["_", "_", "_", "X", "0", "X", "_", "_", "_"],
			head: 3,
			from: "q1",
			to: "qH",
			rule: "read 1 → write X, halt",
		},
	];

	let currentStep = 0;
	let playing = false;
	let playInterval = null;

	const cellEls = document.querySelectorAll(".tape-cell-vis");
	const headArrows = document.querySelectorAll(".head-indicator-vis");
	const fromStateEl = document.querySelector(".trans-state.active-state span");
	const toStateEl = document.querySelector(".trans-state.next-state span");
	const ruleEl = document.querySelector(".trans-rule");
	const stepCounterEl = document.querySelector(".tape-step-counter");
	const prevBtn = document.getElementById("tape-prev");
	const nextBtn = document.getElementById("tape-next");
	const playBtn = document.getElementById("tape-play");

	/* Map visible cell indices 0-8 to DOM cells
     The tape visual shows cells at positions -1 … ∞ with an ellipsis
     on each side. Our .tape-cell-vis elements map 1:1 to cells[0..8]. */
	function renderStep(stepIdx) {
		const step = STEPS[stepIdx];
		if (!step) return;

		// Update tape cells
		cellEls.forEach((el, i) => {
			el.classList.remove("active", "written");
			el.querySelector("span.cell-val").textContent = step.cells[i] ?? "_";
			if (i === step.head) el.classList.add("active");
			else if (step.cells[i] !== "_") el.classList.add("written");
		});

		// Update head arrows
		headArrows.forEach((el, i) => {
			el.classList.toggle("active", i === step.head);
		});

		// Update transition diagram
		if (fromStateEl) fromStateEl.textContent = step.from;
		if (toStateEl) toStateEl.textContent = step.to;
		if (ruleEl) ruleEl.textContent = step.rule;
		if (stepCounterEl)
			stepCounterEl.textContent = `step ${stepIdx + 1} / ${STEPS.length}`;

		// Button states
		if (prevBtn) prevBtn.disabled = stepIdx === 0;
		if (nextBtn) nextBtn.disabled = stepIdx === STEPS.length - 1;
	}

	function goTo(idx) {
		currentStep = Math.max(0, Math.min(STEPS.length - 1, idx));
		renderStep(currentStep);
	}

	if (prevBtn)
		prevBtn.addEventListener("click", () => {
			stopPlay();
			goTo(currentStep - 1);
		});
	if (nextBtn)
		nextBtn.addEventListener("click", () => {
			stopPlay();
			goTo(currentStep + 1);
		});

	function stopPlay() {
		playing = false;
		clearInterval(playInterval);
		playInterval = null;
		if (playBtn) {
			playBtn.textContent = "▶ Play";
			playBtn.classList.remove("active-btn");
		}
	}

	if (playBtn) {
		playBtn.addEventListener("click", () => {
			if (playing) {
				stopPlay();
			} else {
				if (currentStep >= STEPS.length - 1) goTo(0);
				playing = true;
				playBtn.textContent = "⏸ Pause";
				playBtn.classList.add("active-btn");
				playInterval = setInterval(() => {
					if (currentStep >= STEPS.length - 1) {
						stopPlay();
						return;
					}
					goTo(currentStep + 1);
				}, 900);
			}
		});
	}

	// Init diagram
	if (cellEls.length) renderStep(0);
})();
