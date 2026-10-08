use sqlx::postgres::{PgPool, PgPoolOptions, PgListener};
use std::time::Duration;
use tauri::{AppHandle, Emitter};

pub type Db = PgPool;

pub async fn init_pool(database_url: &str) -> Result<Db, sqlx::Error> {
    PgPoolOptions::new()
        .max_connections(5)
        .acquire_timeout(Duration::from_secs(5))
        .connect(database_url)
        .await
}

pub async fn spawn_listener(app: AppHandle, database_url: String) {
    tokio::spawn(async move {
        loop {
            match PgListener::connect(&database_url).await {
                Ok(mut listener) => {
                    if let Err(e) = listener.listen("tasks_changes").await {
                        eprintln!("listen error: {e}");
                        tokio::time::sleep(Duration::from_secs(2)).await;
                        continue;
                    }
                    while let Ok(msg) = listener.recv().await {
                        let _ = app.emit("tasks:changed", msg.payload());
                    }
                }
                Err(e) => {
                    eprintln!("PgListener connect failed: {e} — retry in 3s");
                    tokio::time::sleep(Duration::from_secs(3)).await;
                }
            }
        }
    });
}