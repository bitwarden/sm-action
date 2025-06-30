use anyhow::{Result, bail};

/// Prints a debug message to the GitHub Actions log if `RUNNER_DEBUG` or `ACTIONS_RUNNER_DEBUG` are set.
#[macro_export]
macro_rules! debug {
    ($($arg:tt)*) => {
        if std::env::var("RUNNER_DEBUG").is_ok() || std::env::var("ACTIONS_RUNNER_DEBUG").is_ok() {
            println!("::debug::{}", format!($($arg)*));
        }
    };
}

const EU_DEFAULT_API_URL: &str = "https://api.bitwarden.eu";
const EU_DEFAULT_IDENTITY_URL: &str = "https://identity.bitwarden.eu";

const US_DEFAULT_API_URL: &str = "https://api.bitwarden.com";
const US_DEFAULT_IDENTITY_URL: &str = "https://identity.bitwarden.com";

#[derive(Debug)]
/// Input parameters for the GitHub Action.
pub struct Config {
    pub access_token: String,
    pub secrets: Vec<String>,
    pub cloud_region: String, // "US" or "EU"; default is "US"
    pub base_url: Option<String>,
    pub api_url: Option<String>,
    pub identity_url: Option<String>,
    pub set_env: bool,
}

impl Config {
    /// Creates a new Config instance from environment variables.
    pub fn new() -> Result<Self> {
        let cloud_region = get_env("SM_CLOUD_REGION")
            .unwrap_or_default()
            .to_lowercase()
            .trim()
            .to_owned();

        if cloud_region != "us" && cloud_region != "eu" && !cloud_region.is_empty() {
            bail!("Cloud region must be either 'US' or 'EU'");
        }

        let access_token = get_env("SM_ACCESS_TOKEN")
            .ok_or_else(|| anyhow::anyhow!("Access token is required"))?;

        let secrets = get_env("SM_SECRETS")
            .ok_or_else(|| anyhow::anyhow!("Secrets are required"))?
            .lines()
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .map(String::from)
            .collect();

        let base_url = get_env("SM_BASE_URL");
        let api_url = get_env("SM_API_URL");
        let identity_url = get_env("SM_IDENTITY_URL");

        validate_urls(base_url.as_deref(), api_url.as_deref(), identity_url.as_deref())?;

        let set_env = get_env("SM_SET_ENV").is_some_and(|val| val != "false");

        Ok(Self {
            access_token,
            secrets,
            cloud_region,
            base_url,
            api_url,
            identity_url,
            set_env,
        })
    }
}

fn validate_urls(base_url: Option<&str>, api_url: Option<&str>, identity_url: Option<&str>) -> Result<()> {
    if base_url.is_none() && api_url.is_none() && identity_url.is_none() {
        return Ok(()); // No URLs provided, nothing to validate
    }

    if let Some(url) = base_url {
        if !url.starts_with("http://") && !url.starts_with("https://") {
            bail!("base_url must start with 'https://' or 'http://'");
        }
    }

    if let Some(url) = api_url {
        if !url.starts_with("http://") && !url.starts_with("https://") {
            bail!("api_url must start with 'https://' or 'http://'");
        }
    }

    if let Some(url) = identity_url {
        if !url.starts_with("http://") && !url.starts_with("https://") {
            bail!("identity_url must start with 'https://' or 'http://'");
        }
    }

    Ok(())
}

/// Infers the API and Identity URLs based on the base URL or defaults.
/// If none of these values are set, it defaults to US or EU URLs,
/// with US being preferred.
pub fn infer_urls(config: &Config) -> Result<(String, String)> {
    let (api_url, identity_url) = match config.cloud_region.to_lowercase().as_str() {
        // A cloud region was specified; use it
        "eu" => {
            debug!("Using EU cloud region URLs");
            (
                EU_DEFAULT_API_URL.to_string(),
                EU_DEFAULT_IDENTITY_URL.to_string(),
            )
        }
        "us" => {
            debug!("Using US cloud region URLs");
            (
                US_DEFAULT_API_URL.to_string(),
                US_DEFAULT_IDENTITY_URL.to_string(),
            )
        }

        // A cloud region was not specified; fall back to inferring the URLs
        _ => {
            debug!("No cloud region specified; inferring URLs");
            let (api_url, identity_url) =
                match (config.api_url.clone(), config.identity_url.clone()) {
                    // API and Identity were provided; use them
                    (Some(api), Some(identity)) => {
                        debug!("Using provided API and Identity URLs");
                        (api, identity)
                    }

                    // Only API was provided; this is an error
                    (Some(_), None) => {
                        bail!("Both API and Identity URLs must be provided if one is specified");
                    }

                    // Only Identity was provided; this is an error
                    (None, Some(_)) => {
                        bail!("Both API and Identity URLs must be provided if one is specified");
                    }

                    // Neither API nor Identity were provided; use the base URL
                    (None, None) => match config.base_url.clone() {
                        // Infer the API and Identity URLs from the base URL
                        Some(base) => {
                            debug!("Using provided Base URL");
                            (format!("{base}/api"), format!("{base}/identity"))
                        }

                        // No URLs were provided; use the defaults
                        None => {
                            debug!("Using default URLs");
                            (
                                US_DEFAULT_API_URL.to_string(),
                                US_DEFAULT_IDENTITY_URL.to_string(),
                            )
                        }
                    },
                };
            (api_url, identity_url)
        }
    };
    Ok((api_url, identity_url))
}

