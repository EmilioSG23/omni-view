import { GIT_REPO_URL } from "@/consts";
import { useModal } from "@/hooks/useModal";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
	return (
		<section className="rounded-lg border border-border bg-surface/60 p-3">
			<h3 className="text-sm font-semibold text-primary border-b border-border pb-2 font-mono">
				{title}
			</h3>
			{children}
		</section>
	);
}

export function OmniViewInfoModal() {
	const { close } = useModal();

	function handleDontShow() {
		try {
			localStorage.setItem("omni_view_seen_info", "1");
		} catch {}
		close();
	}

	return (
		<div className="flex flex-col gap-4 max-h-[60vh] overflow-y-auto">
			<div className="rounded-xl border border-border-strong bg-elevated/70 p-4">
				<p className="text-[10px] uppercase tracking-[0.16em] text-accent font-mono">Overview</p>
				<h2 className="mt-1 text-xl font-semibold text-primary font-mono">Welcome to OmniView</h2>
				<p className="mt-2 text-sm text-secondary leading-relaxed">
					A focused remote desktop/browser experience built with React + WebRTC. Discover nearby
					agents, connect quickly, and stream screens with low latency and high quality.
				</p>
			</div>

			<div className="w-full px-1 space-y-3">
				<Section title="What you can do?">
					<ul className="mt-2 ml-4 list-disc text-sm text-secondary space-y-1">
						<li>Stream your screen in real time over peer-to-peer WebRTC.</li>
						<li>Find and connect to agents available in your local network.</li>
						<li>Tune capture quality presets and audio options.</li>
						<li>Keep your preferred theme and UI settings in your browser.</li>
					</ul>
				</Section>

				<Section title="Quick start">
					<ol className="mt-2 ml-4 list-decimal text-sm text-secondary space-y-1">
						<li>Open the directory and pick the agent you want to connect to.</li>
						<li>Click Connect and enter the password if the host requires it.</li>
						<li>Start screen sharing from the source device and monitor the stream.</li>
						<li>Use the header tools to change theme or revisit this guide anytime.</li>
					</ol>
				</Section>

				<Section title="Privacy and safety">
					<p className="mt-1 text-sm text-secondary leading-relaxed">
						Connections are established directly between peers whenever possible. Avoid sharing
						sensitive data and always verify the target device before connecting.
					</p>
				</Section>

				<p className="text-sm text-muted">
					Source code:{" "}
					<a
						className="text-accent hover:text-accent/85 hover:underline font-medium"
						href={GIT_REPO_URL}
						target="_blank"
						rel="noreferrer"
					>
						Open the GitHub repository
					</a>
				</p>

				<div className="mt-2 flex flex-wrap justify-end gap-2 pb-1">
					<button
						type="button"
						onClick={handleDontShow}
						className="px-3 py-1.5 rounded-lg border border-border-strong bg-overlay/40 hover:bg-overlay text-sm font-medium text-secondary transition-colors"
					>
						Do not show again
					</button>
					<button
						type="button"
						onClick={() => close()}
						className="px-3 py-1.5 rounded-lg bg-accent text-inverse text-sm font-semibold hover:opacity-90 transition-opacity"
					>
						Got it
					</button>
				</div>
			</div>
		</div>
	);
}
