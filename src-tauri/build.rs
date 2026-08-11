use std::{env, path::PathBuf, process::Command};

fn main() {
    build_macos_capture_helper();
    build_macos_speech_helper();
    tauri_build::build()
}

fn build_macos_capture_helper() {
    if env::var("CARGO_CFG_TARGET_OS").as_deref() != Ok("macos") {
        return;
    }

    let source = PathBuf::from("src/capture_policy/macos_capture.m");
    println!("cargo:rerun-if-changed={}", source.display());
    let output = PathBuf::from(env::var("OUT_DIR").expect("Cargo should set OUT_DIR"));
    let object = output.join("macos_capture.o");
    let library = output.join("libaster_macos_capture.a");

    let compile_status = Command::new("xcrun")
        .args([
            "clang",
            "-fobjc-arc",
            "-fblocks",
            "-c",
            source.to_str().expect("valid source path"),
            "-o",
            object.to_str().expect("valid object path"),
        ])
        .status()
        .expect("Xcode Command Line Tools are required to build the macOS capture helper");
    assert!(compile_status.success(), "Unable to compile the macOS ScreenCaptureKit helper");

    let archive_status = Command::new("xcrun")
        .args([
            "libtool",
            "-static",
            "-o",
            library.to_str().expect("valid library path"),
            object.to_str().expect("valid object path"),
        ])
        .status()
        .expect("Xcode Command Line Tools are required to archive the macOS capture helper");
    assert!(archive_status.success(), "Unable to archive the macOS ScreenCaptureKit helper");

    println!("cargo:rustc-link-search=native={}", output.display());
    println!("cargo:rustc-link-lib=static=aster_macos_capture");
    for framework in ["AppKit", "CoreGraphics", "CoreMedia", "CoreVideo", "Foundation"] {
        println!("cargo:rustc-link-lib=framework={framework}");
    }
    // ScreenCaptureKit begins at macOS 12.3. Weak-link it so the capability
    // layer can return Not applicable on older systems without preventing the
    // whole native overlay from launching.
    println!("cargo:rustc-link-arg=-Wl,-weak_framework,ScreenCaptureKit");
}

fn build_macos_speech_helper() {
    if env::var("CARGO_CFG_TARGET_OS").as_deref() != Ok("macos") {
        return;
    }

    let source = PathBuf::from("src/speech/macos_speech.m");
    println!("cargo:rerun-if-changed={}", source.display());
    let output = PathBuf::from(env::var("OUT_DIR").expect("Cargo should set OUT_DIR"));
    let object = output.join("macos_speech.o");
    let library = output.join("libaster_macos_speech.a");

    let compile_status = Command::new("xcrun")
        .args([
            "clang",
            "-fobjc-arc",
            "-fblocks",
            "-c",
            source.to_str().expect("valid source path"),
            "-o",
            object.to_str().expect("valid object path"),
        ])
        .status()
        .expect("Xcode Command Line Tools are required to build the macOS speech helper");
    assert!(compile_status.success(), "Unable to compile the macOS speech helper");

    let archive_status = Command::new("xcrun")
        .args([
            "libtool",
            "-static",
            "-o",
            library.to_str().expect("valid library path"),
            object.to_str().expect("valid object path"),
        ])
        .status()
        .expect("Xcode Command Line Tools are required to archive the macOS speech helper");
    assert!(archive_status.success(), "Unable to archive the macOS speech helper");

    println!("cargo:rustc-link-search=native={}", output.display());
    println!("cargo:rustc-link-lib=static=aster_macos_speech");
    for framework in ["AVFoundation", "Foundation"] {
        println!("cargo:rustc-link-lib=framework={framework}");
    }
    // The desktop bundle still supports macOS 10.13–10.14 for the rest of
    // the overlay. Speech is available from macOS 10.15, so weak-link it and
    // let the capability command report that native STT is unavailable there.
    println!("cargo:rustc-link-arg=-Wl,-weak_framework,Speech");
}
