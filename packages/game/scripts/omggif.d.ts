// `omggif` (devDependency) は型定義を同梱していないための最小限のアンビエント宣言。
// generate-ogp-tiles.ts が使う API のみを宣言する。
declare module "omggif" {
  export interface GifFrameInfo {
    x: number;
    y: number;
    width: number;
    height: number;
    has_local_palette: boolean;
    palette_offset: number | null;
    data_offset: number;
    data_length: number;
    transparent_index: number | null;
    interlaced: boolean;
    delay: number;
    disposal: number;
  }

  export class GifReader {
    constructor(buffer: Uint8Array);
    readonly width: number;
    readonly height: number;
    numFrames(): number;
    loopCount(): number | null;
    frameInfo(frameNum: number): GifFrameInfo;
    decodeAndBlitFrameBGRA(frameNum: number, pixels: Uint8Array): void;
    decodeAndBlitFrameRGBA(frameNum: number, pixels: Uint8Array): void;
  }
}
