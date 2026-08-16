import { NextResponse } from "next/server"
import { getReceiptPdfBuffer } from "@/lib/actions/receipts"

/** Public download endpoint backing the /verify page's "Download PDF"
 * button — same no-login model as the rest of receipt verification (see
 * getReceiptByNumber's doc comment). Regenerates on every request rather
 * than serving a cached file, so the logo/contact info in the PDF always
 * matches whatever's currently configured. */
export async function GET(_request: Request, { params }: { params: Promise<{ receiptNumber: string }> }) {
  const { receiptNumber } = await params
  const pdf = await getReceiptPdfBuffer(receiptNumber)
  if (!pdf) {
    return NextResponse.json({ error: "Receipt not found" }, { status: 404 })
  }

  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="SAJI-Receipt-${receiptNumber.toUpperCase()}.pdf"`,
      "Cache-Control": "no-store",
    },
  })
}
