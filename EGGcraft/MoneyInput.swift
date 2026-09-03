import Foundation

/// Reads an amount the way a person typed it, on any keyboard.
///
/// The app used to strip commas before parsing, so a Turkish or German
/// keyboard's "12,50" became 1250 and "1,5" became 15 — a hundredfold and a
/// tenfold error in a money field. Firestore also holds amounts written by the
/// web and by Android, which format with either separator.
///
/// The rule: when both separators appear, the last one is the decimal point and
/// the other is grouping. When only one kind appears, it is grouping if it
/// repeats or is followed by exactly three digits, and a decimal point
/// otherwise.
func nvParseAmount(_ raw: String) -> Double? {
    var text = ""
    for character in raw {
        if character.isNumber || character == "," || character == "." {
            text.append(character)
        } else if character == "-" && text.isEmpty {
            text.append(character)
        }
    }
    guard !text.isEmpty, text != "-" else { return nil }

    let commas = text.filter { $0 == "," }.count
    let dots = text.filter { $0 == "." }.count

    if commas > 0 && dots > 0 {
        let lastComma = text.lastIndex(of: ",")
        let lastDot = text.lastIndex(of: ".")
        let decimal: Character = (lastComma! > lastDot!) ? "," : "."
        let grouping: Character = decimal == "," ? "." : ","
        text = text.filter { $0 != grouping }
        text = text.replacingOccurrences(of: String(decimal), with: ".")
    } else if commas > 0 || dots > 0 {
        let separator: Character = commas > 0 ? "," : "."
        let count = commas > 0 ? commas : dots
        let tail = text.split(separator: separator, omittingEmptySubsequences: false).last.map(String.init) ?? ""
        let isGrouping = count > 1 || tail.count == 3
        if isGrouping {
            text = text.filter { $0 != separator }
        } else {
            text = text.replacingOccurrences(of: String(separator), with: ".")
        }
    }

    return Double(text)
}

/// Rounds money to the pence the server stores, so a Mac-written fee or tax
/// figure matches what `roundMoneyValue` on the server would have produced and
/// "Recalculate" stops reporting every Mac order as changed.
func nvRoundMoney(_ value: Double) -> Double {
    (value * 100).rounded() / 100
}
