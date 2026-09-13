/**
 * 文件导入 · 文本解码（配套导入页 renderjs 视图层文件选择）
 *
 * ── 为什么需要它 ──
 * 手机剪贴板粘贴大文本会静默截断（实测几十 KB 的教务表格 HTML 粘过来会丢大量内容），
 * 「记事本复制 → 粘贴」链路在手机端不可靠。
 * 文件导入让用户直接选中手机里的 .xls / .txt 原文件，完整读入，绕开剪贴板。
 *
 * ── 实现方式（v2，renderjs 视图层）──
 * uni.chooseFile 在 App 端不支持（官方文档）；Native.js 的 main.onActivityResult 钩子
 * 在 5.24 编译器（vite/vue3）下真机实测不回调 → 弃用。
 * 现行方案：导入页 renderjs 视图层（webview）创建 <input type="file">，
 * 浏览器原生拉起系统文件选择器（无需任何存储权限，符合产品「零权限」约定），
 * FileReader.readAsArrayBuffer 读字节后用本模块 decodeText 解码，
 * 再通过 ownerInstance.callMethod 把文本传回逻辑层。全平台可用（App / H5）。
 *
 * decodeText 为纯函数：按 BOM 解码 UTF-8（含 BOM）/ UTF-16LE / UTF-16BE
 * （WPS 另存的 txt 是 UTF-16），手写实现，不依赖 TextDecoder（旧内核可能没有）。
 */

/** 单文件大小上限（教务课表 HTML 一般 < 200KB，留足余量） */
export const MAX_FILE_BYTES = 5 * 1024 * 1024

/**
 * 按 BOM 解码字节为文本：UTF-8（含 BOM）/ UTF-16LE / UTF-16BE
 * @param {Uint8Array} bytes
 * @returns {string}
 */
export function decodeText(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.length === 0) return ''
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return decodeUtf8(bytes.subarray(3))
  }
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return decodeUtf16(bytes.subarray(2), true)
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return decodeUtf16(bytes.subarray(2), false)
  return decodeUtf8(bytes)
}

/** UTF-8 → UTF-16（非法字节跳过，不抛错） */
function decodeUtf8(b) {
  let out = ''
  let i = 0
  while (i < b.length) {
    const c = b[i]
    let cp = -1
    if (c < 0x80) {
      cp = c
      i += 1
    } else if (c >= 0xc2 && c < 0xe0 && i + 1 < b.length) {
      cp = ((c & 0x1f) << 6) | (b[i + 1] & 0x3f)
      i += 2
    } else if (c >= 0xe0 && c < 0xf0 && i + 2 < b.length) {
      cp = ((c & 0x0f) << 12) | ((b[i + 1] & 0x3f) << 6) | (b[i + 2] & 0x3f)
      i += 3
    } else if (c >= 0xf0 && c < 0xf5 && i + 3 < b.length) {
      cp = ((c & 0x07) << 18) | ((b[i + 1] & 0x3f) << 12) | ((b[i + 2] & 0x3f) << 6) | (b[i + 3] & 0x3f)
      i += 4
    } else {
      i += 1
      continue
    }
    if (cp < 0x10000) out += String.fromCharCode(cp)
    else out += codePointToPair(cp)
  }
  return out
}

/** UTF-16（LE/BE）→ JS 字符串（含代理对容错） */
function decodeUtf16(b, littleEndian) {
  let out = ''
  for (let i = 0; i + 1 < b.length; i += 2) {
    const u = littleEndian ? b[i] | (b[i + 1] << 8) : (b[i] << 8) | b[i + 1]
    const isHigh = u >= 0xd800 && u <= 0xdbff
    if (isHigh && i + 3 < b.length) {
      const u2 = littleEndian ? b[i + 2] | (b[i + 3] << 8) : (b[i + 2] << 8) | b[i + 3]
      if (u2 >= 0xdc00 && u2 <= 0xdfff) {
        out += String.fromCharCode(u, u2)
        i += 2
        continue
      }
    }
    out += String.fromCharCode(u)
  }
  return out
}

function codePointToPair(cp) {
  const v = cp - 0x10000
  return String.fromCharCode(0xd800 + (v >> 10), 0xdc00 + (v & 0x3ff))
}
