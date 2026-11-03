import { Hono } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import type { User } from "../shared/types";
import { decodeBase64url, randomToken, sha256, sign, verifySigned } from "./crypto";
import { createSession, deleteSession, getUserBySession, upsertUser } from "./db";

export const SESSION_COOKIE = "sid";
const OAUTH_COOKIE = "oauth";
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

type Vars = { user: User | null };
export type AppEnv = { Bindings: Env; Variables: Vars };

function isSecure(origin: string) {
  return origin.startsWith("https://");
}

export async function currentUser(env: Env, cookieHeader: string | undefined) {
  const token = cookieHeader
    ?.split(/;\s*/)
    .find((p) => p.startsWith(`${SESSION_COOKIE}=`))
    ?.slice(SESSION_COOKIE.length + 1);
  if (!token) return null;
  return getUserBySession(env.DB, await sha256(token));
}

async function issueSession(env: Env, userId: string) {
  const token = randomToken(32);
  await createSession(env.DB, userId, await sha256(token), SESSION_TTL_MS);
  return token;
}

export const auth = new Hono<AppEnv>();

/** Google OAuth 2.0 / OIDC 認可コードフロー + PKCE */
auth.get("/google", async (c) => {
  if (!c.env.GOOGLE_CLIENT_ID) return c.text("GOOGLE_CLIENT_ID is not configured", 500);
  const state = randomToken(16);
  const verifier = randomToken(48);
  const challenge = await sha256(verifier);
  setCookie(c, OAUTH_COOKIE, await sign(`${state}.${verifier}`, c.env.SESSION_SECRET), {
    httpOnly: true,
    secure: isSecure(c.env.APP_ORIGIN),
    sameSite: "Lax",
    path: "/",
    maxAge: 600,
  });
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", c.env.GOOGLE_CLIENT_ID);
  url.searchParams.set("redirect_uri", `${c.env.APP_ORIGIN}/auth/google/callback`);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid email profile");
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge", challenge);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("prompt", "select_account");
  return c.redirect(url.toString());
});

auth.get("/google/callback", async (c) => {
  const fail = (reason: string) => c.redirect(`/?auth_error=${encodeURIComponent(reason)}`);
  const { code, state, error } = c.req.query();
  if (error) return fail(error);
  const signed = getCookie(c, OAUTH_COOKIE);
  deleteCookie(c, OAUTH_COOKIE, { path: "/" });
  if (!code || !state || !signed) return fail("missing_state");
  const value = await verifySigned(signed, c.env.SESSION_SECRET);
  if (!value) return fail("bad_state");
  const [expectedState, verifier] = value.split(".");
  if (state !== expectedState) return fail("state_mismatch");

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: c.env.GOOGLE_CLIENT_ID,
      client_secret: c.env.GOOGLE_CLIENT_SECRET,
      redirect_uri: `${c.env.APP_ORIGIN}/auth/google/callback`,
      grant_type: "authorization_code",
      code_verifier: verifier,
    }),
  });
  if (!tokenRes.ok) return fail("token_exchange_failed");
  const tokens = (await tokenRes.json()) as { id_token?: string };
  if (!tokens.id_token) return fail("no_id_token");

  // トークンエンドポイントから TLS 経由で直接受け取った id_token なので署名検証は省略可(OIDC Core 3.1.3.7.6)。
  // ただし iss / aud / exp は確認する。
  const payload = JSON.parse(decodeBase64url(tokens.id_token.split(".")[1] ?? "")) as {
    iss?: string;
    aud?: string;
    exp?: number;
    sub?: string;
    email?: string;
    email_verified?: boolean;
    name?: string;
    picture?: string;
  };
  const issOk = payload.iss === "https://accounts.google.com" || payload.iss === "accounts.google.com";
  if (!issOk || payload.aud !== c.env.GOOGLE_CLIENT_ID || !payload.exp || payload.exp * 1000 < Date.now()) {
    return fail("invalid_id_token");
  }
  if (!payload.sub || !payload.email || payload.email_verified === false) return fail("email_not_verified");

  const user = await upsertUser(c.env.DB, {
    googleSub: payload.sub,
    email: payload.email,
    name: payload.name ?? null,
    picture: payload.picture ?? null,
  });
  const token = await issueSession(c.env, user.id);
  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    secure: isSecure(c.env.APP_ORIGIN),
    sameSite: "Lax",
    path: "/",
    maxAge: SESSION_TTL_MS / 1000,
  });
  return c.redirect("/");
});

/** 開発・E2E 専用。DEV_LOGIN=1 のときだけ有効。 */
auth.post("/dev-login", async (c) => {
  if (c.env.DEV_LOGIN !== "1") return c.notFound();
  const user = await upsertUser(c.env.DB, {
    googleSub: "dev-user",
    email: "dev@example.com",
    name: "Dev User",
    picture: null,
  });
  // { reset: true } でそのユーザーのタスクを全削除(E2E の初期化用)
  const body = (await c.req.json().catch(() => ({}))) as { reset?: boolean };
  if (body.reset) await c.env.DB.prepare("DELETE FROM tasks WHERE user_id = ?").bind(user.id).run();
  const token = await issueSession(c.env, user.id);
  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "Lax",
    path: "/",
    maxAge: SESSION_TTL_MS / 1000,
  });
  return c.json({ user });
});

auth.post("/logout", async (c) => {
  const token = getCookie(c, SESSION_COOKIE);
  if (token) await deleteSession(c.env.DB, await sha256(token));
  deleteCookie(c, SESSION_COOKIE, { path: "/" });
  return c.json({ ok: true });
});
