import type { ThemeMeta } from "@/consts/styles";
import { createContext } from "react";

export interface ThemeContextType {
	/** Currently active theme ID. */
	theme: string;
	/** Switch to the given theme ID and persist to localStorage. */
	setTheme: (id: string) => void;
	/** Full metadata list for all available themes. */
	themes: ThemeMeta[];
}

export const ThemeContext = createContext<ThemeContextType | null>(null);
