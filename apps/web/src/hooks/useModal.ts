import { ModalContext, type ModalContextType } from "@/context/ModalContext";
import { useContext } from "react";

export function useModal(): ModalContextType {
	const ctx = useContext(ModalContext);
	if (!ctx) {
		throw new Error("useModal must be used inside <ModalProvider>");
	}
	return ctx;
}
