# Versioning and release

The Codex, Claude, and Cursor manifests, marketplace entries, package metadata, and validators use one semantic version. Package `0.8.4` is the sanitized read-only public distribution candidate.

Use:

- patch for documentation, validation, artwork, and compatible security corrections;
- minor for a new host integration or reviewed public capability; and
- major for an incompatible install, manifest, authentication, or skill contract.

## Release checks

1. Confirm runtime `tools/list` remains authoritative and manifests contain no tool allowlist.
2. Confirm every documented current tool appears in the reviewed public submission and no mutation is advertised.
3. Confirm `.mcp.json` contains one server URL and no headers or credentials, and that Cursor's marketplace source remains isolated at `plugins/pearl/cursor` so it cannot auto-discover that URL-only config.
4. Confirm hosted Claude and Cursor use their exact public client IDs, callbacks, read scopes, and no client secret.
5. Confirm Cursor's plugin and MCP IDs are both `pearl-cursor`, while Codex and Claude remain `pearl`, so cross-host discovery cannot shadow Cursor's static client.
6. Confirm Claude Code CIMD uses its registered loopback hosts with an ephemeral port.
7. Confirm brand artwork matches the approved Pearl mark, contains no text/EXIF metadata, and is covered by the reviewed brand policy.
8. Confirm every relative documentation link resolves.
9. Confirm the public export contains only allowlisted distribution files and no maintainer, application, backend, database, deployment, environment, or submission-runbook material.
10. Run:

   ```bash
   npm --prefix plugins/pearl test
   npm --prefix plugins/pearl run validate
   npm --prefix plugins/pearl run validate:live
   npm --prefix plugins/pearl run validate:host-clients-live
   python3 ~/.codex/skills/.system/plugin-creator/scripts/validate_plugin.py plugins/pearl
   python3 ~/.codex/skills/.system/skill-creator/scripts/quick_validate.py plugins/pearl/skills/pearl-concierge
   python3 ~/.codex/skills/.system/skill-creator/scripts/quick_validate.py plugins/pearl/cursor/skills/pearl-concierge
   claude plugin validate plugins/pearl --strict
   claude plugin validate . --strict
   ```

11. Generate the distribution into a new empty directory and rerun its tests and validators.
12. Scan the complete public Git history with a credential scanner and verify commit identity contains no personal email.
13. Require a pull request, passing validation, secret scanning/push protection, and reviewed legal/brand approval before making the repository public or submitting it to a host marketplace.

14. Confirm the public repository is actually public, then follow the distinct Cursor Marketplace, Claude community plugin, and Claude Connectors Directory paths in [submission.md](submission.md). Never describe a pending submission as approved, official, endorsed, or listed.

A public repository, successful validation, or portal draft is not host approval. Do not claim listing or endorsement until the host approves the exact submitted release.
