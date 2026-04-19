import type { AgentSummary } from "@omni-view/shared";
import { useState } from "react";
import { NotificationStack } from "./components/notifications/NotificationStack";
import { DeviceProvider } from "./context/DeviceContext";
import { NotificationProvider } from "./context/NotificationProvider";
import { useNotifications } from "./hooks/useNotifications";
import { DirectoryPage } from "./pages/DirectoryPage";
import { ViewerPage } from "./pages/ViewerPage";

type Route = { name: "directory" } | { name: "viewer"; agent: AgentSummary; password?: string };

function AppInner() {
	const [route, setRoute] = useState<Route>({ name: "directory" });
	const { notifications, removeNotification } = useNotifications();

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
		<NotificationProvider>
			<AppInner />
		</NotificationProvider>
	);
}