/// Prefer this over `std::env::var` to ensure that vars are both set and not empty to avoid
/// unintended errors.
pub fn get_env(key: &str) -> Option<String> {
    match std::env::var(key) {
        Ok(value) if !value.trim().is_empty() => Some(value),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_infer_urls_with_both_api_and_identity() {
        let config = Config {
            access_token: "fake_access_token".to_string(),
            secrets: vec!["de66de56-0b1f-42ff-8033-8b7866416520 > SECRET_NAME".to_string()],
            cloud_region: "".to_string(),
            base_url: None,
            api_url: Some("https://api.example.com".to_string()),
            identity_url: Some("https://identity.example.com".to_string()),
            set_env: true,
        };

        let (api_url, identity_url) = infer_urls(&config).unwrap();
        assert_eq!(api_url, "https://api.example.com");
        assert_eq!(identity_url, "https://identity.example.com");
    }

    #[test]
    fn test_infer_urls_defaults_to_us_cloud_region() {
        let config = Config {
            access_token: "fake_access_token".to_string(),
            secrets: vec!["de66de56-0b1f-42ff-8033-8b7866416520 > SECRET_NAME".to_string()],
            cloud_region: "".to_string(),
            base_url: None,
            api_url: None,
            identity_url: None,
            set_env: true,
        };

        let (api_url, identity_url) = infer_urls(&config).unwrap();
        assert_eq!(api_url, US_DEFAULT_API_URL);
        assert_eq!(identity_url, US_DEFAULT_IDENTITY_URL);
    }

    #[test]
    fn test_infer_urls_with_base_url_only() {
        let config = Config {
            access_token: "fake_access_token".to_string(),
            secrets: vec!["de66de56-0b1f-42ff-8033-8b7866416520 > SECRET_NAME".to_string()],
            cloud_region: "".to_string(),
            base_url: Some("https://example.com".to_string()),
            api_url: None,
            identity_url: None,
            set_env: true,
        };

        let (api_url, identity_url) = infer_urls(&config).unwrap();
        assert_eq!(api_url, "https://example.com/api");
        assert_eq!(identity_url, "https://example.com/identity");
    }

    #[test]
    fn test_infer_urls_with_api_and_identity() {
        let config = Config {
            access_token: "fake_access_token".to_string(),
            secrets: vec!["de66de56-0b1f-42ff-8033-8b7866416520 > SECRET_NAME".to_string()],
            cloud_region: "".to_string(),
            base_url: None,
            api_url: Some("https://api.example.com".to_string()),
            identity_url: Some("https://identity.example.com".to_string()),
            set_env: true,
        };

        let (api_url, identity_url) = infer_urls(&config).unwrap();
        assert_eq!(api_url, "https://api.example.com");
        assert_eq!(identity_url, "https://identity.example.com");
    }

    #[test]
    fn test_infer_urls_with_no_urls() {
        let config = Config {
            access_token: "fake_access_token".to_string(),
            secrets: vec!["de66de56-0b1f-42ff-8033-8b7866416520 > SECRET_NAME".to_string()],
            cloud_region: "".to_string(),
            base_url: None,
            api_url: None,
            identity_url: None,
            set_env: true,
        };

        let (api_url, identity_url) = infer_urls(&config).unwrap();
        assert_eq!(api_url, US_DEFAULT_API_URL);
        assert_eq!(identity_url, US_DEFAULT_IDENTITY_URL);
    }

    #[test]
    fn test_infer_urls_with_eu_region() {
        let config = Config {
            access_token: "fake_access_token".to_string(),
            secrets: vec!["de66de56-0b1f-42ff-8033-8b7866416520 > SECRET_NAME".to_string()],
            cloud_region: "EU".to_string(),
            base_url: None,
            api_url: None,
            identity_url: None,
            set_env: true,
        };
        let (api_url, identity_url) = infer_urls(&config).unwrap();
        assert_eq!(api_url, EU_DEFAULT_API_URL);
        assert_eq!(identity_url, EU_DEFAULT_IDENTITY_URL);
    }

    #[test]
    fn test_infer_urls_with_us_region() {
        let config = Config {
            access_token: "fake_access_token".to_string(),
            secrets: vec!["de66de56-0b1f-42ff-8033-8b7866416520 > SECRET_NAME".to_string()],
            cloud_region: "US".to_string(),
            base_url: None,
            api_url: None,
            identity_url: None,
            set_env: true,
        };

        let (api_url, identity_url) = infer_urls(&config).unwrap();
        assert_eq!(api_url, US_DEFAULT_API_URL);
        assert_eq!(identity_url, US_DEFAULT_IDENTITY_URL);
    }

    #[test]
    fn test_infer_urls_with_cloud_region_and_base_url_should_use_cloud_region() {
        let config = Config {
            access_token: "fake_access_token".to_string(),
            secrets: vec!["de66de56-0b1f-42ff-8033-8b7866416520 > SECRET_NAME".to_string()],
            cloud_region: "EU".to_string(),
            base_url: Some("https://example.com".to_string()),
            api_url: None,
            identity_url: None,
            set_env: true,
        };

        let (api_url, identity_url) = infer_urls(&config).unwrap();
        assert_eq!(api_url, EU_DEFAULT_API_URL);
        assert_eq!(identity_url, EU_DEFAULT_IDENTITY_URL);
    }

    #[test]
    fn test_infer_urls_with_cloud_region_and_api_identity_should_use_cloud_region() {
        let config = Config {
            access_token: "fake_access_token".to_string(),
            secrets: vec!["de66de56-0b1f-42ff-8033-8b7866416520 > SECRET_NAME".to_string()],
            cloud_region: "EU".to_string(),
            base_url: None,
            api_url: Some("https://api.example.com".to_string()),
            identity_url: Some("https://identity.example.com".to_string()),
            set_env: true,
        };

        let (api_url, identity_url) = infer_urls(&config).unwrap();
        assert_eq!(api_url, EU_DEFAULT_API_URL);
        assert_eq!(identity_url, EU_DEFAULT_IDENTITY_URL);
    }

    #[test]
    fn test_infer_urls_with_only_api_should_fail() {
        let config = Config {
            access_token: "fake_access_token".to_string(),
            secrets: vec!["de66de56-0b1f-42ff-8033-8b7866416520 > SECRET_NAME".to_string()],
            cloud_region: "".to_string(),
            base_url: None,
            api_url: Some("https://api.example.com".to_string()),
            identity_url: None,
            set_env: true,
        };

        let result = infer_urls(&config);
        assert!(result.is_err());
        assert_eq!(
            result.unwrap_err().to_string(),
            "Both API and Identity URLs must be provided if one is specified"
        );
    }

    #[test]
    fn test_infer_urls_with_only_identity_should_fail() {
        let config = Config {
            access_token: "fake_access_token".to_string(),
            secrets: vec!["de66de56-0b1f-42ff-8033-8b7866416520 > SECRET_NAME".to_string()],
            cloud_region: "".to_string(),
            base_url: None,
            api_url: None,
            identity_url: Some("https://identity.example.com".to_string()),
            set_env: true,
        };

        let result = infer_urls(&config);
        assert!(result.is_err());
        assert_eq!(
            result.unwrap_err().to_string(),
            "Both API and Identity URLs must be provided if one is specified"
        );
    }

    #[test]
    fn test_get_env_returns_none_if_empty() {
        unsafe { std::env::set_var("ARBITRARY_VAR1234", "") };

        assert_eq!(get_env("ARBITRARY_VAR1234"), None);

        unsafe {
            std::env::remove_var("ARBITRARY_VAR1234");
        }
    }

    #[test]
    fn test_get_env_returns_none_if_unset() {
        unsafe {
            std::env::remove_var("ARBITRARY_VAR1234");
        }

        assert_eq!(get_env("ARBITRARY_VAR1234"), None);
    }

    #[test]
    fn test_get_env_returns_some_if_set() {
        unsafe {
            std::env::set_var("ARBITRARY_VAR1234", "some_value");
        }

        assert_eq!(get_env("ARBITRARY_VAR1234"), Some("some_value".to_string()));

        unsafe {
            std::env::remove_var("ARBITRARY_VAR1234");
        }
    }
}
