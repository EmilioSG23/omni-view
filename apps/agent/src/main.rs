mod service;
mod capture;
mod config;
mod consts;
mod encoders;
mod server;

use clap::Parser;
use config::AgentConfig;
use consts::{DEFAULT_BIND_ADDR, DEFAULT_FPS, DEFAULT_QUALITY, MAX_FPS, MAX_QUALITY, MIN_FPS, MIN_QUALITY};
use config::interface::Config as ServerConfig;
use tokio::time::Duration;

const VERSION: &str = env!("CARGO_PKG_VERSION");

#[derive(Parser)]
#[command(name = "omniview-agent", version, about = "OmniView screen-sharing agent")]
struct Cli {
    #[arg(long, default_value = DEFAULT_BIND_ADDR)]
    bind: String,

    #[arg(
        long,
        default_value_t = DEFAULT_FPS,
        value_parser = clap::value_parser!(u32).range(MIN_FPS as i64..=MAX_FPS as i64)
    )]
    fps: u32,

    #[arg(
        long,
        default_value_t = DEFAULT_QUALITY,
        value_parser = clap::value_parser!(u32).range(MIN_QUALITY as i64..=MAX_QUALITY as i64)
    )]
    quality: u32,

    #[arg(long, default_value = "h264")]
    encoder: String,

    #[arg(long)]
    password: Option<String>,

    #[arg(long)]
    backend: Option<String>,
}

#[tokio::main]
async fn main() {
    let cli = Cli::parse();

    let agent_config = AgentConfig::load_or_create(
        cli.password.as_deref(),
        cli.backend,
    );

    let reg_config = agent_config.clone();
    tokio::spawn(async move {
        service::backend::register_with_backend(&reg_config, VERSION).await;
    });

    let hb_config = agent_config.clone();
    tokio::spawn(async move {
        loop {
            service::backend::send_heartbeat(&hb_config).await;
            tokio::time::sleep(Duration::from_secs(30)).await;
        }
    });

    server::start_server(ServerConfig {
        bind_addr: cli.bind,
        fps: cli.fps,
        quality: cli.quality as u8,
        encoder: cli.encoder,
        password_hash: agent_config.password_hash,
        agent_id: agent_config.agent_id,
    })
    .await;
}
