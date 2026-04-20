import { DEFAULT_THEME_ID, THEME_KEY, THEMES } from "@/consts/styles";
import { type ReactNode, useCallback, useState } from "react";
import { ThemeContext } from "./ThemeContext";

function resolveInitialTheme(): string {
	try {
		const stored = localStorage.getItem(THEME_KEY);
		if (stored && THEMES.some((t) => t.id === stored)) return stored;
	} catch {
		// localStorage unavailable (SSR / privacy mode) — fall back silently
	}
	return DEFAULT_THEME_ID;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
	const [theme, setThemeState] = useState<string>(resolveInitialTheme);

	const setTheme = useCallback((id: string) => {
		document.documentElement.setAttribute("data-theme", id);
		try {
			localStorage.setItem(THEME_KEY, id);
		} catch {
			// ignore write errors
		}
		setThemeState(id);
	}, []);

	return (
		<ThemeContext.Provider value={{ theme, setTheme, themes: THEMES }}>
			{children}
		</ThemeContext.Provider>
	);
}
