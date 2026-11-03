// `wrangler types` は .dev.vars があるときだけシークレットを Env に含めるため、
// CI など .dev.vars が無い環境でも型が通るようにグローバルの Env を補完しておく。
interface Env {
  /** セッション Cookie / OAuth state の HMAC 鍵(wrangler secret) */
  SESSION_SECRET: string;
  /** Google OAuth クライアントシークレット(wrangler secret) */
  GOOGLE_CLIENT_SECRET: string;
  /** "1" で /auth/dev-login を有効化(開発・E2E 専用) */
  DEV_LOGIN: string;
  /** "1" で Workers AI を呼ばずモックを返す(開発・E2E 専用) */
  MOCK_AI: string;
}
