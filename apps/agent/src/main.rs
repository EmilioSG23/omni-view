mod capture;
mod consts;
mod encoders;
mod server;

use clap::Parser;
use consts::{
    DEFAULT_BIND_ADDR, DEFAULT_FPS, DEFAULT_QUALITY, MAX_FPS, MAX_QUALITY, MIN_FPS,
    MIN_QUALITY,
};
use server::Config;

#[derive(Parser)]
#[command(name = "omniview-agent", version, about)]
struct Cli {
    #[arg(long, default_value = DEFAULT_BIND_ADDR)]
    bind: String,

    #[arg(long, default_value_t = DEFAULT_FPS, value_parser = clap::value_parser!(u32).range(MIN_FPS as i64..=MAX_FPS as i64))]
    fps: u32,

    #[arg(long, default_value_t = DEFAULT_QUALITY, value_parser = clap::value_parser!(u32).range(MIN_QUALITY as i64..=MAX_QUALITY as i64))]
    quality: u32,

    #[arg(long, default_value = "h264")]
    encoder: String,
}

#[tokio::main]
async fn main() {
    let cli = Cli::parse();

    server::start_server(Config {
        bind_addr: cli.bind,
        fps: cli.fps,
        quality: cli.quality as u8,
        encoder: cli.encoder,
    })
    .await;
}
