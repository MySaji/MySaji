import type { BusinessPulse } from "@/backend/actions/pos-pulse"
export async function createBriefPdf(data:BusinessPulse){
 const {jsPDF}=await import("jspdf")
 const pdf=new jsPDF({unit:"mm",format:"a4"})
 const amount=(n:number)=>`KSh ${n.toLocaleString("en-KE",{minimumFractionDigits:2,maximumFractionDigits:2})}`
 pdf.setProperties({title:`${data.shopName} - daily brief ${data.day}`,subject:"Recorded branch activity - not an audited financial statement",creator:"Saji Till"})
 pdf.setFillColor(6,71,181);pdf.rect(0,0,210,34,"F");pdf.setTextColor(255,255,255);pdf.setFontSize(11);pdf.text("SAJI TILL / BUSINESS PULSE",16,12);pdf.setFontSize(21);pdf.text("Daily business brief",16,25)
 let y=46
 const paragraph=(text:string,size=10)=>{pdf.setFontSize(size);for(const line of pdf.splitTextToSize(text,178)){if(y>273){pdf.addPage();y=20}pdf.text(line,16,y);y+=size===10?5:6}y+=3}
 pdf.setTextColor(18,36,71);paragraph(data.shopName,14);paragraph(`Business date: ${data.day} / East Africa Time`)
 if(data.limited){pdf.setTextColor(170,65,0);paragraph("PARTIAL DATA: workspace record limits were exceeded. Review detailed records before making decisions.");pdf.setTextColor(18,36,71)}
 const metrics=[["Recorded sales (before refunds)",amount(data.brief.sales)],["Recorded tenders (excluding credit/gift cards)",amount(data.brief.collected)],["Recorded expenses",amount(data.brief.expenses)],["Refunds issued on this date",amount(data.brief.refunds)],["Sale records",String(data.brief.saleCount)],["Unmatched confirmed M-Pesa payments",String(data.brief.unmatched)],["Sale lines missing historical cost",String(data.brief.missingCostLines)]]
 for(const [index,[label,value]]of metrics.entries()){if(y>260){pdf.addPage();y=20}if(index%2===0){pdf.setFillColor(241,246,254);pdf.rect(16,y-5,178,13,"F")}pdf.setFontSize(9);pdf.text(label,19,y+2);pdf.setFontSize(11);pdf.text(value,191,y+2,{align:"right"});y+=13}
 y+=8;paragraph("How to read this brief",12);paragraph("Sales are not net profit. These figures reflect saved branch records, not an independently verified bank balance. Parked and voided sales are excluded from recorded sales. Tenders can include deposits. Refunds use the date issued, which can differ from the original sale date.");paragraph("Product costs, taxes, commissions, operating expenses, returns and missing supporting documents require review. Recording a cash expense does not prove that cash was withdrawn from a till drawer.");paragraph(`Generated: ${new Date(data.generatedAt).toLocaleString("en-KE",{timeZone:"Africa/Nairobi"})} EAT`)
 for(let page=1;page<=pdf.getNumberOfPages();page++){pdf.setPage(page);pdf.setDrawColor(255,121,0);pdf.line(16,282,194,282);pdf.setFontSize(8);pdf.setTextColor(95,110,135);pdf.text(`Saji Till - ${data.day}`,16,289);pdf.text(`${page} / ${pdf.getNumberOfPages()}`,194,289,{align:"right"})}
 return pdf
}
