/**
 * 画像からEXIFデータ（撮影日時・GPS位置情報・端末情報等）を完全に除去する
 *
 * プライバシー保護: 投稿者の端末情報や位置情報が漏洩することを防止する
 * 対応フォーマット:
 *   JPEG — APP1-APP15, COMセグメント除去
 *   PNG  — eXIf, tEXt, iTXt, zTXt チャンク除去
 *   GIF  — Comment Extension, Application Extension（XMP等）除去
 *   WebP — EXIF, XMP チャンク除去
 */

/**
 * JPEGファイルからEXIF/メタデータセグメントを除去する
 * APP1(EXIF/XMP), APP2(ICC), APP3-APP15, COM(コメント)を削除
 * APP0(JFIF)と画像データ本体は保持する
 */
function stripJpegExif(buffer: Buffer): Buffer {
  if (buffer.length < 2 || buffer[0] !== 0xff || buffer[1] !== 0xd8) {
    return buffer;
  }

  const chunks: Buffer[] = [];
  chunks.push(Buffer.from([0xff, 0xd8])); // SOI marker

  let offset = 2;
  while (offset < buffer.length - 1) {
    if (buffer[offset] !== 0xff) {
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
      if (marker === 0xd9) break;
      continue;
    }

    // SOS (0xFFDA) - Start of Scan: 以降は圧縮画像データなのでそのまま残す
    if (marker === 0xda) {
      chunks.push(buffer.subarray(offset));
      break;
    }

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
  const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (buffer.length < 8 || !buffer.subarray(0, 8).equals(PNG_SIGNATURE)) {
    return buffer;
  }

  const STRIP_CHUNKS = new Set(["eXIf", "tEXt", "iTXt", "zTXt"]);

  const chunks: Buffer[] = [];
  chunks.push(buffer.subarray(0, 8)); // PNGシグネチャ

  let offset = 8;
  while (offset + 8 <= buffer.length) {
    const dataLength = buffer.readUInt32BE(offset);
    const chunkType = buffer.subarray(offset + 4, offset + 8).toString("ascii");
    const totalChunkLength = 4 + 4 + dataLength + 4; // length + type + data + CRC

    if (offset + totalChunkLength > buffer.length) {
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
 * GIFファイルからメタデータブロックを除去する
 * Comment Extension (0x21 0xFE) と Application Extension (0x21 0xFF, XMP等) を削除
 * 画像データ (Image Descriptor, GCE, LZW圧縮データ等) は保持
 *
 * GIF構造: Header(6) + LSD(7) + [GCT] + ブロック列... + Trailer(0x3B)
 */
function stripGifMetadata(buffer: Buffer): Buffer {
  // GIF87a / GIF89a ヘッダー確認
  if (buffer.length < 6) return buffer;
  const header = buffer.subarray(0, 6).toString("ascii");
  if (header !== "GIF87a" && header !== "GIF89a") return buffer;

  const chunks: Buffer[] = [];

  // Header (6) + Logical Screen Descriptor (7)
  let offset = 6;
  const lsdEnd = offset + 7;
  if (lsdEnd > buffer.length) return buffer;

  const packed = buffer[offset + 4];
  const hasGCT = (packed & 0x80) !== 0;
  const gctSize = hasGCT ? 3 * (1 << ((packed & 0x07) + 1)) : 0;

  const headerEnd = lsdEnd + gctSize;
  if (headerEnd > buffer.length) return buffer;

  // Header + LSD + GCT をそのまま保持
  chunks.push(buffer.subarray(0, headerEnd));
  offset = headerEnd;

  // ブロック列を走査
  while (offset < buffer.length) {
    const blockType = buffer[offset];

    // Trailer (0x3B) — ファイル終端
    if (blockType === 0x3b) {
      chunks.push(buffer.subarray(offset, offset + 1));
      break;
    }

    // Image Descriptor (0x2C) — 画像データ（保持）
    if (blockType === 0x2c) {
      if (offset + 10 > buffer.length) {
        chunks.push(buffer.subarray(offset));
        break;
      }
      const imgPacked = buffer[offset + 9];
      const hasLCT = (imgPacked & 0x80) !== 0;
      const lctSize = hasLCT ? 3 * (1 << ((imgPacked & 0x07) + 1)) : 0;

      let imgOffset = offset + 10 + lctSize;
      if (imgOffset >= buffer.length) {
        chunks.push(buffer.subarray(offset));
        break;
      }

      // LZW Minimum Code Size (1 byte)
      imgOffset++;

      // Sub-blocks をスキップ
      imgOffset = skipSubBlocks(buffer, imgOffset);

      chunks.push(buffer.subarray(offset, imgOffset));
      offset = imgOffset;
      continue;
    }

    // Extension blocks (0x21)
    if (blockType === 0x21) {
      if (offset + 1 >= buffer.length) {
        chunks.push(buffer.subarray(offset));
        break;
      }
      const extLabel = buffer[offset + 1];

      // Comment Extension (0xFE) — 除去対象
      if (extLabel === 0xfe) {
        let extOffset = offset + 2;
        extOffset = skipSubBlocks(buffer, extOffset);
        offset = extOffset;
        continue;
      }

      // Application Extension (0xFF) — 除去対象（XMP, NETSCAPE等のメタデータ）
      // ※ NETSCAPE2.0（アニメーションループ制御）も除去されるが、
      //   匿名性保護のため安全側に倒す
      if (extLabel === 0xff) {
        if (offset + 2 >= buffer.length) {
          chunks.push(buffer.subarray(offset));
          break;
        }
        const appBlockSize = buffer[offset + 2];
        let extOffset = offset + 3 + appBlockSize;
        extOffset = skipSubBlocks(buffer, extOffset);
        offset = extOffset;
        continue;
      }

      // その他のExtension (GCE=0xF9等) — 保持
      let extOffset = offset + 2;
      extOffset = skipSubBlocks(buffer, extOffset);
      chunks.push(buffer.subarray(offset, extOffset));
      offset = extOffset;
      continue;
    }

    // 不明なブロック — 残りをそのまま追加して終了
    chunks.push(buffer.subarray(offset));
    break;
  }

  return Buffer.concat(chunks);
}

/** GIFのsub-blockチェーンを読み飛ばし、終端(0x00)の次のオフセットを返す */
function skipSubBlocks(buffer: Buffer, offset: number): number {
  while (offset < buffer.length) {
    const size = buffer[offset];
    if (size === 0) return offset + 1; // block terminator
    offset += 1 + size;
  }
  return offset;
}

/**
 * WebPファイルからEXIF/XMPチャンクを除去する
 * RIFF コンテナ内の "EXIF" および "XMP " チャンクを削除
 * 画像データ (VP8, VP8L, VP8X, ALPH, ANIM, ANMF等) は保持
 *
 * WebP構造: "RIFF" + fileSize(4) + "WEBP" + チャンク列...
 * 各チャンク: FourCC(4) + chunkSize(4, LE) + data + [padding]
 */
function stripWebpMetadata(buffer: Buffer): Buffer {
  // RIFF....WEBP ヘッダー確認
  if (buffer.length < 12) return buffer;
  const riff = buffer.subarray(0, 4).toString("ascii");
  const webp = buffer.subarray(8, 12).toString("ascii");
  if (riff !== "RIFF" || webp !== "WEBP") return buffer;

  const STRIP_FOURCC = new Set(["EXIF", "XMP "]);

  const chunks: Buffer[] = [];
  chunks.push(buffer.subarray(0, 12)); // RIFF header + "WEBP"

  let offset = 12;
  while (offset + 8 <= buffer.length) {
    const fourcc = buffer.subarray(offset, offset + 4).toString("ascii");
    const chunkSize = buffer.readUInt32LE(offset + 4);
    // WebPチャンクは偶数バイト境界にパディングされる
    const paddedSize = chunkSize + (chunkSize % 2);
    const totalChunkSize = 8 + paddedSize;

    if (offset + totalChunkSize > buffer.length) {
      // 不完全なチャンク — 除去対象でなければ残す
      if (!STRIP_FOURCC.has(fourcc)) {
        chunks.push(buffer.subarray(offset));
      }
      break;
    }

    if (!STRIP_FOURCC.has(fourcc)) {
      chunks.push(buffer.subarray(offset, offset + totalChunkSize));
    }

    offset += totalChunkSize;
  }

  // RIFFファイルサイズを再計算（先頭の "RIFF" + size の8バイトを除く全体）
  const totalSize = chunks.reduce((sum, c) => sum + c.length, 0);
  const result = Buffer.concat(chunks);
  result.writeUInt32LE(totalSize - 8, 4);

  return result;
}

/**
 * 画像バッファからEXIF/メタデータを除去する
 * JPEG: APP1-APP15, COMセグメント除去
 * PNG:  eXIf, tEXt, iTXt, zTXt チャンク除去
 * GIF:  Comment Extension, Application Extension 除去
 * WebP: EXIF, XMP チャンク除去
 */
export function stripExifData(buffer: Buffer): Buffer {
  if (buffer.length < 4) return buffer;

  // JPEG: 0xFFD8
  if (buffer[0] === 0xff && buffer[1] === 0xd8) {
    return stripJpegExif(buffer);
  }

  // PNG: 0x89504E47
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
    return stripPngMetadata(buffer);
  }

  // GIF: "GIF8"
  if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x38) {
    return stripGifMetadata(buffer);
  }

  // WebP: "RIFF"
  if (buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46 &&
      buffer.length >= 12 && buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50) {
    return stripWebpMetadata(buffer);
  }

  return buffer;
}
