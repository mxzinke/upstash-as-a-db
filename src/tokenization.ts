import crypto from "crypto-js";

/**
 * This class is used to encrypt and decrypt data.
 *
 * @param secretKey - The secret key used to encrypt and decrypt the data.
 * @param iv - The initialization vector used to encrypt and decrypt the data.
 */
export default class Tokenizer<T> {
  constructor(private readonly secretKey: string, private readonly iv: string) {
    if (!secretKey || !iv) {
      throw new Error("Secret key and IV must be provided!");
    }
  }

  fromToken(token: string): T {
    const secretKey = crypto.enc.Hex.parse(this.secretKey); // 32 bytes (256 bits)
    const iv = crypto.enc.Hex.parse(this.iv); // 16 bytes (128 bits)
    // Decrypt the JSON string
    const decrypted = crypto.AES.decrypt(token, secretKey, {
      iv: iv,
      mode: crypto.mode.CBC,
      padding: crypto.pad.Pkcs7,
    });
    return JSON.parse(decrypted.toString(crypto.enc.Utf8));
  }

  toToken(payload: T): string {
    const secretKey = crypto.enc.Hex.parse(this.secretKey); // 32 bytes (256 bits)
    const iv = crypto.enc.Hex.parse(this.iv); // 16 bytes (128 bits)

    // Encrypt the JSON string
    const encrypted = crypto.AES.encrypt(JSON.stringify(payload), secretKey, {
      iv: iv,
      mode: crypto.mode.CBC,
      padding: crypto.pad.Pkcs7,
    });

    // Convert the encrypted data to a string (base64-encoded)
    return encrypted.toString();
  }
}

export const hmacSign = (message: string, hmac: string) => {
  const signed = crypto.HmacSHA256(message, hmac);
  return crypto.enc.Base64.stringify(signed);
};
