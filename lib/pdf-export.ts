// Simple PDF generation utility
export const generateTransactionPDF = (transactions: any[], userInfo: any) => {
  const doc = new (window as any).jsPDF()
  const pageHeight = doc.internal.pageSize.getHeight()
  const pageWidth = doc.internal.pageSize.getWidth()
  let yPosition = 20

  // Header
  doc.setFontSize(20)
  doc.text("Transaction Statement", pageWidth / 2, yPosition, { align: "center" })
  yPosition += 15

  // User Info
  doc.setFontSize(10)
  doc.text(`Name: ${userInfo.name}`, 20, yPosition)
  yPosition += 7
  doc.text(`Email: ${userInfo.email}`, 20, yPosition)
  yPosition += 7
  doc.text(`Phone: ${userInfo.phone}`, 20, yPosition)
  yPosition += 7
  doc.text(`Generated: ${new Date().toLocaleDateString()}`, 20, yPosition)
  yPosition += 15

  // Table Headers
  doc.setFontSize(11)
  doc.setFont(undefined, "bold")
  doc.text("Date", 20, yPosition)
  doc.text("Type", 60, yPosition)
  doc.text("Description", 100, yPosition)
  doc.text("Amount", 160, yPosition)
  yPosition += 10

  // Table Data
  doc.setFont(undefined, "normal")
  doc.setFontSize(9)
  transactions.forEach((tx: any) => {
    if (yPosition > pageHeight - 20) {
      doc.addPage()
      yPosition = 20
    }
    
    doc.text(tx.date, 20, yPosition)
    doc.text(tx.type, 60, yPosition)
    doc.text(tx.description?.substring(0, 30) || "", 100, yPosition)
    doc.text(tx.amount, 160, yPosition)
    yPosition += 8
  })

  // Footer
  yPosition = pageHeight - 10
  doc.setFontSize(8)
  doc.text("This is an auto-generated statement. Please keep this for your records.", 20, yPosition)

  // Save
  doc.save("transaction-statement.pdf")
}

// For table export to CSV
export const exportTransactionsToCSV = (transactions: any[], filename = "transactions.csv") => {
  const headers = ["Date", "Type", "Description", "Amount", "Status"]
  const csvContent = [
    headers.join(","),
    ...transactions.map(tx =>
      [tx.date, tx.type, tx.description || "", tx.amount, tx.status].join(",")
    ),
  ].join("\n")

  const blob = new Blob([csvContent], { type: "text/csv" })
  const link = document.createElement("a")
  link.href = URL.createObjectURL(blob)
  link.download = filename
  link.click()
}
