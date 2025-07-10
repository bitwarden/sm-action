use std::collections::HashMap;
use std::fs::OpenOptions;
use std::io::Write;
use std::str::FromStr;

use anyhow::Result;
use bitwarden_core::auth::login::AccessTokenLoginRequest;
use bitwarden_core::{Client, ClientSettings};
use bitwarden_sm::ClientSecretsExt;
use bitwarden_sm::secrets::SecretsGetRequest;

use config::{Config, get_env, infer_urls};
use uuid::Uuid;

mod config;

#[tokio::main]
async fn main() -> Result<()> {
    // --test arg to validate the binaries in CI
    if std::env::args().any(|arg| arg == "--test") {
        println!("success");
        return Ok(());
    }

    let config = Config::new()?;
    let (api_url, identity_url) = infer_urls(&config)?;

    let client = Client::new(Some(ClientSettings {
        identity_url,
        api_url,
        user_agent: "bitwarden/sm-action".to_string(),
        device_type: bitwarden_core::DeviceType::SDK,
    }));

    println!("Parsing secrets input...");
    let id_to_name_map = parse_secret_input(config.secrets).map_err(|_| {
        anyhow::anyhow!("Failed to parse secrets input. Ensure the format is 'UUID > Name'.")
    })?;

    println!("Authenticating with Bitwarden...");
    let auth_result = client
        .auth()
        .login_access_token(&AccessTokenLoginRequest {
            access_token: config.access_token,
            state_file: None,
        })
        .await;

    if let Err(e) = auth_result {
        return Err(anyhow::anyhow!(
            "Authentication with Bitwarden failed.\nError: {}",
            e.to_string()
        ));
    }

    let secret_ids: Vec<Uuid> = id_to_name_map.keys().cloned().collect();

    let secrets = client
        .secrets()
        .get_by_ids(SecretsGetRequest { ids: secret_ids })
        .await.map_err(|e| {
            anyhow::anyhow!(
                "The secrets provided could not be found. Please check the machine account has access to the secret UUIDs provided.\nError: {}",
                e.to_string()
            )
        })?;

    for secret in secrets.data.iter() {
        id_to_name_map
            .get(&secret.id)
            .map(|name| set_secrets(name, &secret.value, config.set_env))
            .transpose()?;
    }

    Ok(())
}

/// Parses the secret input from the GitHub Actions environment variable.
fn parse_secret_input(secret_lines: Vec<String>) -> Result<HashMap<Uuid, String>> {
    let mut map: HashMap<Uuid, String> = HashMap::with_capacity(secret_lines.capacity());

    for line in secret_lines.iter() {
        debug!("Parsing line: {line}");
        let uuid_part = line.split('>').next().unwrap_or_default().trim();
        let uuid = Uuid::from_str(uuid_part)
            .map_err(|_| anyhow::anyhow!("Invalid UUID format: {uuid_part}"))?;

        let desired_name = line.split('>').nth(1).unwrap_or_default().trim();

        if let Some(old_value) = map.insert(uuid, desired_name.to_string()) {
            eprintln!(
                "Warning: Duplicate UUID found: {uuid}. Old value: {old_value}, New value: {desired_name}"
            );
        }
    }

    Ok(map)
}

/// Masks a value in the GitHub Actions logs to prevent it from being displayed.
fn mask_value(value: &str) {
    println!("::add-mask::{value}");
}

fn issue_file_command(mut file: std::fs::File, key: &str, value: &str) -> Result<()> {
    let delimiter = format!("ghadelimiter_{}", uuid::Uuid::new_v4());
    file.write_fmt(format_args!("{key}<<{delimiter}\n{value}\n{delimiter}\n"))?;
    file.flush()?; // ensure the data is written to disk
    Ok(())
}

/// Sets a secret in the GitHub Actions environment.
fn set_secrets(secret_name: &str, secret_value: &str, set_env: bool) -> Result<()> {
    let binding = github_escape(secret_value);
    let escaped_secret = binding.as_str();
    mask_value(escaped_secret); // ensure the value is masked in the logs

    if set_env {
        let env_path = get_env("GITHUB_ENV").unwrap_or("/dev/null".to_owned());
        debug!("Writing to GITHUB_ENV: {env_path}");
        let env_file = OpenOptions::new()
            .create(true) // needed for unit tests
            .append(true)
            .open(&env_path)?;

        issue_file_command(env_file, secret_name, escaped_secret)?;
        debug!("Successfully wrote '{secret_name}' to GITHUB_ENV");
    }

    let output_path = get_env("GITHUB_OUTPUT").unwrap_or("/dev/null".to_owned());
    debug!("Writing to GITHUB_OUTPUT: {output_path}");
    let output_file = OpenOptions::new()
        .create(true) // needed for unit tests
        .append(true)
        .open(&output_path)?;

    issue_file_command(output_file, secret_name, escaped_secret)?;
    debug!("Successfully wrote '{secret_name}' to GITHUB_OUTPUT");

    Ok(())
}

