// QuestForge Tauri entry point.
//
// The database schema/migrations are intentionally owned by the TypeScript
// data layer (src/data/migrations) so the exact same migration code runs both
// in the desktop app and in the Node-based test suite. The Rust side only
// registers the SQL plugin and opens the connection on the JS side.

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_sql::Builder::new().build())
        .plugin(tauri_plugin_http::init())
        .run(tauri::generate_context!())
        .expect("error while running QuestForge");
}
