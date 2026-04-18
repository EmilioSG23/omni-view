use crate::config::AgentConfig;

pub async fn register_with_backend(config: &AgentConfig, version: &str) {
    let Some(backend_url) = &config.backend_url else {
        return;
    };

    let url = format!(
        "{}/api/agents/register",
        backend_url.trim_end_matches('/')
    );

    let body = serde_json::json!({
        "agent_id": config.agent_id,
        "label":    hostname(),
        "version":  version,
    });

    match reqwest::Client::new().post(&url).json(&body).send().await {
        Ok(resp) if resp.status().is_success() => {
            println!("[backend] Registered with backend at {backend_url}");
        }
        Ok(resp) => {
            eprintln!(
                "[backend] Registration returned HTTP {} — continuing without backend",
                resp.status()
            );
        }
        Err(e) => {
            eprintln!("[backend] Could not reach backend ({e}) — continuing without backend");
        }
    }
}

pub async fn send_heartbeat(config: &AgentConfig) {
    let Some(backend_url) = &config.backend_url else {
        return;
    };

    let url = format!(
        "{}/api/agents/{}/heartbeat",
        backend_url.trim_end_matches('/'),
        config.agent_id
    );

    let _ = reqwest::Client::new().patch(&url).send().await;
}

fn hostname() -> String {
    std::env::var("HOSTNAME")
        .or_else(|_| std::env::var("COMPUTERNAME"))
        .unwrap_or_else(|_| "unknown".to_owned())
}
