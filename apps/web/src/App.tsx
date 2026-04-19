import type { AgentSummary } from "@omni-view/shared";
import { useState } from "react";
import { DeviceProvider } from "./context/DeviceContext";
import { DirectoryPage } from "./pages/DirectoryPage";
import { ViewerPage } from "./pages/ViewerPage";

type Route = { name: "directory" } | { name: "viewer"; agent: AgentSummary; password?: string };

export default function App() {
	const [route, setRoute] = useState<Route>({ name: "directory" });

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
		</DeviceProvider>
	);
}
