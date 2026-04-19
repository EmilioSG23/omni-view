import { useContext } from "react";
import { ModalContext, type ModalContextType } from "../context/ModalContext";

export function useModal(): ModalContextType {
	const ctx = useContext(ModalContext);
	if (!ctx) {
		throw new Error("useModal must be used inside <ModalProvider>");
	}
	return ctx;
}
