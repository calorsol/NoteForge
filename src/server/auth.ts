import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";

const jwtSecret = process.env.JWT_SECRET ?? "dev-secret-change-me";

if (!process.env.JWT_SECRET) {
  console.warn("JWT_SECRET is not set. Using the default development secret.");
}

export type AuthUser = {
  id: number;
  username: string;
};

type TokenPayload = {
  userId: number;
  username: string;
};

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, passwordHash: string) {
  return bcrypt.compare(password, passwordHash);
}

export function createToken(user: AuthUser) {
  return jwt.sign(
    {
      userId: user.id,
      username: user.username,
    },
    jwtSecret,
    { expiresIn: "7d" }
  );
}

export function verifyToken(token: string) {
  return jwt.verify(token, jwtSecret) as TokenPayload;
}
