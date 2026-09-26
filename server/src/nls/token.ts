import crypto from "node:crypto";

const META = "https://nls-meta.cn-shanghai.aliyuncs.com/";

type TokenResponse = {
  Token?: { Id?: string; ExpireTime?: number };
  Code?: string;
  Message?: string;
};

let cached: { keyId: string; token: string; expireAt: number } | null = null;

function percentEncode(value: string): string {
  return encodeURIComponent(value)
    .replace(/!/g, "%21")
    .replace(/'/g, "%27")
    .replace(/\(/g, "%28")
    .replace(/\)/g, "%29")
    .replace(/\*/g, "%2A");
}

export function invalidateNlsToken(): void {
  cached = null;
}

export function hasNlsConfig(): boolean {
  return Boolean(
    process.env.ALIYUN_AK_ID?.trim() &&
      process.env.ALIYUN_AK_SECRET?.trim() &&
      process.env.NLS_APP_KEY?.trim()
  );
}

export async function createNlsToken(): Promise<{
  token: string;
  appkey: string;
  expireTime: number;
}> {
  const accessKeyId = process.env.ALIYUN_AK_ID?.trim() || "";
  const accessKeySecret = process.env.ALIYUN_AK_SECRET?.trim() || "";
  const appkey = process.env.NLS_APP_KEY?.trim() || "";
  if (!accessKeyId || !accessKeySecret) throw new Error("NLS_NOT_CONFIGURED");
  if (!appkey) throw new Error("NLS_APPKEY_MISSING");

  const now = Math.floor(Date.now() / 1000);
  if (cached && cached.keyId === accessKeyId && cached.expireAt - now > 120) {
    return { token: cached.token, appkey, expireTime: cached.expireAt };
  }

  const params: Record<string, string> = {
    AccessKeyId: accessKeyId,
    Action: "CreateToken",
    Format: "JSON",
    RegionId: "cn-shanghai",
    SignatureMethod: "HMAC-SHA1",
    SignatureNonce: crypto.randomUUID(),
    SignatureVersion: "1.0",
    Timestamp: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
    Version: "2019-02-28",
  };
  const canonical = Object.keys(params)
    .sort()
    .map((key) => `${percentEncode(key)}=${percentEncode(params[key])}`)
    .join("&");
  const stringToSign = `POST&${percentEncode("/")}&${percentEncode(canonical)}`;
  const signature = crypto.createHmac("sha1", `${accessKeySecret}&`).update(stringToSign).digest("base64");
  const body = `${canonical}&${percentEncode("Signature")}=${percentEncode(signature)}`;
  const res = await fetch(META, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const json = (await res.json()) as TokenResponse;
  const token = json.Token?.Id;
  const expireAt = json.Token?.ExpireTime;
  if (!res.ok || !token || !expireAt) {
    throw new Error(json.Message || json.Code || "NLS_TOKEN_FAILED");
  }
  cached = { keyId: accessKeyId, token, expireAt };
  return { token, appkey, expireTime: expireAt };
}
