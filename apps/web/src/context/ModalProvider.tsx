import { type ReactNode, useCallback, useState } from "react";
import { Modal } from "../components/Modal";
import { ModalContext } from "./ModalContext";

interface ModalState {
	isOpen: boolean;
	body: ReactNode;
	width?: string;
}

const CLOSED: ModalState = { isOpen: false, body: null };

export function ModalProvider({ children }: { children: ReactNode }) {
	const [state, setState] = useState<ModalState>(CLOSED);

	const open = useCallback((body: ReactNode, width?: string) => {
		setState({ isOpen: true, body, width });
	}, []);

	const close = useCallback(() => {
		setState(CLOSED);
	}, []);

	return (
		<ModalContext.Provider value={{ open, close }}>
			{children}
			{state.isOpen && (
				<Modal onClose={close} width={state.width}>
					{state.body}
				</Modal>
			)}
		</ModalContext.Provider>
	);
}
