use crate::db::Db;
use crate::models::{Task, TaskList, TaskStatus};
use serde::{Deserialize, Serialize};
use sqlx::Row;
use std::io::Write;
use tauri::State;
use uuid::Uuid;

#[derive(thiserror::Error, Debug)]
pub enum AppError {
    #[error("db error: {0}")]
    Db(#[from] sqlx::Error),
    #[error("io error: {0}")]
    Io(#[from] std::io::Error),
    #[error("json error: {0}")]
    Json(#[from] serde_json::Error),
    #[error("zip error: {0}")]
    Zip(#[from] zip::result::ZipError),
    #[error("not found")]
    NotFound,
}

impl serde::Serialize for AppError {
    fn serialize<S: serde::Serializer>(&self, s: S) -> Result<S::Ok, S::Error> {
        s.serialize_str(&self.to_string())
    }
}

#[tauri::command]
pub async fn list_tasks_range(
    db: State<'_, Db>,
    from: String,
    to: String,
) -> Result<Vec<Task>, AppError> {
    let from = from.parse::<chrono::DateTime<chrono::Utc>>().unwrap();
    let to = to.parse::<chrono::DateTime<chrono::Utc>>().unwrap();
    let rows = sqlx::query_as::<_, Task>(
        r#"
        SELECT t.*, l.name AS list_name, l.color AS list_color
        FROM tasks t
        LEFT JOIN task_lists l ON l.id = t.list_id
        WHERE
            (t.start_at IS NULL AND t.end_at IS NULL)
            OR (t.start_at < $2 AND COALESCE(t.end_at, t.start_at) >= $1)
        ORDER BY t.start_at NULLS LAST
        "#,
    )
    .bind(from)
    .bind(to)
    .fetch_all(&*db)
    .await?;
    Ok(rows)
}

#[tauri::command]
pub async fn create_task(
    db: State<'_, Db>,
    title: String,
    list_id: Option<Uuid>,
    description: Option<String>,
    start_at: Option<chrono::DateTime<chrono::Utc>>,
    end_at: Option<chrono::DateTime<chrono::Utc>>,
    all_day: Option<bool>,
) -> Result<Task, AppError> {
    let task = sqlx::query_as::<_, Task>(
        r#"
        INSERT INTO tasks (list_id, title, description, status, start_at, end_at, all_day)
        VALUES ($1, $2, $3, 'todo', $4, $5, $6)
        RETURNING *, NULL::text AS list_name, NULL::text AS list_color
        "#,
    )
    .bind(list_id)
    .bind(title)
    .bind(description)
    .bind(start_at)
    .bind(end_at)
    .bind(all_day.unwrap_or(false))
    .fetch_one(&*db)
    .await?;
    Ok(task)
}

#[tauri::command]
pub async fn create_task_full(
    db: State<'_, Db>,
    title: String,
    description: Option<String>,
    list_id: Option<Uuid>,
    status: TaskStatus,
    start_at: Option<chrono::DateTime<chrono::Utc>>,
    end_at: Option<chrono::DateTime<chrono::Utc>>,
    all_day: bool,
) -> Result<Task, AppError> {
    let task = sqlx::query_as::<_, Task>(
        r#"
        INSERT INTO tasks (title, description, list_id, status, start_at, end_at, all_day)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING *, NULL::text AS list_name, NULL::text AS list_color
        "#,
    )
    .bind(title)
    .bind(description)
    .bind(list_id)
    .bind(status)
    .bind(start_at)
    .bind(end_at)
    .bind(all_day)
    .fetch_one(&*db)
    .await?;
    Ok(task)
}

#[tauri::command]
pub async fn set_task_status(
    db: State<'_, Db>,
    id: Uuid,
    status: TaskStatus,
) -> Result<Task, AppError> {
    let task = sqlx::query_as::<_, Task>(
        r#"
        UPDATE tasks SET status = $2 WHERE id = $1
        RETURNING *, NULL::text AS list_name, NULL::text AS list_color
        "#,
    )
    .bind(id)
    .bind(status)
    .fetch_one(&*db)
    .await?;
    Ok(task)
}

#[tauri::command]
pub async fn update_task(
    db: State<'_, Db>,
    id: Uuid,
    start_at: Option<chrono::DateTime<chrono::Utc>>,
    end_at: Option<chrono::DateTime<chrono::Utc>>,
    title: Option<String>,
    description: Option<String>,
) -> Result<Task, AppError> {
    let task = sqlx::query_as::<_, Task>(
        r#"
        UPDATE tasks
        SET start_at = COALESCE($2, start_at),
            end_at   = COALESCE($3, end_at),
            title    = COALESCE($4, title),
            description = COALESCE($5, description)
        WHERE id = $1
        RETURNING *, NULL::text AS list_name, NULL::text AS list_color
        "#,
    )
    .bind(id)
    .bind(start_at)
    .bind(end_at)
    .bind(title)
    .bind(description)
    .fetch_one(&*db)
    .await?;
    Ok(task)
}

#[tauri::command]
pub async fn save_task(
    db: State<'_, Db>,
    id: Uuid,
    title: String,
    description: Option<String>,
    list_id: Option<Uuid>,
    status: TaskStatus,
    start_at: Option<chrono::DateTime<chrono::Utc>>,
    end_at: Option<chrono::DateTime<chrono::Utc>>,
    all_day: bool,
) -> Result<Task, AppError> {
    let task = sqlx::query_as::<_, Task>(
        r#"
        UPDATE tasks
        SET title = $2, description = $3, list_id = $4, status = $5,
            start_at = $6, end_at = $7, all_day = $8
        WHERE id = $1
        RETURNING *, NULL::text AS list_name, NULL::text AS list_color
        "#,
    )
    .bind(id)
    .bind(title)
    .bind(description)
    .bind(list_id)
    .bind(status)
    .bind(start_at)
    .bind(end_at)
    .bind(all_day)
    .fetch_one(&*db)
    .await?;
    Ok(task)
}

#[tauri::command]
pub async fn update_task_links(
    db: State<'_, Db>,
    id: Uuid,
    links: serde_json::Value,
) -> Result<Task, AppError> {
    let task = sqlx::query_as::<_, Task>(
        r#"
        UPDATE tasks SET links = $2 WHERE id = $1
        RETURNING *, NULL::text AS list_name, NULL::text AS list_color
        "#,
    )
    .bind(id)
    .bind(links)
    .fetch_one(&*db)
    .await?;
    Ok(task)
}

#[tauri::command]
pub async fn delete_task(db: State<'_, Db>, id: Uuid) -> Result<(), AppError> {
    sqlx::query("DELETE FROM tasks WHERE id = $1")
        .bind(id)
        .execute(&*db)
        .await?;
    Ok(())
}

#[tauri::command]
pub async fn list_task_lists(db: State<'_, Db>) -> Result<Vec<TaskList>, AppError> {
    let rows = sqlx::query_as::<_, TaskList>(
        "SELECT id, name, color FROM task_lists ORDER BY name",
    )
    .fetch_all(&*db)
    .await?;
    Ok(rows)
}

#[tauri::command]
pub async fn create_task_list(
    db: State<'_, Db>,
    name: String,
    color: String,
) -> Result<TaskList, AppError> {
    let row = sqlx::query_as::<_, TaskList>(
        "INSERT INTO task_lists (name, color) VALUES ($1, $2)
         RETURNING id, name, color",
    )
    .bind(name)
    .bind(color)
    .fetch_one(&*db)
    .await?;
    Ok(row)
}

#[tauri::command]
pub async fn update_task_list(
    db: State<'_, Db>,
    id: Uuid,
    name: String,
    color: String,
) -> Result<TaskList, AppError> {
    let row = sqlx::query_as::<_, TaskList>(
        "UPDATE task_lists SET name = $2, color = $3
         WHERE id = $1
         RETURNING id, name, color",
    )
    .bind(id)
    .bind(name)
    .bind(color)
    .fetch_one(&*db)
    .await?;
    Ok(row)
}

#[tauri::command]
pub async fn delete_task_list(db: State<'_, Db>, id: Uuid) -> Result<(), AppError> {
    sqlx::query("DELETE FROM task_lists WHERE id = $1")
        .bind(id)
        .execute(&*db)
        .await?;
    Ok(())
}

#[tauri::command]
pub async fn bulk_import_tasks(
    db: State<'_, Db>,
    items: Vec<serde_json::Value>,
) -> Result<usize, AppError> {
    let mut tx = db.begin().await?;
    let mut count = 0usize;
    for it in items {
        let title = it
            .get("title")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();
        let start = it
            .get("start_at")
            .and_then(|v| v.as_str())
            .and_then(|s| s.parse::<chrono::DateTime<chrono::Utc>>().ok());
        let end = it
            .get("end_at")
            .and_then(|v| v.as_str())
            .and_then(|s| s.parse::<chrono::DateTime<chrono::Utc>>().ok());
        sqlx::query(
            "INSERT INTO tasks (title, start_at, end_at, status) VALUES ($1, $2, $3, 'todo')",
        )
        .bind(title)
        .bind(start)
        .bind(end)
        .execute(&mut *tx)
        .await?;
        count += 1;
    }
    tx.commit().await?;
    Ok(count)
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ExportBundle {
    pub version: u32,
    pub exported_at: String,
    pub lists: Vec<TaskList>,
    pub tasks: Vec<Task>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ImportReport {
    pub lists_inserted: usize,
    pub tasks_inserted: usize,
}

#[tauri::command]
pub async fn export_to_file(
    db: State<'_, Db>,
    path: String,
) -> Result<usize, AppError> {
    let lists = sqlx::query_as::<_, TaskList>(
        "SELECT id, name, color FROM task_lists ORDER BY name",
    )
    .fetch_all(&*db)
    .await?;

    let tasks = sqlx::query_as::<_, Task>(
        r#"
        SELECT t.*, NULL::text AS list_name, NULL::text AS list_color
        FROM tasks t
        ORDER BY t.start_at NULLS LAST
        "#,
    )
    .fetch_all(&*db)
    .await?;

    let bundle = ExportBundle {
        version: 1,
        exported_at: chrono::Utc::now().to_rfc3339(),
        lists,
        tasks: tasks.clone(),
    };

    let json = serde_json::to_string_pretty(&bundle)?;
    std::fs::write(&path, json)?;
    Ok(tasks.len())
}

#[tauri::command]
pub async fn import_from_file(
    db: State<'_, Db>,
    path: String,
) -> Result<ImportReport, AppError> {
    let content = std::fs::read_to_string(&path)?;
    let bundle: ExportBundle = serde_json::from_str(&content)?;

    let mut tx = db.begin().await?;
    let mut lists_inserted = 0usize;
    let mut tasks_inserted = 0usize;

    for l in bundle.lists {
        let r = sqlx::query(
            "INSERT INTO task_lists (id, name, color) VALUES ($1, $2, $3)
             ON CONFLICT (id) DO NOTHING",
        )
        .bind(l.id)
        .bind(&l.name)
        .bind(&l.color)
        .execute(&mut *tx)
        .await?;
        lists_inserted += r.rows_affected() as usize;
    }

    for t in bundle.tasks {
        let r = sqlx::query(
            r#"
            INSERT INTO tasks
                (id, list_id, title, description, status, start_at, end_at,
                 all_day, tags, metadata, links)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
            ON CONFLICT (id) DO NOTHING
            "#,
        )
        .bind(t.id)
        .bind(t.list_id)
        .bind(&t.title)
        .bind(&t.description)
        .bind(t.status)
        .bind(t.start_at)
        .bind(t.end_at)
        .bind(t.all_day)
        .bind(&t.tags)
        .bind(&t.metadata)
        .bind(&t.links)
        .execute(&mut *tx)
        .await?;
        tasks_inserted += r.rows_affected() as usize;
    }

    tx.commit().await?;

    Ok(ImportReport {
        lists_inserted,
        tasks_inserted,
    })
}

#[tauri::command]
pub async fn zip_task_links(
    db: State<'_, Db>,
    id: Uuid,
    output_path: String,
) -> Result<usize, AppError> {
    let task = sqlx::query_as::<_, Task>(
        "SELECT t.*, NULL::text AS list_name, NULL::text AS list_color
         FROM tasks t WHERE t.id = $1",
    )
    .bind(id)
    .fetch_one(&*db)
    .await?;

    let links: Vec<serde_json::Value> =
        serde_json::from_value(task.links.clone()).unwrap_or_default();

    let file = std::fs::File::create(&output_path)?;
    let mut zip_writer = zip::ZipWriter::new(file);
    let options: zip::write::SimpleFileOptions =
        zip::write::SimpleFileOptions::default()
            .compression_method(zip::CompressionMethod::Deflated);

    let mut files_added = 0usize;
    let mut url_lines: Vec<String> = Vec::new();
    let mut used_names: std::collections::HashSet<String> =
        std::collections::HashSet::new();

    for l in links {
        let kind = l.get("kind").and_then(|v| v.as_str()).unwrap_or("url");
        let url = l.get("url").and_then(|v| v.as_str()).unwrap_or("");
        let title = l.get("title").and_then(|v| v.as_str()).unwrap_or("");

        if kind == "file" {
            let path = std::path::Path::new(url);
            if !path.exists() {
                continue;
            }
            let original_name = path
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("fichier");

            let mut candidate = original_name.to_string();
            let mut n = 1;
            while used_names.contains(&candidate) {
                let stem = path
                    .file_stem()
                    .and_then(|s| s.to_str())
                    .unwrap_or("fichier");
                let ext = path.extension().and_then(|s| s.to_str()).unwrap_or("");
                candidate = if ext.is_empty() {
                    format!("{}_{}", stem, n)
                } else {
                    format!("{}_{}.{}", stem, n, ext)
                };
                n += 1;
            }
            used_names.insert(candidate.clone());

            if let Ok(content) = std::fs::read(path) {
                zip_writer.start_file(&candidate, options)?;
                zip_writer.write_all(&content)?;
                files_added += 1;
            }
        } else {
            url_lines.push(format!("- {} : {}", title, url));
        }
    }

    if !url_lines.is_empty() {
        let content = format!(
            "# Liens web associés à la tâche : {}\n\n{}",
            task.title,
            url_lines.join("\n")
        );
        zip_writer.start_file("liens.txt", options)?;
        zip_writer.write_all(content.as_bytes())?;
    }

    zip_writer.finish()?;
    Ok(files_added)
}