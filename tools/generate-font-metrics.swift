import AppKit
import CoreText
import Foundation

// Run on the Mac whose installed font list should be shown:
// swift generate-font-metrics.swift > metrics.json
// Measurements use a 16-point Core Text font, corresponding to a 16 CSS px
// design reference at 1x. They are comparative dimensions, not pixel bounds
// from Chrome's rasterizer.

let size: CGFloat = 16
let alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz"
let specimen = "The quick brown fox jumps over the lazy dog."
let families = ["SF Pro"] + NSFontManager.shared.availableFontFamilies.sorted()

func font(for family: String) -> CTFont {
  if family == "SF Pro" { return CTFontCreateUIFontForLanguage(.system, size, nil)! }
  return CTFontCreateWithName(family as CFString, size, nil)
}

func hasGlyphs(_ text: String, in font: CTFont) -> Bool {
  let chars = Array(text.utf16)
  var glyphs = [CGGlyph](repeating: 0, count: chars.count)
  return chars.withUnsafeBufferPointer { cp in
    glyphs.withUnsafeMutableBufferPointer { gp in
      CTFontGetGlyphsForCharacters(font, cp.baseAddress!, gp.baseAddress!, chars.count)
    }
  }
}

func width(_ text: String, in font: CTFont) -> Double {
  let attributes: [NSAttributedString.Key: Any] = [NSAttributedString.Key(kCTFontAttributeName as String): font]
  let attributed = NSAttributedString(string: text, attributes: attributes)
  let line = CTLineCreateWithAttributedString(attributed)
  return Double(CTLineGetTypographicBounds(line, nil, nil, nil))
}

func rounded(_ value: Double) -> Double { (value * 1000).rounded() / 1000 }

var rows: [[String: Any]] = []
for family in families {
  let face = font(for: family)
  let english = hasGlyphs(alphabet, in: face)
  let traits = CTFontGetSymbolicTraits(face)
  let lineHeight = CTFontGetAscent(face) + CTFontGetDescent(face) + CTFontGetLeading(face)
  let familyMembers = family == "SF Pro" ? 9 : (NSFontManager.shared.availableMembers(ofFontFamily: family)?.count ?? 1)
  let os2 = (CTFontCopyTable(face, CTFontTableTag(0x4F532F32), []) as Data?).map { [UInt8]($0) } ?? []
  let panose = os2.count >= 42 ? Array(os2[32..<42]) : []
  let widthClass = os2.count >= 8 ? Int(os2[6]) * 256 + Int(os2[7]) : 0
  let row: [String: Any] = [
    "family": family,
    "english": english,
    "postscript": CTFontCopyPostScriptName(face) as String,
    "face": (CTFontCopyName(face, kCTFontSubFamilyNameKey) as String?) ?? "Regular",
    "copyright": (CTFontCopyName(face, kCTFontCopyrightNameKey) as String?) ?? "",
    "designer": (CTFontCopyName(face, kCTFontDesignerNameKey) as String?) ?? "",
    "manufacturer": (CTFontCopyName(face, kCTFontManufacturerNameKey) as String?) ?? "",
    "monoTrait": traits.contains(.traitMonoSpace),
    "italicTrait": traits.contains(.traitItalic),
    "familyMembers": familyMembers,
    "panose": panose,
    "widthClass": widthClass,
    "capHeight16": rounded(Double(CTFontGetCapHeight(face))),
    "xHeight16": rounded(Double(CTFontGetXHeight(face))),
    "lineHeight16": rounded(Double(lineHeight)),
    "sentenceWidth16": rounded(width(specimen, in: face)),
    "averageLowercaseWidth16": rounded(width("abcdefghijklmnopqrstuvwxyz", in: face) / 26),
    "averageUppercaseWidth16": rounded(width("ABCDEFGHIJKLMNOPQRSTUVWXYZ", in: face) / 26),
    "digitWidth16": rounded(width("0123456789", in: face) / 10),
    "iWidth16": rounded(width("i", in: face)),
    "wWidth16": rounded(width("W", in: face)),
  ]
  rows.append(row)
}

let output: [String: Any] = [
  "measuredAt": ISO8601DateFormatter().string(from: Date()),
  "pointSize": 16,
  "specimen": specimen,
  "englishCoverage": "All 52 unaccented A–Z and a–z glyphs present in the selected face",
  "rows": rows,
]
let data = try JSONSerialization.data(withJSONObject: output, options: [.prettyPrinted, .sortedKeys])
FileHandle.standardOutput.write(data)
