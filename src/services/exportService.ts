import html2pdf from 'html2pdf.js';
import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } from 'docx';
import { saveAs } from 'file-saver';

export const exportToPDF = async (element: HTMLElement, filename: string = 'document') => {
  const options = {
    margin: [1, 1, 1, 1] as [number, number, number, number],
    filename: `${filename}.pdf`,
    image: { type: 'jpeg' as const, quality: 0.98 },
    html2canvas: { scale: 2, letterRendering: true, useCORS: true },
    jsPDF: { unit: 'in', format: 'a4', orientation: 'portrait' as const }
  };

  // Create a clone to avoid messing with the original UI
  const clone = element.cloneNode(true) as HTMLElement;
  clone.style.padding = '40px';
  clone.style.color = '#333';
  clone.style.backgroundColor = '#fff';
  clone.style.width = '800px';
  clone.classList.add('export-pdf-content');

  // Basic styling for the PDF
  const style = document.createElement('style');
  style.textContent = `
    .export-pdf-content { font-family: 'Inter', sans-serif; line-height: 1.6; }
    .export-pdf-content h1 { font-size: 24pt; margin-bottom: 20pt; }
    .export-pdf-content h2 { font-size: 18pt; margin-top: 20pt; margin-bottom: 10pt; }
    .export-pdf-content p { margin-bottom: 10pt; }
    .export-pdf-content blockquote { border-left: 4px solid #ddd; padding-left: 15px; color: #666; font-style: italic; }
    .export-pdf-content pre { background: #f4f4f4; padding: 10px; border-radius: 5px; overflow-x: auto; }
    .export-pdf-content img { max-width: 100%; height: auto; }
  `;
  document.head.appendChild(style);

  try {
    await html2pdf().set(options).from(clone).save();
  } finally {
    style.remove();
  }
};

export const exportToDOCX = async (doc: any, filename: string = 'document') => {
  const children: any[] = [];

  doc.descendants((node: any) => {
    if (node.type.name === 'paragraph') {
      const runs: TextRun[] = [];
      node.content.forEach((child: any) => {
        if (child.isText) {
          runs.push(new TextRun({
            text: child.text,
            bold: child.marks.some((m: any) => m.type.name === 'strong'),
            italics: child.marks.some((m: any) => m.type.name === 'em'),
            underline: child.marks.some((m: any) => m.type.name === 'underline'),
            strike: child.marks.some((m: any) => m.type.name === 'strike'),
          }));
        }
      });
      children.push(new Paragraph({ children: runs }));
    } else if (node.type.name === 'heading') {
      const level = node.attrs.level;
      const headingMap: Record<number, any> = {
        1: HeadingLevel.HEADING_1,
        2: HeadingLevel.HEADING_2,
        3: HeadingLevel.HEADING_3,
        4: HeadingLevel.HEADING_4,
        5: HeadingLevel.HEADING_5,
        6: HeadingLevel.HEADING_6,
      };
      const headingLevel = headingMap[level] || HeadingLevel.HEADING_1;
      
      const runs: TextRun[] = [];
      node.content.forEach((child: any) => {
        if (child.isText) {
          runs.push(new TextRun({ text: child.text }));
        }
      });
      children.push(new Paragraph({ 
        children: runs,
        heading: headingLevel,
        spacing: { before: 240, after: 120 }
      }));
    } else if (node.type.name === 'blockquote') {
      // Basic blockquote as an indented paragraph
      children.push(new Paragraph({
        text: node.textContent,
        indent: { left: 720 },
        alignment: AlignmentType.LEFT,
      }));
    }
    // Skip iterating into content for nodes we already handled as a whole
    if (['heading', 'paragraph', 'blockquote'].includes(node.type.name)) {
      return false;
    }
  });

  const docx = new Document({
    sections: [{
      properties: {},
      children: children,
    }],
  });

  const blob = await Packer.toBlob(docx);
  saveAs(blob, `${filename}.docx`);
};

export const exportToHTML = (htmlContent: string, filename: string = 'document') => {
// ...
  const fullHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>${filename}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; max-width: 800px; margin: 40px auto; padding: 0 20px; color: #333; }
    h1 { border-bottom: 1px solid #eee; padding-bottom: 10px; }
    blockquote { border-left: 4px solid #ddd; padding-left: 15px; color: #666; font-style: italic; }
    pre { background: #f4f4f4; padding: 10px; border-radius: 5px; overflow-x: auto; }
    code { font-family: monospace; }
    img { max-width: 100%; height: auto; }
  </style>
</head>
<body>
  ${htmlContent}
</body>
</html>
  `;

  const blob = new Blob([fullHtml], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${filename}.html`;
  a.click();
  URL.revokeObjectURL(url);
};

export const exportToMarkdown = (markdown: string, filename: string = 'document') => {
  const blob = new Blob([markdown], { type: 'text/markdown' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${filename}.md`;
  a.click();
  URL.revokeObjectURL(url);
};
