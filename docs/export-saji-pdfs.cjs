const fs = require('fs');
const path = require('path');
const { jsPDF } = require('jspdf');
const { autoTable } = require('jspdf-autotable');
const files = ['SAJI-STACK-ARCHITECTURE-AND-GITHUB', 'SAJI-FEATURE-EVIDENCE-MATRIX', 'SAJI-CLIENT-TECHNICAL-AUDIT-AND-VALUATION'];
for (const file of files) {
  const doc = new jsPDF({unit:'mm', format:'a4'});
  const width = 180;
  let y = 20;
  function ensure(h) { if (y+h>277) { doc.addPage(); y=20; } }
  function paragraph(text, size=9, bold=false) {
    text = text.replace(/\*\*/g,'').replace(/`/g,'').replace(/\^/g,'^');
    doc.setFont('helvetica',bold?'bold':'normal'); doc.setFontSize(size);
    const lines = doc.splitTextToSize(text, width);
    for (const line of lines) { ensure(size*.45+1); doc.text(line,15,y); y+=size*.45+1; }
    y+=2;
  }
  const lines=fs.readFileSync(path.join('docs',file+'.md'),'utf8').replace(/^\uFEFF/,'').split(/\r?\n/);
  for(let i=0;i<lines.length;i++) {
    let line=lines[i].trim();
    if(!line){ y+=2; continue; }
    if(line.startsWith('```mermaid')) {
      while(i<lines.length && lines[++i].trim()!=='```') {}
      const nodes=[['Browser','Public site and role portals'],['Next.js application','React UI, server actions, HTTP endpoints, shared authentication'],['Prisma Client','Connection from server operations to PostgreSQL'],['Supabase PostgreSQL / PostGIS','Separate database service; live status unverified'],['External services','Payments, SMTP, SMS, AI, push, Maps and monitoring'],['Messaging and calls','Database polling; peer WebRTC audio with STUN']];
      ensure(35);
      autoTable(doc,{startY:y,head:[['Architecture layer','Relationship']],body:nodes,margin:{left:15,right:15,top:20,bottom:20},styles:{fontSize:8,cellPadding:2.5,overflow:'linebreak'},headStyles:{fillColor:[24,63,84]}});
      y=doc.lastAutoTable.finalY+5;
      continue;
    }
    if(line.startsWith('|')) {
      const rows=[];
      while(i<lines.length && lines[i].trim().startsWith('|')) { rows.push(lines[i].trim().split('|').slice(1,-1).map(s=>s.trim().replace(/`/g,''))); i++; }
      i--;
      const body=rows.slice(1).filter(r=>!r.every(s=>/^[-: ]+$/.test(s)));
      ensure(25);
      autoTable(doc,{startY:y,head:[rows[0]],body,margin:{left:15,right:15,top:20,bottom:20},styles:{font:'helvetica',fontSize:7.5,cellPadding:2,overflow:'linebreak'},headStyles:{fillColor:[24,63,84]},alternateRowStyles:{fillColor:[242,246,249]},rowPageBreak:'avoid'});
      y=doc.lastAutoTable.finalY+5;
      continue;
    }
    if(line.startsWith('```')) { continue; }
    if(line.startsWith('# ')){paragraph(line.slice(2),18,true);continue;}
    if(line.startsWith('## ')){ensure(18);paragraph(line.slice(3),12,true);continue;}
    paragraph(line);
  }
  const count=doc.getNumberOfPages();
  for(let p=1;p<=count;p++) { doc.setPage(p); doc.setFont('helvetica','normal');doc.setFontSize(8);doc.setTextColor(100);doc.text('SAJI | Source inspection | 9 October 2026',15,289);doc.text(`${p} / ${count}`,195,289,{align:'right'}); }
  const output=path.join('docs',file+'.pdf'); fs.writeFileSync(output,Buffer.from(doc.output('arraybuffer')));console.log(output+' | '+count+' pages');
}

