import type { Format, Scanner } from 'tapirscan/browser/medium';
import { browserSupported } from 'tapirscan/support';
import { TapirscanToBwipMap } from 'src/app/entities/cards/cards-const';
import {
  IBarcodeDecoder,
  IScannerResult,
  toScannerResult,
} from './barcode-decoder';

/** Only the formats the card form can render back. */
const FORMATS = Object.keys(TapirscanToBwipMap) as Format[];

/**
 * Reads the common 1D and 2D card formats, also when they are turned or seen
 * at an angle to the camera.
 *
 * It decodes in a worker of its own, so a slow frame never holds the preview,
 * and its code and WebAssembly (about 1 MB compressed) are only fetched when
 * the scanner opens, see load.
 */
export class TapirscanDecoder implements IBarcodeDecoder {
  public readonly name = 'tapirscan';

  private constructor(private readonly scanner: Scanner) {}

  /**
   * Starts the worker and resolves once it can decode.
   *
   * Resolves to null rather than failing when the browser lacks WebAssembly
   * SIMD, or the files cannot be fetched: the other decoders work without it.
   */
  public static async load(): Promise<TapirscanDecoder | null> {
    if (!browserSupported()) {
      return null;
    }
    try {
      const { Scanner } = await import('tapirscan/browser/medium');
      const scanner = new Scanner({
        formats: FORMATS,
        // Copied there by angular.json from node_modules/tapirscan/wasm.
        wasmBaseUrl: new URL('tapirscan/', document.baseURI),
        worker: () =>
          new Worker(new URL('./tapirscan.worker', import.meta.url), {
            type: 'module',
          }),
      });
      try {
        await scanner.ready;
      } catch (error) {
        scanner.dispose();
        throw error;
      }
      return new TapirscanDecoder(scanner);
    } catch (error) {
      console.warn('Tapirscan is unavailable, scanning without it', error);
      return null;
    }
  }

  public async decode(
    frame: HTMLCanvasElement,
  ): Promise<IScannerResult | null> {
    const { barcodes } = await this.scanner.scan(frame);
    for (const barcode of barcodes) {
      const result = toScannerResult(
        barcode.text,
        TapirscanToBwipMap[barcode.format] ?? null,
      );
      if (result) {
        return result;
      }
    }
    return null;
  }

  /** Stops the worker, which holds the decoder's memory. */
  public dispose(): void {
    this.scanner.dispose();
  }
}
