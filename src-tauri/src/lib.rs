use std::path::Path;
use std::sync::Mutex;

// 右键菜单启动时传入的文件路径，前端拉取一次后清空
struct StartupFile(Mutex<Option<String>>);

// 一张图的条目：路径 + 原始宽高
#[derive(serde::Serialize)]
struct ImgEntry {
    path: String,
    w: u32,
    h: u32,
}

// 列目录结果：所有图 + 选中文件在列表中的索引（前端用作双向缓存中心）
#[derive(serde::Serialize)]
struct ListResult {
    entries: Vec<ImgEntry>,
    #[serde(rename = "startIndex")]
    start_index: usize,
}

// 自然排序：数字部分按数值比较（img2 < img10），其余按字符序
fn natural_cmp(a: &str, b: &str) -> std::cmp::Ordering {
    let mut ca = a.chars().peekable();
    let mut cb = b.chars().peekable();
    loop {
        match (ca.peek(), cb.peek()) {
            (None, None) => return std::cmp::Ordering::Equal,
            (None, _) => return std::cmp::Ordering::Less,
            (_, None) => return std::cmp::Ordering::Greater,
            (Some(&xa), Some(&xb)) => {
                if xa.is_ascii_digit() && xb.is_ascii_digit() {
                    let mut va: u64 = 0;
                    let mut vb: u64 = 0;
                    while let Some(&c) = ca.peek() {
                        if c.is_ascii_digit() {
                            va = va * 10 + c.to_digit(10).unwrap() as u64;
                            ca.next();
                        } else {
                            break;
                        }
                    }
                    while let Some(&c) = cb.peek() {
                        if c.is_ascii_digit() {
                            vb = vb * 10 + c.to_digit(10).unwrap() as u64;
                            cb.next();
                        } else {
                            break;
                        }
                    }
                    match va.cmp(&vb) {
                        std::cmp::Ordering::Equal => continue,
                        o => return o,
                    }
                } else {
                    match xa.cmp(&xb) {
                        std::cmp::Ordering::Equal => {
                            ca.next();
                            cb.next();
                        }
                        o => return o,
                    }
                }
            }
        }
    }
}

const IMG_EXTS: &[&str] = &["webp", "jpg", "jpeg", "png", "gif"];

fn is_image_ext(p: &Path) -> bool {
    match p.extension().and_then(|s| s.to_str()) {
        Some(s) => IMG_EXTS.iter().any(|e| s.eq_ignore_ascii_case(e)),
        None => false,
    }
}

// 列出给定文件所在目录下所有支持的图片（自然排序），返回列表 + 选中文件索引
#[tauri::command]
fn list_images(path: String) -> Result<ListResult, String> {
    let file = Path::new(&path);
    let dir = file.parent().ok_or_else(|| "无法获取父目录".to_string())?;

    let mut files: Vec<std::path::PathBuf> = std::fs::read_dir(dir)
        .map_err(|e| e.to_string())?
        .filter_map(|e| e.ok())
        .map(|e| e.path())
        .filter(|p| is_image_ext(p))
        .collect();

    files.sort_by(|a, b| {
        let an = a.file_name().and_then(|s| s.to_str()).unwrap_or("");
        let bn = b.file_name().and_then(|s| s.to_str()).unwrap_or("");
        natural_cmp(an, bn)
    });

    // 选中文件在排序列表中的位置（按文件名匹配，同目录内唯一）
    let selected_name = file.file_name();
    let start_index = files
        .iter()
        .position(|p| p.file_name() == selected_name)
        .unwrap_or(0);

    let entries = files
        .into_iter()
        .map(|p| {
            let (w, h) = imagesize::size(&p)
                .map(|d| (d.width as u32, d.height as u32))
                .unwrap_or((0, 0));
            ImgEntry {
                path: p.to_string_lossy().into_owned(),
                w,
                h,
            }
        })
        .collect();

    Ok(ListResult { entries, start_index })
}

// 取出启动文件路径（右键菜单打开），读一次即清空
#[tauri::command]
fn get_startup_file(state: tauri::State<'_, StartupFile>) -> Option<String> {
    state.0.lock().ok().and_then(|mut g| g.take())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // 右键菜单启动时，argv 第一个支持的图片路径作为启动文件
    let startup = std::env::args()
        .skip(1)
        .find(|a| {
            let p = Path::new(a);
            p.is_file() && is_image_ext(p)
        });

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(StartupFile(Mutex::new(startup)))
        .invoke_handler(tauri::generate_handler![list_images, get_startup_file])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
