const HEX = "0123456789abcdef";

// Same layout as a Mongo ObjectId (4-byte timestamp, 5 random bytes, 3-byte
// counter) so existing ObjectId.isValid checks and timestamp decoding keep
// working. The browser boot path must not pull in the bson codec for this.
let counter = Math.floor(Math.random() * 0xffffff);

export const createObjectIdString = (): string => {
  const bytes = new Uint8Array(12);
  const seconds = Math.floor(Date.now() / 1000);
  bytes[0] = (seconds >>> 24) & 0xff;
  bytes[1] = (seconds >>> 16) & 0xff;
  bytes[2] = (seconds >>> 8) & 0xff;
  bytes[3] = seconds & 0xff;
  crypto.getRandomValues(bytes.subarray(4, 9));
  counter = (counter + 1) & 0xffffff;
  bytes[9] = (counter >>> 16) & 0xff;
  bytes[10] = (counter >>> 8) & 0xff;
  bytes[11] = counter & 0xff;

  let hex = "";
  for (const byte of bytes) {
    hex += HEX[byte >> 4] ?? "";
    hex += HEX[byte & 0xf] ?? "";
  }
  return hex;
};
