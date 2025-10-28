use std::collections::HashMap;
use std::str::FromStr;

use anyhow::Result;
use bitwarden_core::auth::login::AccessTokenLoginRequest;
use bitwarden_core::{Client, ClientSettings};
use bitwarden_sm::ClientSecretsExt;
use bitwarden_sm::secrets::SecretsGetRequest;

use config::{Config, infer_urls};
use uuid::Uuid;

use ci::{ContinuousIntegration, GithubActionsRunner};

mod ci;
mod config;

const VERSION: &str = env!("CARGO_PKG_VERSION");

#[tokio::main(flavor = "current_thread")]
async fn main() -> Result<()> {
    let mut github_runner = GithubActionsRunner::new()?;
    run(&mut github_runner).await
}

async fn run<T: ContinuousIntegration>(ci: &mut T) -> Result<()> {
    // this doubles as a way to validate the binaries in CI
    if std::env::args().any(|arg| arg == "--version") {
        println!("{VERSION}");
        return Ok(());
    }

    let config = Config::new(ci)?;
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
            "Authentication with Bitwarden failed.\nError: {e}",
        ));
    }

    let secret_ids: Vec<Uuid> = id_to_name_map.keys().cloned().collect();

    let secrets = client
        .secrets()
        .get_by_ids(SecretsGetRequest { ids: secret_ids })
        .await.map_err(|e| {
            anyhow::anyhow!(
                "The secrets provided could not be found. Please check the machine account has access to the secret UUIDs provided.\nError: {e}",
            )
        })?;

    println!("Setting secrets...");
    for secret in secrets.data.iter() {
        id_to_name_map
            .get(&secret.id)
            .map(|name| set_secret(ci, name, &secret.value, config.set_env))
            .transpose()?;
    }

    println!("Completed setting secrets.");

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

/// Sets a secret in the GitHub Actions environment.
fn set_secret<T: ContinuousIntegration>(
    ci: &mut T,
    secret_name: &str,
    secret_value: &str,
    set_env: bool,
) -> Result<()> {
    ci.mask_value(secret_value);

    if set_env {
        ci.set_environment(secret_name, secret_value)?;
        debug!("Successfully wrote '{secret_name}' to environment");
    }

    ci.set_output(secret_name, secret_value)?;
    debug!("Successfully wrote '{secret_name}' to output file");

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    struct FakeContinuousIntegration {
        inputs: HashMap<String, String>,
        outputs: HashMap<String, String>,
        environment: HashMap<String, String>,
        masked_values: Vec<String>,
    }

    impl FakeContinuousIntegration {
        fn new(inputs: HashMap<String, String>) -> Self {
            FakeContinuousIntegration {
                inputs: inputs,
                outputs: HashMap::new(),
                environment: HashMap::new(),
                masked_values: Vec::new(),
            }
        }

        fn default() -> Self {
            Self::new(HashMap::default())
        }
    }

    impl ContinuousIntegration for FakeContinuousIntegration {
        fn get_input(&self, value: &str) -> Option<String> {
            self.inputs.get(value).map(|s| s.to_owned())
        }

        fn set_environment(&mut self, name: &str, value: &str) -> Result<()> {
            self.environment.insert(name.to_owned(), value.to_owned());
            Ok(())
        }

        fn set_output(&mut self, name: &str, value: &str) -> Result<()> {
            self.outputs.insert(name.to_owned(), value.to_owned());
            Ok(())
        }

        fn mask_value(&mut self, value: &str) {
            self.masked_values.push(value.to_owned());
        }
    }

    #[test]
    fn test_set_secrets() {
        let secret_name = "TEST_SECRET";
        let secret_value = r#"BrowserSettings__EnvironmentUrl=https://example.com

    # Browser Settings 2
    BrowserSettings__EnvironmentUrl=https://example2.com"#;

        let mut ci = FakeContinuousIntegration::default();

        // Run the function
        set_secret(&mut ci, secret_name, secret_value, true).unwrap();

        assert_eq!(
            ci.environment.get(secret_name),
            Some(&secret_value.to_string())
        );
        assert_eq!(ci.outputs.get(secret_name), Some(&secret_value.to_string()));
    }

    #[test]
    fn test_set_secrets_with_set_env_disabled() {
        let secret_name = "TEST_SECRET";
        let secret_value = r#"BrowserSettings__EnvironmentUrl=https://example.com

    # Browser Settings 2
    BrowserSettings__EnvironmentUrl=https://example2.com"#;

        let mut ci = FakeContinuousIntegration::default();

        // Run the function
        set_secret(&mut ci, secret_name, secret_value, false).unwrap();

        // Check if GITHUB_OUTPUT was created and contains the expected values

        assert_eq!(ci.environment.get(secret_name), None);
        assert_eq!(ci.outputs.get(secret_name), Some(&secret_value.to_string()));
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
