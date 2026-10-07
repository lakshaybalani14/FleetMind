const ID_TOKEN_KEY = "fleetmind.idToken";
const PKCE_VERIFIER_KEY = "fleetmind.pkceVerifier";
const OAUTH_STATE_KEY = "fleetmind.oauthState";

function config() {
  const domain = process.env.NEXT_PUBLIC_COGNITO_DOMAIN?.replace(/\/$/, "");
  const clientId = process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID;
  if (!domain || !clientId) throw new Error("Set the Cognito domain and app client ID in the frontend environment.");
  return { domain: domain.startsWith("https://") ? domain : `https://${domain}`, clientId };
}

function base64Url(bytes: Uint8Array): string {
  let binary = "";
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function beginCognitoLogin(): Promise<void> {
  const { domain, clientId } = config();
  const verifier = base64Url(crypto.getRandomValues(new Uint8Array(32)));
  const state = base64Url(crypto.getRandomValues(new Uint8Array(24)));
  const challengeBytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  const challenge = base64Url(new Uint8Array(challengeBytes));
  sessionStorage.setItem(PKCE_VERIFIER_KEY, verifier);
  sessionStorage.setItem(OAUTH_STATE_KEY, state);
  const callback = `${window.location.origin}/auth/callback`;
  const authorize = new URL(`${domain}/oauth2/authorize`);
  authorize.search = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    scope: "openid email",
    redirect_uri: callback,
    code_challenge: challenge,
    code_challenge_method: "S256",
    state,
  }).toString();
  window.location.assign(authorize.toString());
}

export async function completeCognitoLogin(url: URL): Promise<string> {
  const { domain, clientId } = config();
  const code = url.searchParams.get("code");
  const expectedState = sessionStorage.getItem(OAUTH_STATE_KEY);
  const verifier = sessionStorage.getItem(PKCE_VERIFIER_KEY);
  if (!code || !expectedState || !verifier || url.searchParams.get("state") !== expectedState) {
    throw new Error(url.searchParams.get("error_description") ?? "Cognito sign-in response was invalid. Please try again.");
  }
  sessionStorage.removeItem(OAUTH_STATE_KEY);
  sessionStorage.removeItem(PKCE_VERIFIER_KEY);
  const tokenResponse = await fetch(`${domain}/oauth2/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: clientId,
      code,
      redirect_uri: `${window.location.origin}/auth/callback`,
      code_verifier: verifier,
    }),
  });
  if (!tokenResponse.ok) throw new Error(`Cognito token exchange failed (${tokenResponse.status}).`);
  const tokens = await tokenResponse.json() as { id_token?: string };
  if (!tokens.id_token) throw new Error("Cognito did not return an ID token.");
  sessionStorage.setItem(ID_TOKEN_KEY, tokens.id_token);
  return tokens.id_token;
}

export function getCognitoIdToken(): string | null {
  if (typeof window === "undefined") return null;
  const token = sessionStorage.getItem(ID_TOKEN_KEY);
  if (!token) return null;
  try {
    const encodedClaims = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    const claims = JSON.parse(atob(encodedClaims)) as { exp?: number };
    if (typeof claims.exp !== "number" || claims.exp <= Math.floor(Date.now() / 1000)) {
      sessionStorage.removeItem(ID_TOKEN_KEY);
      return null;
    }
    return token;
  } catch {
    sessionStorage.removeItem(ID_TOKEN_KEY);
    return null;
  }
}

export function clearCognitoSession(): void {
  sessionStorage.removeItem(ID_TOKEN_KEY);
}

export function cognitoLogoutUrl(): string {
  const { domain, clientId } = config();
  const logout = new URL(`${domain}/logout`);
  logout.search = new URLSearchParams({
    client_id: clientId,
    logout_uri: `${window.location.origin}/`,
  }).toString();
  return logout.toString();
}
