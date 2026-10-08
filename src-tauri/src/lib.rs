mod commands;
mod db;
mod models;

use db::{init_pool, spawn_listener};
use tauri::{Manager, WindowEvent};

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            if let Some(w) = app.get_webview_window("widget") {
                let _ = w.show();
                let _ = w.set_focus();
            }
        }))
        .setup(|app| {
            let database_url = std::env::var("DATABASE_URL")
                .unwrap_or_else(|_| "postgres://postgres:postgres@localhost:5432/tasks".into());

            let handle = app.handle().clone();
            let url_for_listener = database_url.clone();

            tauri::async_runtime::spawn(async move {
                match init_pool(&database_url).await {
                    Ok(pool) => {
                        handle.manage(pool);
                        spawn_listener(handle.clone(), url_for_listener).await;
                    }
                    Err(e) => eprintln!("DB init failed: {e}"),
                }
            });

            if let Some(win) = app.get_webview_window("widget") {
                let w = win.clone();
                win.on_window_event(move |ev| {
                    if let WindowEvent::CloseRequested { api, .. } = ev {
                        api.prevent_close();
                        let _ = w.hide();
                    }
                });
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::list_tasks_range,
            commands::create_task,
            commands::create_task_full,
            commands::update_task,
            commands::save_task,
            commands::update_task_links,
            commands::delete_task,
            commands::set_task_status,
            commands::list_task_lists,
            commands::create_task_list,
            commands::update_task_list,
            commands::delete_task_list,
            commands::bulk_import_tasks,
            commands::export_to_file,
            commands::import_from_file,
            commands::zip_task_links,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}