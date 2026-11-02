/**
 * Serve the QR decoder (zxing WebAssembly) from our own build instead of the
 * default jsDelivr CDN, so the scanner also works on flaky mall Wi-Fi / offline.
 * Must be imported before the first <Scanner> renders. Imported from
 * @yudiel/react-qr-scanner (not barcode-detector directly) so it configures the
 * same module instance the scanner uses.
 */
import { setZXingModuleOverrides } from '@yudiel/react-qr-scanner'
import zxingReaderWasm from 'zxing-wasm/reader/zxing_reader.wasm?url'

setZXingModuleOverrides({
  locateFile: (path: string, prefix: string) => (path.endsWith('.wasm') ? zxingReaderWasm : prefix + path),
})
