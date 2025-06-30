# Use Bitwarden Secrets in GitHub Actions

The Bitwarden sm-action repository contains the source code for the Secrets Manager GitHub Action.

Use the GitHub Action, bitwarden/sm-action, to retrieve secrets from the Bitwarden Secrets Manager for use inside GitHub Actions.

The bitwarden/sm-action will add retrieved secrets as masked [environment variables](https://docs.github.com/en/actions/learn-github-actions/environment-variables) inside a given GitHub Action.

Review GitHub's recommendations for [security hardening GitHub Actions](https://docs.github.com/en/actions/security-guides/security-hardening-for-github-actions) when using sensitive secrets.

## Usage

To use the action, add a step to your GitHub workflow using the following syntax:

```yaml
- name: Step name
  uses: bitwarden/sm-action@v2
  with:
    access_token: ${{ secrets.SM_ACCESS_TOKEN }}
    secrets: |
      SECRET_ID > ENVIRONMENT_VARIABLE_NAME
```

## Parameters

- `access_token`

  The machine account access token for retrieving secrets.

  Use GitHub's [encrypted secrets](https://docs.github.com/en/actions/security-guides/encrypted-secrets) to store and retrieve machine account access tokens securely.

- `secrets`

  One or more secret Ids to retrieve and the corresponding GitHub environment variable name to set.

  GitHub environment variables have stricter naming requirements than Bitwarden secrets.

  So the bitwarden/sm-action requires specifying an environment variable name for each secret retrieved in the following format:

  ```yaml
  secrets: |
      SECRET_ID > ENVIRONMENT_VARIABLE_NAME
  ```

  Example:

  ```yaml
      secrets: |
          00000000-0000-0000-0000-000000000000 > TEST_EXAMPLE
  ```

- `cloud_region`

  (Optional) For usage with the cloud-hosted services on either https://vault.bitwarden.com or https://vault.bitwarden.eu

  The default value will use `us`, which is the region for https://vault.bitwarden.com

  To use https://vault.bitwarden.eu, set the value to `eu`

- `base_url`

  (Optional) For self-hosted bitwarden instances provide your https://your.domain.com

  If this optional parameter is provided the parameters identity_url and api_url are not required.

  The GitHub action will use `BASE_URL/identity` and `BASE_URL/api` for the identity and api endpoints.

- `identity_url`

  (Optional) For self-hosted bitwarden instances provide your https://your.domain.com/identity

  Depending on the `cloud_region` setting, the default value will use https://identity.bitwarden.com for `us` (default) or https://identity.bitwarden.eu for `eu`.

- `api_url`

  (Optional) For self-hosted bitwarden instances provide your https://your.domain.com/api

  Depending on the `cloud_region` setting, the default value will use https://api.bitwarden.com for `us` (default) or https://api.bitwarden.eu for `eu`.

- `set_env`

  (Optional) Set to `true` to set the retrieved secrets as environment variables in the GitHub action.

  The default value is `true`.

  If set to `false`, the secrets will not be set as environment variables, but will still be available in the GitHub Action output.

  Example:

  ```yaml
  - name: Get Secrets
    uses: bitwarden/sm-action@v2
    id: get_secrets # set an ID so we can access the output
    with:
      access_token: ${{ secrets.SM_ACCESS_TOKEN }}
      secrets: |
        00000000-0000-0000-0000-000000000000 > TEST_EXAMPLE
      set_env: false # don't set TEST_EXAMPLE as an environment variable

  - name: Use Secret
    run: |
      echo "Accessing secret via output."
      echo "Masked value is: ${{ github.output.get_secrets.TEST_EXAMPLE }}"

      echo "Attempting to access TEST_EXAMPLE as an environment variable."
      echo "This will fail because the environment variable is not set."
      echo "Masked value is: $TEST_EXAMPLE (not set)"
  ```

## Examples

```yaml
- name: Get Secrets
  uses: bitwarden/sm-action@v1
  with:
    access_token: ${{ secrets.SM_ACCESS_TOKEN }}
    secrets: |
      00000000-0000-0000-0000-000000000000 > TEST_EXAMPLE
      bdbb16bc-0b9b-472e-99fa-af4101309076 > TEST_EXAMPLE_2
```

Environment variables created:

```sh
TEST_EXAMPLE=SECRET_VALUE_FOR_00000000-0000-0000-0000-000000000000
TEST_EXAMPLE_2=SECRET_VALUE_FOR_bdbb16bc-0b9b-472e-99fa-af4101309076
```

### Example usage

```yaml
- name: Get Secrets
  uses: bitwarden/sm-action@v1
  with:
    access_token: ${{ secrets.SM_ACCESS_TOKEN }}
    cloud_region: eu
    secrets: |
      00000000-0000-0000-0000-000000000000 > TEST_EXAMPLE

- name: Use Secret
  run: example-command "$TEST_EXAMPLE"
```

# Developing Bitwarden sm-action

## Run Locally

To run the Bitwarden sm-action locally, you will need to have [Rust](https://www.rust-lang.org/tools/install) installed.

Set the required environment variables for the Action:

```bash
export SM_ACCESS_TOKEN=<your_access_token>
export SM_CLOUD_REGION=us # or eu; setting this will mean ignoring SM_BASE_URL, SM_API_URL, and SM_IDENTITY_URL
export SM_BASE_URL=https://your.domain.com # optional; only needed for self-hosted
export SM_API_URL=https://your.domain.com/api # optional; only needed for self-hosted; ignored if SM_BASE_URL is set
export SM_IDENTITY_URL=https://your.domain.com/identity # optional; only needed for self-hosted; ignored if SM_BASE_URL is set
export SM_SET_ENV=true # set to false to disable setting environment variables and only use ${{ github.output }}
export GITHUB_ENV=/dev/stdout # can be set to any file for local testing
export GITHUB_OUTPUT=/dev/stdout # can be set to any file for local testing
export SM_SECRETS='4994471d-0b20-4c3c-8040-f65c42d4f80f > FAKE_SECRET_1
dfc20e02-fb1a-4d63-8a7e-d02acce1feb4 > FAKE_SECRET_2'
```

Build and run the action locally using the following command:

```bash
cargo run
```

Run the tests :heavy_check_mark:

```bash
cargo test
cargo run -- --test | grep -q "success"
```

## Prepare Source for Distribution

`TODO`: Distribution and release strategy is a work-in-progress.
