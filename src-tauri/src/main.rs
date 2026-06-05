#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::Manager;

#[tauri::command]
fn open_pos_kiosk(app: tauri::AppHandle) {
    let pos_url = "https://www.ariaos.site/pos";
    tauri::WebviewWindowBuilder::new(&app, "pos_kiosk", tauri::WebviewUrl::External(pos_url.parse().unwrap()))
        .title("Aria POS")
        .fullscreen(true)
        .build()
        .expect("Failed to open POS kiosk window");
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![open_pos_kiosk])
        .run(tauri::generate_context!())
        .expect("error while running Aria OS");
}
