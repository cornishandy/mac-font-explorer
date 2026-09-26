import AppKit
import CoreText
import Foundation

// Renders one PNG specimen per installed family so devices that don't have the
// font (phones, other computers) can still see the real letterforms.
// Run from the project root: swift tools/render-specimens.swift
// Output: specimens/<slug>.png, grayscale + alpha, 2x pixel density.

let specimen = "The quick brown fox jumps over the lazy dog."
let pointSize: CGFloat = 40
let scale: CGFloat = 2
let padding: CGFloat = 6
let families = ["SF Pro"] + NSFontManager.shared.availableFontFamilies.sorted()
let outDir = URL(fileURLWithPath: "specimens", isDirectory: true)
try? FileManager.default.createDirectory(at: outDir, withIntermediateDirectories: true)

// Must match slug() in tools/build-data.py and app.js.
func slug(_ name: String) -> String {
  let lowered = name.lowercased()
  var out = ""
  var dash = false
  for scalar in lowered.unicodeScalars {
    if CharacterSet.alphanumerics.contains(scalar) && scalar.isASCII { out.unicodeScalars.append(scalar); dash = false }
    else if !dash && !out.isEmpty { out.append("-"); dash = true }
  }
  return out.hasSuffix("-") ? String(out.dropLast()) : out
}

func font(for family: String) -> CTFont {
  if family == "SF Pro" { return CTFontCreateUIFontForLanguage(.system, pointSize, nil)! }
  return CTFontCreateWithName(family as CFString, pointSize, nil)
}

var written = 0
for family in families {
  let face = font(for: family)
  let attributes: [NSAttributedString.Key: Any] = [
    NSAttributedString.Key(kCTFontAttributeName as String): face,
    NSAttributedString.Key(kCTForegroundColorAttributeName as String): CGColor(gray: 0.12, alpha: 1),
  ]
  let line = CTLineCreateWithAttributedString(NSAttributedString(string: specimen, attributes: attributes))
  var ascent: CGFloat = 0, descent: CGFloat = 0, leading: CGFloat = 0
  let width = CGFloat(CTLineGetTypographicBounds(line, &ascent, &descent, &leading))
  // Use ink bounds too, so swashes (Zapfino, Savoye) aren't clipped.
  let ink = CTLineGetImageBounds(line, nil)
  let top = max(ascent, ink.maxY), bottom = max(descent, -ink.minY)
  let left = min(0, ink.minX), right = max(width, ink.maxX)
  let w = Int(ceil((right - left + padding * 2) * scale))
  let h = Int(ceil((top + bottom + padding * 2) * scale))
  guard let ctx = CGContext(data: nil, width: w, height: h, bitsPerComponent: 8, bytesPerRow: 0,
                            space: CGColorSpaceCreateDeviceGray(),
                            bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else { continue }
  ctx.scaleBy(x: scale, y: scale)
  ctx.textPosition = CGPoint(x: padding - left, y: padding + bottom)
  CTLineDraw(line, ctx)
  guard let image = ctx.makeImage() else { continue }
  let rep = NSBitmapImageRep(cgImage: image)
  guard let png = rep.representation(using: .png, properties: [:]) else { continue }
  try png.write(to: outDir.appendingPathComponent("\(slug(family)).png"))
  written += 1
}
FileHandle.standardError.write("Wrote \(written) specimens to \(outDir.path)\n".data(using: .utf8)!)
