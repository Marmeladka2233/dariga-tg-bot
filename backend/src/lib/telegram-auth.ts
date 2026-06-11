import crypto from "node:crypto";
import { z } from "zod";

const telegramUserSchema = z.object({
  id: z.number(),
  username: z.string().optional(),
  first_name: z.string().optional(),
  last_name: z.string().optional(),
});

export type TelegramWebAppUser = z.infer<typeof telegramUserSchema>;

export function verifyTelegramInitData(
  initData: string,
  botToken: string
): TelegramWebAppUser {
  if (!initData) {
    throw new Error("Telegram init data is missing.");
  }

  const params = new URLSearchParams(initData);
  const hash = params.get("hash");

  if (!hash) {
    throw new Error("Telegram hash is missing.");
  }

  params.delete("hash");

  const dataCheckString = [...params.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");

  const secretKey = crypto
    .createHmac("sha256", "WebAppData")
    .update(botToken)
    .digest();

  const generatedHash = crypto
    .createHmac("sha256", secretKey)
    .update(dataCheckString)
    .digest("hex");

  const valid = crypto.timingSafeEqual(
    Buffer.from(hash, "hex"),
    Buffer.from(generatedHash, "hex")
  );

  if (!valid) {
    throw new Error("Telegram init data signature is invalid.");
  }

  const userJson = params.get("user");

  if (!userJson) {
    throw new Error("Telegram user payload is missing.");
  }

  return telegramUserSchema.parse(JSON.parse(userJson));
}
