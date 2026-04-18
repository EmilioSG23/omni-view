// Library root — exposes internal modules so that crates in tests/ can import them.
// The binary entry point is src/main.rs, which imports from this lib.

pub mod capture;
pub mod config;
pub mod consts;
pub mod encoders;
pub mod server;
pub mod services;
