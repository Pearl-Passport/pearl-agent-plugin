// Shareable doctor output is deliberately independent of upstream messages,
// details, request IDs, URLs and token contents. Codes describe evidence, not
// the underlying cause of an expired/revoked/otherwise unusable authorization.
export function connectionDiagnostic(error = {}) {
  const evidence = error?.cause ?? error ?? {};
  const code = evidence.code;
  if (code === 'not_connected') {
    return {
      state: 'not_connected',
      message: 'No stored Pearl CLI connection was found.',
      recovery: 'Run pearl login, then pearl doctor --authenticated.',
    };
  }
  if (['insufficient_scope', 'invalid_scope'].includes(code)) {
    return {
      state: 'permission_required',
      message: 'The requested permission is not available to this connection.',
      recovery: 'Review the required read permissions and the supported CLI scopes before signing in again. The CLI cannot grant write access.',
    };
  }
  if (['elite_required', 'active_membership_required'].includes(code)) {
    return {
      state: 'membership_required',
      message: 'Pearl reported that this account does not have the required membership access.',
      recovery: 'Check your active membership and connected-app eligibility in Pearl, or contact Pearl support. Reconnecting alone does not change membership access.',
    };
  }
  if (['unauthorized_client', 'invalid_client'].includes(code)) {
    return {
      state: 'client_unavailable',
      message: 'Pearl rejected the OAuth client. Its support or registration could not be established.',
      recovery: 'Ask Pearl support to verify this client is supported, active and correctly registered. Signing in again does not register an unsupported host.',
    };
  }
  if (['invalid_credentials', 'invalid_grant', 'invalid_token', 'missing_token', 'unauthorized', 'refresh_failed'].includes(code)
    || evidence.status === 401) {
    return {
      state: 'reconnect_required',
      message: 'This Pearl authorization is missing or no longer usable; the specific cause is not established.',
      recovery: 'Check your Pearl membership and connected-app access, then run pearl login if eligible. This reconnects only the CLI, not another MCP host or a review scanner.',
    };
  }
  if (evidence.status === 403) {
    return {
      state: 'access_not_established',
      message: 'Pearl denied access without a recognized permission or membership reason.',
      recovery: 'Check access in Pearl or contact Pearl support. This response alone does not establish that reconnecting will help.',
    };
  }
  if (error?.retryable === true || evidence.status === 429 || evidence.status >= 500) {
    return {
      state: 'temporarily_unavailable',
      message: 'Pearl could not complete this check right now.',
      recovery: 'Retry later. Keep the stored connection; a temporary failure does not establish that new authorization is needed.',
    };
  }
  return {
    state: 'not_established',
    message: 'The connection check did not establish usable access.',
    recovery: 'Verify the server and local credential-store setup, then retry or contact Pearl support. No specific authorization cause was established.',
  };
}

export function discoveryDiagnostic() {
  return {
    state: 'incompatible_server',
    message: 'The server did not advertise the expected Pearl OAuth contract.',
    recovery: 'Verify the configured Pearl server and contact Pearl support. This check does not establish whether another MCP host is supported.',
  };
}
