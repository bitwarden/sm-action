/* This file defines the canonical version of the sm-action.
 * We use this instead of package.json or Cargo.toml because
 * GH Actions do not make the source files available at runtime.
 */

const version = "v3.0.0";

module.exports = {
  version,
};
