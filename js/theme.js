/* ============================================================
   theme.js — Shared theme controller (dark / light)
   Default mode follows system preference unless user toggles.
   ============================================================ */

(function () {
	"use strict";

	const STORAGE_KEY = "tm-theme";
	const THEME_DARK = "dark";
	const THEME_LIGHT = "light";

	const root = document.documentElement;
	const media = window.matchMedia("(prefers-color-scheme: light)");

	function getSystemTheme() {
		return media.matches ? THEME_LIGHT : THEME_DARK;
	}

	function getSavedTheme() {
		const saved = localStorage.getItem(STORAGE_KEY);
		if (saved === THEME_DARK || saved === THEME_LIGHT) return saved;
		return null;
	}

	function getEffectiveTheme() {
		return getSavedTheme() || getSystemTheme();
	}

	function applyTheme(theme) {
		root.setAttribute("data-theme", theme);
		updateToggleText(theme, !!getSavedTheme());
		window.dispatchEvent(
			new CustomEvent("themechange", {
				detail: {
					theme,
					isManual: !!getSavedTheme(),
				},
			}),
		);
	}

	function updateToggleText(theme, isManual) {
		const toggleEls = document.querySelectorAll("[data-theme-toggle]");
		toggleEls.forEach((el) => {
			const themeLabel = theme === THEME_LIGHT ? "Light" : "Dark";
			const icon = theme === THEME_LIGHT ? "☀" : "☾";
			const suffix = isManual ? "" : " (Auto)";

			let iconEl = el.querySelector(".theme-toggle-icon");

			if (!iconEl) {
				el.innerHTML =
					'<span class="theme-toggle-icon" aria-hidden="true"></span>';
				iconEl = el.querySelector(".theme-toggle-icon");
			}

			iconEl.textContent = icon;
			el.setAttribute(
				"aria-label",
				`Toggle theme. Current theme ${themeLabel}`,
			);
			el.setAttribute("title", `Current: ${themeLabel}${suffix}`);
		});
	}

	function toggleTheme() {
		const current = root.getAttribute("data-theme") || getEffectiveTheme();
		const next = current === THEME_LIGHT ? THEME_DARK : THEME_LIGHT;
		localStorage.setItem(STORAGE_KEY, next);
		applyTheme(next);
	}

	function attachToggleHandlers() {
		document.querySelectorAll("[data-theme-toggle]").forEach((el) => {
			el.addEventListener("click", toggleTheme);
		});
	}

	function initTheme() {
		applyTheme(getEffectiveTheme());
		attachToggleHandlers();

		media.addEventListener("change", () => {
			if (!getSavedTheme()) {
				applyTheme(getSystemTheme());
			}
		});
	}

	if (document.readyState === "loading") {
		document.addEventListener("DOMContentLoaded", initTheme, { once: true });
	} else {
		initTheme();
	}
})();
