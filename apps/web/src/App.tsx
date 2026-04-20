import { ErrorBoundary } from "@/components/ErrorBoundary.tsx";
import { OmniViewInfoModal } from "@/components/modals/OmniViewInfoModal";
import { NotificationStack } from "@/components/notifications/NotificationStack";
import { DeviceProvider } from "@/context/DeviceContext";
import { ModalProvider } from "@/context/ModalProvider.tsx";
import { NotificationProvider } from "@/context/NotificationProvider";
import { ThemeProvider } from "@/context/ThemeProvider.tsx";
import { useModal } from "@/hooks/useModal";
import { useNotifications } from "@/hooks/useNotifications";
import { DirectoryPage } from "@/pages/DirectoryPage";
import { ViewerPage } from "@/pages/ViewerPage";
import type { AgentSummary } from "@omni-view/shared";
import { useEffect, useState } from "react";

type Route = { name: "directory" } | { name: "viewer"; agent: AgentSummary; password?: string };

function AppInner() {
	const [route, setRoute] = useState<Route>({ name: "directory" });
	const { notifications, removeNotification } = useNotifications();
	const { open } = useModal();

	useEffect(() => {
		try {
			const key = "omni_view_seen_info";
			if (typeof window !== "undefined" && !localStorage.getItem(key)) {
				open(<OmniViewInfoModal />, "44rem");
				localStorage.setItem(key, "1");
			}
		} catch {}
	}, []);

	return (
		<DeviceProvider>
			{route.name === "viewer" ? (
				<ViewerPage
					agent={route.agent}
					password={route.password}
					onBack={() => setRoute({ name: "directory" })}
				/>
			) : (
				<DirectoryPage
					onConnect={(agent, password) => setRoute({ name: "viewer", agent, password })}
				/>
			)}
			<NotificationStack notifications={notifications} onRemove={removeNotification} />
		</DeviceProvider>
	);
}

export default function App() {
	return (
		<ErrorBoundary>
			<ThemeProvider>
				<ModalProvider>
					<NotificationProvider>
						<AppInner />
					</NotificationProvider>
				</ModalProvider>
			</ThemeProvider>
		</ErrorBoundary>
	);
}
