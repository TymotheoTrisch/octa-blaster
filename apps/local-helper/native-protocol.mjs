// Native Messaging: JSON UTF-8 precedido por uint32 little-endian, sem logs em stdout.
export function encodeNativeMessage(value) {
  const body = Buffer.from(JSON.stringify(value));
  if (body.length > 1_000_000) throw new Error('native_message_too_large');
  const header = Buffer.alloc(4); header.writeUInt32LE(body.length);
  return Buffer.concat([header, body]);
}

export function readNativeMessages(stream, onMessage, onError) {
  let buffer = Buffer.alloc(0), failed = false;
  stream.on('data', chunk => {
    if (failed) return;
    try {
      buffer = Buffer.concat([buffer, chunk]);
      while (buffer.length >= 4) {
        const size = buffer.readUInt32LE(0);
        if (!size || size > 300_000) throw new Error('native_message_too_large');
        if (buffer.length < size + 4) return;
        const message = JSON.parse(buffer.subarray(4, size + 4).toString('utf8'));
        buffer = buffer.subarray(size + 4);
        onMessage(message);
      }
    } catch { failed = true; buffer = Buffer.alloc(0); onError(); }
  });
  stream.on('end', () => { if (buffer.length) onError(); });
}
