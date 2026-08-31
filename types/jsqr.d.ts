declare module "jsqr" {
  export type QRCode = {
    data: string
    location: {
      topLeftCorner: { x: number; y: number }
      topRightCorner: { x: number; y: number }
      bottomLeftCorner: { x: number; y: number }
      bottomRightCorner: { x: number; y: number }
    }
  }

  export type Options = {
    inversionAttempts?: "dontInvert" | "onlyInvert" | "attemptBoth" | "invertFirst"
  }

  export default function jsQR(
    data: Uint8ClampedArray,
    width: number,
    height: number,
    options?: Options,
  ): QRCode | null
}
