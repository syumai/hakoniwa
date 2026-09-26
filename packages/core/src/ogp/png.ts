// tmp/17-ogp.md 「方針」節: 外部ライブラリ (sharp 等) を使わず、Web 標準の
// `CompressionStream('deflate')` (zlib/RFC1950 形式。Node 24 / Workers 共通) と自前の CRC32 だけで
// PNG (8bit RGB、フィルタなし) をエンコードする。

const PNG_SIGNATURE = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** CRC32 (IEEE 802.3, PNG が使う多項式) のテーブル。標準的な 256 エントリの実装。 */
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) !== 0 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    const byte = bytes[i] ?? 0;
    const tableIndex = (crc ^ byte) & 0xff;
    crc = (CRC_TABLE[tableIndex] ?? 0) ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function writeUint32BE(value: number, out: Uint8Array, offset: number): void {
  out[offset] = (value >>> 24) & 0xff;
  out[offset + 1] = (value >>> 16) & 0xff;
  out[offset + 2] = (value >>> 8) & 0xff;
  out[offset + 3] = value & 0xff;
}

function concatUint8Arrays(chunks: readonly Uint8Array[]): Uint8Array {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

/**
 * `CompressionStream('deflate')` (zlib/RFC1950 形式) でバイト列を圧縮する。
 * TS 5.9 の DOM 型 (`Uint8Array<ArrayBuffer>` を要求する `BufferSource`) に合わせて、
 * 常に `ArrayBuffer` 裏付きである (`SharedArrayBuffer` を使わない) ことを示すキャストを入れる。
 */
async function deflate(data: Uint8Array): Promise<Uint8Array> {
  const stream = new CompressionStream("deflate");
  const writer = stream.writable.getWriter();
  const writeDone = writer.write(data as Uint8Array<ArrayBuffer>).then(() => writer.close());
  const [buffer] = await Promise.all([new Response(stream.readable).arrayBuffer(), writeDone]);
  return new Uint8Array(buffer);
}

/** 1 個の PNG チャンク (長さ + 種別 + データ + CRC32) を組み立てる。 */
function buildChunk(type: string, data: Uint8Array): Uint8Array {
  const typeBytes = new TextEncoder().encode(type);
  if (typeBytes.length !== 4) {
    throw new Error(`buildChunk: type must be 4 ASCII characters (got: ${type})`);
  }
  const chunk = new Uint8Array(4 + 4 + data.length + 4);
  writeUint32BE(data.length, chunk, 0);
  chunk.set(typeBytes, 4);
  chunk.set(data, 8);
  const crc = crc32(concatUint8Arrays([typeBytes, data]));
  writeUint32BE(crc, chunk, 8 + data.length);
  return chunk;
}

function buildIHDR(width: number, height: number): Uint8Array {
  const data = new Uint8Array(13);
  writeUint32BE(width, data, 0);
  writeUint32BE(height, data, 4);
  data[8] = 8; // bit depth
  data[9] = 2; // color type: RGB (truecolor, no alpha)
  data[10] = 0; // compression method
  data[11] = 0; // filter method
  data[12] = 0; // interlace method
  return buildChunk("IHDR", data);
}

/**
 * 各行の先頭にフィルタ種別 0 (None) を付けた生のスキャンライン列を作る。
 * `rgb` は width*height*3 バイト (行優先、各ピクセル RGB) を想定する。
 */
function buildRawScanlines(width: number, height: number, rgb: Uint8Array): Uint8Array {
  const rowBytes = width * 3;
  if (rgb.length !== rowBytes * height) {
    throw new Error(
      `buildRawScanlines: rgb length mismatch (expected ${rowBytes * height}, got ${rgb.length})`,
    );
  }
  const out = new Uint8Array((rowBytes + 1) * height);
  for (let y = 0; y < height; y++) {
    const outOffset = y * (rowBytes + 1);
    out[outOffset] = 0; // フィルタ種別 0 (None)
    out.set(rgb.subarray(y * rowBytes, (y + 1) * rowBytes), outOffset + 1);
  }
  return out;
}

/**
 * 8bit RGB (フィルタなし) の PNG をエンコードする。tmp/17-ogp.md 「実装の置き場所」節。
 * `rgb` は width*height*3 バイト (行優先、各ピクセル RGB、透過は使わない)。
 */
export async function encodePng(
  width: number,
  height: number,
  rgb: Uint8Array,
): Promise<Uint8Array> {
  const raw = buildRawScanlines(width, height, rgb);
  const compressed = await deflate(raw);

  const ihdr = buildIHDR(width, height);
  const idat = buildChunk("IDAT", compressed);
  const iend = buildChunk("IEND", new Uint8Array(0));

  return concatUint8Arrays([PNG_SIGNATURE, ihdr, idat, iend]);
}
