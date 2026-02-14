/**
 * 画像からEXIFデータ（撮影日時・GPS位置情報・端末情報等）を完全に除去する
 *
 * プライバシー保護: 投稿者の端末情報や位置情報が漏洩することを防止する
 * 対応フォーマット: JPEG（APP1-APP15, COMセグメント除去）、PNG（メタデータチャンク除去）
 */

/**
 * JPEGファイルからEXIF/メタデータセグメントを除去する
 * APP1(EXIF/XMP), APP2(ICC), APP3-APP15, COM(コメント)を削除
 * APP0(JFIF)と画像データ本体は保持する
 */
function stripJpegExif(buffer: Buffer): Buffer {
  // JPEG SOIマーカー (0xFFD8) の確認
  if (buffer.length < 2 || buffer[0] !== 0xff || buffer[1] !== 0xd8) {
    return buffer;
  }

  const chunks: Buffer[] = [];
  chunks.push(Buffer.from([0xff, 0xd8])); // SOI marker

  let offset = 2;
  while (offset < buffer.length - 1) {
    // マーカー開始の 0xFF を探す
    if (buffer[offset] !== 0xff) {
      // データストリームに入った（通常はSOS後の画像データ）
      chunks.push(buffer.subarray(offset));
      break;
    }

    const marker = buffer[offset + 1];

    // パディング (0xFF 0xFF...)
    if (marker === 0xff) {
      offset++;
      continue;
    }

    // SOI (0xFFD8) or EOI (0xFFD9) - 長さフィールドなし
    if (marker === 0xd8 || marker === 0xd9) {
      chunks.push(buffer.subarray(offset, offset + 2));
      offset += 2;
      if (marker === 0xd9) break; // EOI = ファイル終端
      continue;
    }

    // SOS (0xFFDA) - Start of Scan: 以降は圧縮画像データなのでそのまま残す
    if (marker === 0xda) {
      chunks.push(buffer.subarray(offset));
      break;
    }

    // セグメント長を読み取る（マーカー2バイトの直後の2バイト）
    if (offset + 3 >= buffer.length) {
      chunks.push(buffer.subarray(offset));
      break;
    }
    const segmentLength = buffer.readUInt16BE(offset + 2);
    const segmentEnd = offset + 2 + segmentLength;

    // 除去対象: APP1-APP15 (0xFFE1-0xFFEF) — EXIF, XMP, ICC, IPTC等
    if (marker >= 0xe1 && marker <= 0xef) {
      offset = segmentEnd;
      continue;
    }

    // 除去対象: COM (0xFFFE) — コメント
    if (marker === 0xfe) {
      offset = segmentEnd;
      continue;
    }

    // それ以外のセグメント（APP0/JFIF, DQT, SOF, DHT等）は保持
    chunks.push(buffer.subarray(offset, segmentEnd));
    offset = segmentEnd;
  }

  return Buffer.concat(chunks);
}

/**
 * PNGファイルからメタデータチャンクを除去する
 * eXIf, tEXt, iTXt, zTXt チャンクを削除
 * 画像データ (IHDR, PLTE, IDAT, IEND等) は保持
 */
function stripPngMetadata(buffer: Buffer): Buffer {
  // PNGシグネチャ (8 bytes) の確認
  const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (buffer.length < 8 || !buffer.subarray(0, 8).equals(PNG_SIGNATURE)) {
    return buffer;
  }

  // 除去対象のチャンクタイプ
  const STRIP_CHUNKS = new Set(["eXIf", "tEXt", "iTXt", "zTXt"]);

  const chunks: Buffer[] = [];
  chunks.push(buffer.subarray(0, 8)); // PNGシグネチャ

  let offset = 8;
  while (offset + 8 <= buffer.length) {
    const dataLength = buffer.readUInt32BE(offset);
    const chunkType = buffer.subarray(offset + 4, offset + 8).toString("ascii");
    const totalChunkLength = 4 + 4 + dataLength + 4; // length + type + data + CRC

    if (offset + totalChunkLength > buffer.length) {
      // 不完全なチャンク — 残りをそのまま追加
      chunks.push(buffer.subarray(offset));
      break;
    }

    if (!STRIP_CHUNKS.has(chunkType)) {
      chunks.push(buffer.subarray(offset, offset + totalChunkLength));
    }

    offset += totalChunkLength;

    if (chunkType === "IEND") break;
  }

  return Buffer.concat(chunks);
}

/**
 * 画像バッファからEXIF/メタデータを除去する
 * JPEG: APP1-APP15, COMセグメント除去
 * PNG: eXIf, tEXt, iTXt, zTXt チャンク除去
 * その他(GIF, WebP): そのまま返す（メタデータ含有リスクは低い）
 */
export function stripExifData(buffer: Buffer): Buffer {
  if (buffer.length < 4) return buffer;

  // JPEG判定: 0xFFD8
  if (buffer[0] === 0xff && buffer[1] === 0xd8) {
    return stripJpegExif(buffer);
  }

  // PNG判定: 0x89504E47
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
    return stripPngMetadata(buffer);
  }

  // GIF, WebP等: そのまま返す
  return buffer;
}
