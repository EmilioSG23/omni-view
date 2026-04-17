mod capture;
mod encoder;
mod server;

use clap::Parser;
use server::Config;

/// OmniView Agent — streams the primary display over WebSocket as JPEG frames.
#[derive(Parser)]
#[command(name = "omniview-agent", version, about)]
struct Cli {
    /// Address and port to listen on
    #[arg(long, default_value = "0.0.0.0:9001")]
    bind: String,

    /// Target frames per second (1–30)
    #[arg(long, default_value_t = 10, value_parser = clap::value_parser!(u32).range(1..=30))]
    fps: u32,

    /// JPEG quality (1–100; lower = faster but blurrier)
    #[arg(long, default_value_t = 50, value_parser = clap::value_parser!(u32).range(1..=100))]
    jpeg_quality: u32,
}

#[tokio::main]
async fn main() {
    let cli = Cli::parse();

    server::start_server(Config {
        bind_addr: cli.bind,
        fps: cli.fps,
        jpeg_quality: cli.jpeg_quality as u8,
    })
    .await;
}
