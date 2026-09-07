# Versioning and release

The Codex, Claude, and Cursor manifests, marketplace entries, package metadata, MCP Registry `server.json`, and validators use one semantic version. Package `0.10.0` keeps one shared backend and adds live reservation availability plus confirmed visit actions only for reviewed ChatGPT, Codex, Claude, and Cursor registrations.

| Surface | Version | Release tag | Publication boundary |
| --- | --- | --- | --- |
| Codex, Claude, Cursor, and shared skill | `0.10.0` | `v0.10.0` | Separate host installation or review |
| MCP Registry metadata | `0.10.0` | `v0.10.0` | Protected Registry OIDC job after the reviewed host-package release |
| Pearl CLI | `1.0.0` | `cli-v1.0.0` | Protected npm Trusted Publishing job |

The MCP Registry is in preview, so publishing may encounter breaking changes or a data reset. Repository availability and a successful Registry publish are not host approval.

The standalone CLI has an independent `cli-vMAJOR.MINOR.PATCH` release stream.
Its first candidate is `@joinpearl/cli` `1.0.0`. Do not publish it until Pearl
has verified control of the `@joinpearl` npm scope, configured npm Trusted
Publishing for this public repository, and protected the
`pearl-cli-publish` GitHub environment with a required reviewer. No npm token
or client secret belongs in repository settings, workflow files, or releases.

Use:

- patch for documentation, validation, artwork, and compatible security corrections;
- minor for a new host integration or reviewed public capability; and
- major for an incompatible install, manifest, authentication, or skill contract.

## Release checks

1. Confirm runtime `tools/list` remains authoritative and manifests contain no tool allowlist.
2. Confirm the 13 common reads plus `reservations_availability` and the four reviewed visit tools match the new OpenAI draft. Confirm only reviewed ChatGPT, Codex, Claude, and Cursor registrations can receive `visits:write`, and no reservation provider mutation is advertised.
3. Confirm `.mcp.json` contains one server URL and no headers or credentials, and that Cursor's marketplace source remains isolated at `plugins/pearl/cursor` so it cannot auto-discover that URL-only config.
4. Confirm `server.json` uses the exact `2025-12-11` schema, case-sensitive GitHub namespace `io.github.Pearl-Passport/pearl-agent-plugin`, stable public repository ID `1343507179`, version `0.10.0`, and exactly one `streamable-http` remote with no headers, variables, credentials, or package declaration.
5. Confirm reviewed ChatGPT, Codex, Claude, and Cursor flows request the seven reads plus only `visits:write`; static clients use their exact public IDs/callbacks; Codex matches only the reviewed OpenAI-hosted CIMD family; and no flow has a client secret.
6. Confirm Cursor's plugin and MCP IDs are both `pearl-cursor`, while Codex and Claude remain `pearl`, so cross-host discovery cannot shadow Cursor's static client.
7. Confirm Claude Code CIMD uses its registered loopback hosts with an ephemeral port.
8. Confirm brand artwork matches the approved Pearl mark, contains no text/EXIF metadata, and is covered by the reviewed brand policy.
9. Confirm every relative documentation link resolves.
10. Confirm the public export contains only allowlisted distribution files and no maintainer, application, backend, database, deployment, environment, or submission-runbook material.
11. Run:

   ```bash
   npm --prefix plugins/pearl test
   npm --prefix plugins/pearl run validate
   npm --prefix plugins/pearl run validate:live
   npm --prefix plugins/pearl run validate:registry
   npm --prefix plugins/pearl run validate:registry:schema
   npm --prefix plugins/pearl run validate:registry:live
   npm --prefix plugins/pearl run validate:host-clients-live
   npm --prefix cli/pearl run check
   npm --prefix cli/pearl test
   npm --prefix cli/pearl run validate
   claude plugin validate plugins/pearl --strict
   claude plugin validate . --strict
   ```

   After coordinated activation, also run `npm --prefix plugins/pearl run validate:cross-host-actions-live` and `node scripts/validate-pearl-openai-plugin-live.mjs --require-cross-host-actions`. Invoke the latter directly so Node forwards its rollout flag to the test module.

   Pearl maintainers with Codex's bundled `plugin-creator` and `skill-creator` skills installed must also run those skills' validators against the package and both packaged Pearl Concierge skill directories. Do not present local Codex system-skill paths as public package dependencies.

12. Generate the distribution into a new empty directory and rerun its tests and validators.
13. Scan the complete public Git history with a credential scanner and verify commit identity contains no personal email. Public CI downloads the reviewed Gitleaks release, verifies its checksum, and scans full history.
14. Require a pull request, passing validation, secret scanning/push protection, and reviewed legal/brand approval before making the repository public or submitting it to a host marketplace.

15. Confirm the public repository is actually public, then follow the distinct OpenAI app-version, Cursor Marketplace, Claude community plugin, and Claude Connectors Directory paths in [submission.md](submission.md). Never describe a pending submission as approved, official, endorsed, or listed.

16. Before backend activation, prepare every host draft and local package from the same commit, but do not submit it. Coordinate the production order as: reviewed gateway and migration candidate; prepared host drafts and local canaries; backend activation; unauthenticated and OAuth-registration probes; authenticated cross-host canaries; exact OpenAI production scan; then marketplace submissions or publication. Existing grants remain unchanged throughout. If any host cannot complete OAuth or lists an unexpected tool, disable the affected exact or family eligibility rows instead of widening the client matcher.

17. For a CLI release, create a reviewed GitHub release whose tag exactly
    matches `cli-v<package.json version>`. The protected workflow must install
    the packed artifact into a disposable prefix and verify `pearl --version`
    and the exact MCP URL before publishing with npm provenance. Afterward,
    inspect npm provenance and signatures before documenting the package as
    available.

18. For an MCP Registry release, first protect the `mcp-registry-publish` GitHub environment with a required Pearl reviewer and a deployment rule limited to reviewed `v*` release tags. The public workflow downloads `mcp-publisher` `v1.8.1` from the official Registry release, verifies its pinned SHA-256 checksum, validates `server.json`, confirms the tag and all host-package versions match, requires the tag commit to be on `main`, runs offline and live checks, and then authenticates with GitHub OIDC. It needs `id-token: write` and no PAT or dedicated secret. Trigger the protected job only from the matching published release or a deliberate manual dispatch of that existing tag. After publication, query the Registry for the exact name and version and compare its one remote URL byte-for-byte before calling the entry listed.

A public repository, successful validation, or portal draft is not host approval. Do not claim listing or endorsement until the host approves the exact submitted release.
