mod capture;
mod consts;
mod encoder;
mod server;

use clap::Parser;
use consts::{
    DEFAULT_BIND_ADDR, DEFAULT_FPS, DEFAULT_QUALITY, MAX_FPS, MAX_QUALITY, MIN_FPS,
    MIN_QUALITY,
};
use server::Config;

/// OmniView Agent — streams the primary display over WebSocket as JPEG frames.
#[derive(Parser)]
#[command(name = "omniview-agent", version, about)]
struct Cli {
    /// Address and port to listen on
    #[arg(long, default_value = DEFAULT_BIND_ADDR)]
    bind: String,

    /// Target frames per second (1–30)
    #[arg(long, default_value_t = DEFAULT_FPS, value_parser = clap::value_parser!(u32).range(MIN_FPS as i64..=MAX_FPS as i64))]
    fps: u32,

    /// Quality (1–100; lower = faster but blurrier)
    #[arg(long, default_value_t = DEFAULT_QUALITY, value_parser = clap::value_parser!(u32).range(MIN_QUALITY as i64..=MAX_QUALITY as i64))]
    quality: u32,
}

#[tokio::main]
async fn main() {
    let cli = Cli::parse();

    server::start_server(Config {
        bind_addr: cli.bind,
        fps: cli.fps,
        quality: cli.quality as u8,
    })
    .await;
}
