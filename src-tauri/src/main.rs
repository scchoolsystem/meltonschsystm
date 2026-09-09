// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    // WORKAROUND: on machines with a flaky/older Intel integrated GPU driver
    // (igfxCUIServiceModule), WebView2's GPU compositor process can crash or
    // wedge itself. Symptoms are hard to diagnose from the app side because
    // the native Win32 window keeps working normally (title bar, drag,
    // close all respond — Windows draws those, not WebView2) while the
    // WebView2 content area silently stops receiving ALL input (clicks,
    // keystrokes, even DevTools console commands) and the cursor disappears
    // the moment it moves over the content, because hit-testing and cursor
    // compositing both depend on that same GPU process. Must be set before
    // Tauri creates the WebView2 environment, so this has to happen here in
    // main(), before smartdev_lib::run().
    std::env::set_var(
        "WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS",
        "--disable-gpu --disable-gpu-compositing --disable-software-rasterizer",
    );
    smartdev_lib::run()
}
