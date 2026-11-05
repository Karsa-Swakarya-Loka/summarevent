// Lifts a person off the photo's background with macOS's Vision, for a team poster (src/components/landing/team.ts).
//
//   swift scripts/cutout.swift foto.jpg /tmp/foto-cut.png
//   cwebp -q 82 -alpha_q 85 -metadata none -crop X Y W H /tmp/foto-cut.png -o public/tim/nama.webp
//
// Crop to head and shoulders, about as wide as tall, so the face prints large; the poster fades the bottom edge.
import CoreImage
import Vision

let args = CommandLine.arguments
guard args.count == 3 else { fatalError("usage: cutout.swift <input> <output.png>") }
let input = URL(fileURLWithPath: args[1])
let output = URL(fileURLWithPath: args[2])

guard let source = CGImageSourceCreateWithURL(input as CFURL, nil),
  let image = CGImageSourceCreateImageAtIndex(source, 0, nil)
else { fatalError("cannot read \(input.path)") }

let request = VNGenerateForegroundInstanceMaskRequest()
let handler = VNImageRequestHandler(cgImage: image, options: [:])
try handler.perform([request])
guard let result = request.results?.first else { fatalError("no person found in \(input.path)") }

let masked = try result.generateMaskedImage(ofInstances: result.allInstances, from: handler, croppedToInstancesExtent: false)
try CIContext().writePNGRepresentation(of: CIImage(cvPixelBuffer: masked), to: output, format: .RGBA8, colorSpace: CGColorSpace(name: CGColorSpace.sRGB)!)
