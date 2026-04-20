use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{fs, path::Path};

pub mod interface;

const CONFIG_FILE: &str = "omniview-agent.json";

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AgentConfig {
    pub agent_id: String,
    pub password_hash: String,
    pub backend_url: Option<String>,
}

impl AgentConfig {
    pub fn load_or_create(password: Option<&str>, backend_url: Option<String>) -> Self {
        if Path::new(CONFIG_FILE).exists() {
            let content = fs::read_to_string(CONFIG_FILE)
                .unwrap_or_else(|e| panic!("Failed to read {CONFIG_FILE}: {e}"));
            let mut cfg: Self = serde_json::from_str(&content)
                .unwrap_or_else(|e| panic!("Invalid {CONFIG_FILE}: {e}"));

            if backend_url.is_some() && backend_url != cfg.backend_url {
                cfg.backend_url = backend_url;
                cfg.save();
            }
            cfg
        } else {
            let (final_password, generated) = match password {
                Some(p) if !p.is_empty() => (p.to_owned(), false),
                _ => (generate_password(), true),
            };

            let cfg = Self {
                agent_id: uuid::Uuid::new_v4().to_string(),
                password_hash: hash_password(&final_password),
                backend_url,
            };
            cfg.save();

            println!("╔══════════════════════════════════════════════╗");
            if generated {
                println!("║  Auto-generated agent credentials            ║");
                println!("║  Password : {:<34}║", final_password);
            } else {
                println!("║  Agent initialised with provided password    ║");
            }
            println!("║  Agent ID : {:<34}║", cfg.agent_id);
            println!("║  Saved to : {:<34}║", CONFIG_FILE);
            println!("╚══════════════════════════════════════════════╝");

            cfg
        }
    }

    fn save(&self) {
        let content = serde_json::to_string_pretty(self).expect("Failed to serialize agent config");
        fs::write(CONFIG_FILE, content)
            .unwrap_or_else(|e| panic!("Failed to write {CONFIG_FILE}: {e}"));
    }
}

pub fn hash_password(password: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(password.as_bytes());
    hex::encode(hasher.finalize())
}

fn generate_password() -> String {
    uuid::Uuid::new_v4().to_string().replace('-', "")[..12].to_owned()
}
