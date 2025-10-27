# Use Bitwarden Secrets in GitHub Actions

The Bitwarden sm-action repository contains the source code for the Secrets Manager GitHub Action.

Use the GitHub action, bitwarden/sm-action, to retrieve secrets from the Bitwarden Secrets Manager for use inside GitHub Actions.

The bitwarden/sm-action will add retrieved secrets as masked [environment variables](https://docs.github.com/en/actions/learn-github-actions/environment-variables) inside a given GitHub action.

Review GitHub's recommendations for [security hardening GitHub Actions](https://docs.github.com/en/actions/security-guides/security-hardening-for-github-actions) when using sensitive secrets.

## Usage

To use the action, add a step to your GitHub workflow using the following syntax:

```
- name: Step name
  uses: bitwarden/sm-action@v1
  with:
    access_token: ${{ secrets.ACCESS_TOKEN }}
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

  ```
  secrets: |
      SECRET_ID > ENVIRONMENT_VARIABLE_NAME
  ```

  Example

  ```
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

## Examples

```
- name: Get Secrets
  uses: bitwarden/sm-action@v1
  with:
    access_token: ${{ secrets.ACCESS_TOKEN }}
    secrets: |
      00000000-0000-0000-0000-000000000000 > TEST_EXAMPLE
      bdbb16bc-0b9b-472e-99fa-af4101309076 > TEST_EXAMPLE_2
```

Environment variables created:

```
TEST_EXAMPLE: SECRET_VALUE_FOR_00000000-0000-0000-0000-000000000000
TEST_EXAMPLE_2: SECRET_VALUE_FOR_bdbb16bc-0b9b-472e-99fa-af4101309076
```

### Example usage

```
- name: Get Secrets
  uses: bitwarden/sm-action@v1
  with:
    access_token: ${{ secrets.ACCESS_TOKEN }}
    cloud_region: eu
    secrets: |
      00000000-0000-0000-0000-000000000000 > TEST_EXAMPLE
- name: Use Secret
  run: example-command "$TEST_EXAMPLE"
```

# Developing Bitwarden sm-action

## Run Locally

Install the dependencies

```bash
$ npm install
```

Run formatter and lint

```bash
$ npm run prettier && npm run lint
```

Run the tests :heavy_check_mark:

```bash
$ npm test
```

## Prepare Source for Distribution

GitHub recommends using a tool called [@vercel/ncc](https://github.com/vercel/ncc) to compile code and modules into one file used for distribution.

- Package the TypeScript for distribution

```bash
$ npm run bundle
```


