//! READ-ONLY: values of a ConfigMap or Secret, for resolving a container's env vars in the
//! pod details (like Lens). Secrets are only fetched when the user clicks "reveal".

use std::collections::BTreeMap;

use k8s_openapi::api::core::v1::{ConfigMap, Secret};
use kube::Api;

use crate::kube::{KubeState, client_for};

fn text_or_binary(bytes: &[u8]) -> String {
    match std::str::from_utf8(bytes) {
        Ok(s) => s.to_string(),
        Err(_) => format!("<binary, {} bytes>", bytes.len()),
    }
}

#[tauri::command]
pub async fn read_env_source(
    kube: tauri::State<'_, KubeState>,
    context: String,
    namespace: String,
    kind: String,
    name: String,
) -> Result<BTreeMap<String, String>, String> {
    let client = client_for(&kube, &context).await?;
    let mut out = BTreeMap::new();
    match kind.as_str() {
        "ConfigMap" => {
            let cm = Api::<ConfigMap>::namespaced(client, &namespace)
                .get(&name)
                .await
                .map_err(|e| e.to_string())?;
            out.extend(cm.data.unwrap_or_default());
            for (k, v) in cm.binary_data.unwrap_or_default() {
                out.insert(k, format!("<binary, {} bytes>", v.0.len()));
            }
        }
        "Secret" => {
            let s = Api::<Secret>::namespaced(client, &namespace)
                .get(&name)
                .await
                .map_err(|e| e.to_string())?;
            for (k, v) in s.data.unwrap_or_default() {
                out.insert(k, text_or_binary(&v.0));
            }
            for (k, v) in s.string_data.unwrap_or_default() {
                out.insert(k, v);
            }
        }
        other => return Err(format!("unsupported source kind: {other}")),
    }
    Ok(out)
}