fn github_escape(secret_value: &str) -> String {
    secret_value
        .replace('%', "%25")
        .replace('\r', "%0D")
        .replace('\n', "%0A")
        .to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_set_secrets() {
        let secret_name = "TEST_SECRET";
        let secret_value = r#"BrowserSettings__EnvironmentUrl=https://example.com

    # Browser Settings 2
    BrowserSettings__EnvironmentUrl=https://example2.com"#;

        // Temporarily override the environment variables for testing
        if std::env::var("GITHUB_ENV").is_err() {
            unsafe { std::env::set_var("GITHUB_ENV", "/dev/null") };
        }
        if std::env::var("GITHUB_OUTPUT").is_err() {
            unsafe { std::env::set_var("GITHUB_OUTPUT", "/dev/null") };
        }

        // Ensure the file does not exist before the test
        let env_path = std::env::var("GITHUB_ENV").unwrap();
        let output_path = std::env::var("GITHUB_OUTPUT").unwrap();
        let _ = std::fs::remove_file(&env_path);
        let _ = std::fs::remove_file(&output_path);

        let _ = set_secrets(secret_name, secret_value, true);

        // Check if the file was created and contains the expected value
        let env_content = std::fs::read_to_string(&env_path).unwrap();
        let output_content = std::fs::read_to_string(&output_path).unwrap();

        assert!(env_content.contains(&format!("{secret_name}<<ghadelimiter_")));
        assert!(env_content.contains(secret_value));
        assert!(output_content.contains(&format!("{secret_name}<<ghadelimiter_")));
        assert!(output_content.contains(secret_value));
    }

    #[test]
    fn test_github_escape() {
        github_escape_with_special_chars(
            "percent % percent % cr \r cr \r lf \n lf \n",
            "percent %25 percent %25 cr %0D cr %0D lf %0A lf %0A",
        );
        github_escape_with_special_chars(
            "%25 %25 %0D %0D %0A %0A %3A %3A %2C %2C",
            "%2525 %2525 %250D %250D %250A %250A %253A %253A %252C %252C",
        );
        github_escape_with_special_chars("normal text", "normal text");
    }

    fn github_escape_with_special_chars(input: &str, expected: &str) {
        assert_eq!(github_escape(input), expected)
    }

    #[test]
    fn test_parse_secret_lines() {
        let id_to_name_map = parse_secret_input(vec![
            "91ba3f10-a9a2-4795-bacf-0eee2d39a074 > ONE".to_string(),
            "bfd7aa33-54f2-487b-bbbf-4a69b49fdc0d > TWO".to_string(),
        ])
        .unwrap();

        assert_eq!(id_to_name_map.len(), 2);
        assert_eq!(
            id_to_name_map.get(&Uuid::from_str("91ba3f10-a9a2-4795-bacf-0eee2d39a074").unwrap()),
            Some(&"ONE".to_string())
        );

        assert_eq!(
            id_to_name_map.get(&Uuid::from_str("bfd7aa33-54f2-487b-bbbf-4a69b49fdc0d").unwrap()),
            Some(&"TWO".to_string())
        );
    }

    #[test]
    fn test_parse_secret_lines_two() {
        let id_to_name_map = parse_secret_input(vec![
            "91ba3f10-a9a2-4795-bacf-0eee2d39a074 > ONE".to_string(),
            "91ba3f10-a9a2-4795-bacf-0eee2d39a074 > TWO".to_string(),
        ])
        .unwrap();

        assert_eq!(id_to_name_map.len(), 1); // We expect only one entry since the UUID is the same

        assert_eq!(
            id_to_name_map.get(&Uuid::from_str("91ba3f10-a9a2-4795-bacf-0eee2d39a074").unwrap()),
            Some(&"TWO".to_string())
        );
    }

    #[test]
    fn test_parse_secret_lines_invalid_uuid() {
        let id_to_name_map = parse_secret_input(vec![
            "invalid-uuid > INVALID".to_string(),
            "91ba3f10-a9a2-4795-bacf-0eee2d39a074 > VALID".to_string(),
        ]);

        assert!(id_to_name_map.is_err());
    }
}
