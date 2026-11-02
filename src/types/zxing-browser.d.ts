declare module "@zxing/browser" {
  export interface IScannerControls {
    stop(): void;
    switchTorch?: (enabled: boolean) => Promise<void>;
  }
  export class BrowserMultiFormatReader {
    decodeFromImageUrl(url?: string): Promise<{ getText(): string }>;
    decodeFromConstraints(
      constraints: MediaStreamConstraints,
      video: HTMLVideoElement,
      callback: (result: { getText(): string } | null, err: unknown) => void
    ): Promise<IScannerControls>;
    reset(): void;
  }
}
