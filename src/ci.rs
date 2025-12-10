use std::{fs::OpenOptions, io::Write};

use anyhow::Result;

use crate::debug;

pub trait ContinuousIntegration {
    /// A function for returning the value for an input by the given name.
    fn get_input(&self, name: &str) -> Option<String>;

    /// Refers to the GITHUB_ENV concept in GitHub Actions. Sets a name and value pair to the environment
    fn set_environment(&mut self, name: &str, value: &str) -> Result<()>;

    /// Refers to the GITHUB_OUTPUT concept in GitHub Actions. Sets secrets to this output file.
    fn set_output(&mut self, name: &str, value: &str) -> Result<()>;

    /// Masks a value in the CI logs to prevent it from being displayed.
    /// In some CI systems this may not be possible. In which case this function may be a no-op.
    fn mask_value(&mut self, value: &str);
}

pub struct GithubActionsRunner<W: Write> {
    env_file: W,
    output_file: W,
}

impl<W: Write> GithubActionsRunner<W> {
    fn issue_file_command(file: &mut W, key: &str, value: &str) -> Result<()> {
        let delimiter = format!("ghadelimiter_{}", uuid::Uuid::new_v4());
        writeln!(file, "{key}<<{delimiter}")?;
        writeln!(file, "{value}")?;
        writeln!(file, "{delimiter}")?;
        file.flush()?; // ensure the data is written to disk
        Ok(())
    }

    /// Prefer this over `std::env::var` to ensure that vars are both set and not empty to avoid
    /// unintended errors.
    fn get_var(key: &str) -> Option<String> {
        match std::env::var(key) {
            Ok(value) if !value.trim().is_empty() => Some(value),
            _ => None,
        }
    }
}

impl GithubActionsRunner<std::fs::File> {
    pub fn new() -> Result<GithubActionsRunner<std::fs::File>> {
        let env_path = std::env::var("GITHUB_ENV").expect("GITHUB_ENV must be set");

        debug!("Writing to GITHUB_ENV: {env_path}");

        let env_file = OpenOptions::new().append(true).open(&env_path)?;

        let output_path = std::env::var("GITHUB_OUTPUT").expect("GITHUB_OUTPUT must be set");

        debug!("Writing to GITHUB_OUTPUT: {env_path}");

        let output_file = OpenOptions::new().append(true).open(&output_path)?;
        Ok(Self {
            env_file,
            output_file,
        })
    }
}

impl<W: Write> ContinuousIntegration for GithubActionsRunner<W> {
    fn get_input(&self, name: &str) -> Option<String> {
        let upper_name = name.to_ascii_uppercase();
        Self::get_var(&format!("INPUT_{upper_name}")).to_owned()
    }

    fn set_environment(&mut self, name: &str, value: &str) -> Result<()> {
        Self::issue_file_command(&mut self.env_file, name, value)
    }

    fn set_output(&mut self, name: &str, value: &str) -> Result<()> {
        Self::issue_file_command(&mut self.output_file, name, value)
    }

    /// Masks a value in the GitHub Actions logs to prevent it from being displayed.
    fn mask_value(&mut self, value: &str) {
        println!("::add-mask::{value}");
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_gh_stuff() -> Result<()> {
        let env_buf = vec![];
        let output_buf = vec![];

        let mut gh: GithubActionsRunner<Vec<_>> = GithubActionsRunner {
            env_file: env_buf,
            output_file: output_buf,
        };

        let _ = gh.set_output("NAME1", "VALUE1");
        let _ = gh.set_output("NAME2", "VALUE2\nNEWLINE");
        let _ = gh.set_output("NAME3", "\nVALUE3\n\t\t\t\tNEWLINE");

        // Take back ownership of buffers
        let binding = gh.output_file.clone();

        let (value_1, delimiter_value_1) = assert_github_output(&binding, "NAME1")?;
        let (value_2, delimiter_value_2) = assert_github_output(&binding, "NAME2")?;
        let (value_3, delimiter_value_3) = assert_github_output(&binding, "NAME3")?;

        assert_eq!(value_1, "VALUE1");
        assert_eq!(value_2, "VALUE2\nNEWLINE");
        assert_eq!(value_3, "\nVALUE3\n\t\t\t\tNEWLINE");
        assert_ne!(delimiter_value_1, delimiter_value_2);
        assert_ne!(delimiter_value_2, delimiter_value_3);
        Ok(())
    }

    /// Asserts that name value pairs are written to the buffer in the correct format
    fn assert_github_output(buffer: &[u8], name: &str) -> Result<(String, uuid::Uuid)> {
        let delimiter_marker = "<<";
        let ghadelimiter_prefix = "ghadelimiter_";
        // Convert the byte buffer to a UTF-8 string and search its lines for the matching prefix.
        let binding = String::from_utf8(buffer.to_vec()).expect("buffer is valid UTF-8");
        let lines = binding.lines().collect::<Vec<&str>>();

        // Find the line that begins with the desired value and return the index it was found at
        let matching_line = lines
            .iter()
            .enumerate()
            .find(|l| {
                l.1.starts_with(&format!("{name}{delimiter_marker}{ghadelimiter_prefix}"))
            })
            .unwrap();

        // Parse the UUID out of the first line
        let delimiter = uuid::Uuid::parse_str(
            matching_line
                .1
                .chars()
                .skip(name.len() + delimiter_marker.len() + ghadelimiter_prefix.len())
                .collect::<String>()
                .as_ref(),
        )?;

        // Find the line number for the end of this value, our secret value should be everything
        // between the start and end
        let end_delimiter_line = lines
            .iter()
            .enumerate()
            .find(|l| l.1 == &format!("{ghadelimiter_prefix}{delimiter}"))
            .map(|l| l.0)
            .unwrap();

        // The line below the line with our delimiter and name should house the value
        // If the value is multiline then this could span multiple lines
        let value = lines
            .get(matching_line.0 + 1..end_delimiter_line)
            .unwrap()
            .join("\n");

        Ok((value, delimiter))
    }
}
