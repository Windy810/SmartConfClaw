use std::env;
use std::path::PathBuf;
use std::process::Command;

fn main() {
    println!("cargo:rustc-check-cfg=cfg(has_capture_helper)");
    build_capture_helper();
    tauri_build::build()
}

/// Compiles `helper/CaptureHelper.swift` (ScreenCaptureKit system audio + window listing) on macOS.
/// When `swiftc` is unavailable the app still builds; window capture and built-in system audio
/// are then reported as unavailable at runtime and the BlackHole / display capture paths remain.
fn build_capture_helper() {
    let source = PathBuf::from("helper").join("CaptureHelper.swift");
    println!("cargo:rerun-if-changed={}", source.display());

    if env::var("CARGO_CFG_TARGET_OS").as_deref() != Ok("macos") {
        return;
    }
    let arch = match env::var("CARGO_CFG_TARGET_ARCH").as_deref() {
        Ok("aarch64") => "arm64",
        Ok("x86_64") => "x86_64",
        _ => return,
    };
    let out_dir = PathBuf::from(env::var("OUT_DIR").expect("OUT_DIR"));
    let output = out_dir.join("scc-helper");

    let status = Command::new("xcrun")
        .arg("swiftc")
        .arg("-O")
        .arg("-swift-version")
        .arg("5")
        .arg("-target")
        .arg(format!("{arch}-apple-macos12.3"))
        .arg("-o")
        .arg(&output)
        .arg(&source)
        .status();

    match status {
        Ok(s) if s.success() => println!("cargo:rustc-cfg=has_capture_helper"),
        Ok(s) => println!(
            "cargo:warning=capture helper (Swift) failed to compile ({s}); window capture and built-in system audio will be disabled"
        ),
        Err(e) => println!(
            "cargo:warning=xcrun swiftc not available ({e}); window capture and built-in system audio will be disabled"
        ),
    }
}
