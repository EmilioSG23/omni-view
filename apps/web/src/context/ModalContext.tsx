import { createContext, type ReactNode } from "react";

export interface ModalContextType {
	/** Open the modal with arbitrary body content and an optional max-width (CSS value). */
	open(body: ReactNode, width?: string): void;
	/** Close the currently open modal. */
	close(): void;
}

export const ModalContext = createContext<ModalContextType | null>(null);
