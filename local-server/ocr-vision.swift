import Foundation
import Vision
import ImageIO

// Receives one rendered PDF page on stdin. No files or network access.
do {
    let data = FileHandle.standardInput.readDataToEndOfFile()
    guard data.count > 0 && data.count <= 16 * 1024 * 1024 else {
        throw NSError(domain: "JUAI", code: 1, userInfo: [NSLocalizedDescriptionKey: "页面图像为空或过大。"])
    }
    let request = VNRecognizeTextRequest()
    request.recognitionLevel = .accurate
    request.recognitionLanguages = ["ja-JP", "en-US"]
    request.usesLanguageCorrection = true
    let handler = VNImageRequestHandler(data: data, options: [:])
    try handler.perform([request])
    let text = (request.results ?? []).compactMap { $0.topCandidates(1).first?.string }.joined(separator: "\n")
    let result = try JSONSerialization.data(withJSONObject: ["text": text, "engine": "macOS Vision"])
    FileHandle.standardOutput.write(result)
} catch {
    let result = try! JSONSerialization.data(withJSONObject: ["error": error.localizedDescription])
    FileHandle.standardOutput.write(result)
    exit(1)
}
