import jwt from "jsonwebtoken";

export interface AuthTokenPayload {
  userId: number;
  email: string;
}

export function signAuthToken(
  payload: AuthTokenPayload,
  secret: string,
  expiresIn: jwt.SignOptions["expiresIn"] = "7d",
): string {
  return jwt.sign(payload, secret, { expiresIn });
}

export function verifyAuthToken(token: string, secret: string): AuthTokenPayload {
  const decoded = jwt.verify(token, secret);
  if (typeof decoded !== "object" || decoded === null) {
    throw new Error("invalid token payload");
  }
  const obj = decoded as jwt.JwtPayload;
  const userId = typeof obj.userId === "number" ? obj.userId : Number(obj.userId);
  if (!Number.isFinite(userId) || typeof obj.email !== "string") {
    throw new Error("invalid token payload");
  }
  return { userId, email: obj.email };
}
