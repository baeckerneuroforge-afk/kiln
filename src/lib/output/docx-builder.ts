/**
 * Minimal DOCX Builder — Creates Word documents from markdown-like content.
 * Uses raw OOXML + JSZip, no python-docx needed.
 */

import JSZip from "jszip";

/**
 * Creates a DOCX buffer from a title and markdown-like content.
 */
export async function createDocxBuffer(title: string, content: string): Promise<Buffer> {
  const zip = new JSZip();

  // [Content_Types].xml
  zip.file("[Content_Types].xml", contentTypesXml());

  // _rels/.rels
  zip.folder("_rels")!.file(".rels", relsXml());

  // word/_rels/document.xml.rels
  zip.folder("word")!.folder("_rels")!.file("document.xml.rels", documentRelsXml());

  // word/styles.xml
  zip.folder("word")!.file("styles.xml", stylesXml());

  // word/document.xml
  zip.folder("word")!.file("document.xml", documentXml(title, content));

  const arrayBuffer = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
  return Buffer.from(arrayBuffer);
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function contentTypesXml(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
</Types>`;
}

function relsXml(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;
}

function documentRelsXml(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;
}

function stylesXml(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:style w:type="paragraph" w:styleId="KilnTitle">
    <w:name w:val="KILN Title"/>
    <w:pPr><w:spacing w:after="200"/></w:pPr>
    <w:rPr>
      <w:b/><w:sz w:val="48"/><w:color w:val="F97316"/>
      <w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/>
    </w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading1">
    <w:name w:val="heading 1"/>
    <w:pPr><w:spacing w:before="360" w:after="120"/></w:pPr>
    <w:rPr><w:b/><w:sz w:val="36"/><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading2">
    <w:name w:val="heading 2"/>
    <w:pPr><w:spacing w:before="240" w:after="80"/></w:pPr>
    <w:rPr><w:b/><w:sz w:val="28"/><w:color w:val="F97316"/><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading3">
    <w:name w:val="heading 3"/>
    <w:pPr><w:spacing w:before="200" w:after="60"/></w:pPr>
    <w:rPr><w:b/><w:sz w:val="24"/><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Normal" w:default="1">
    <w:name w:val="Normal"/>
    <w:pPr><w:spacing w:after="120" w:line="276" w:lineRule="auto"/></w:pPr>
    <w:rPr><w:sz w:val="22"/><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="ListBullet">
    <w:name w:val="List Bullet"/>
    <w:pPr>
      <w:spacing w:after="60"/>
      <w:ind w:left="720" w:hanging="360"/>
    </w:pPr>
    <w:rPr><w:sz w:val="22"/><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/></w:rPr>
  </w:style>
</w:styles>`;
}

function documentXml(title: string, content: string): string {
  const paragraphs: string[] = [];

  // Title
  paragraphs.push(`<w:p><w:pPr><w:pStyle w:val="KilnTitle"/></w:pPr><w:r><w:t>${escapeXml(title)}</w:t></w:r></w:p>`);

  // Content lines
  const lines = content.split("\n");
  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed) {
      paragraphs.push(`<w:p/>`);
      continue;
    }

    if (trimmed.startsWith("### ")) {
      paragraphs.push(`<w:p><w:pPr><w:pStyle w:val="Heading3"/></w:pPr><w:r><w:t>${escapeXml(trimmed.slice(4))}</w:t></w:r></w:p>`);
    } else if (trimmed.startsWith("## ")) {
      paragraphs.push(`<w:p><w:pPr><w:pStyle w:val="Heading2"/></w:pPr><w:r><w:t>${escapeXml(trimmed.slice(3))}</w:t></w:r></w:p>`);
    } else if (trimmed.startsWith("# ")) {
      paragraphs.push(`<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>${escapeXml(trimmed.slice(2))}</w:t></w:r></w:p>`);
    } else if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
      paragraphs.push(`<w:p><w:pPr><w:pStyle w:val="ListBullet"/></w:pPr><w:r><w:t>${escapeXml(trimmed.slice(2))}</w:t></w:r></w:p>`);
    } else {
      // Handle bold (**text**) inline
      const runs = parseBoldRuns(trimmed);
      paragraphs.push(`<w:p>${runs}</w:p>`);
    }
  }

  // Footer
  const date = new Date().toISOString().slice(0, 10);
  paragraphs.push(`<w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:sz w:val="16"/><w:color w:val="999999"/></w:rPr><w:t>Generated by KILN — ${date}</w:t></w:r></w:p>`);

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    ${paragraphs.join("\n    ")}
  </w:body>
</w:document>`;
}

function parseBoldRuns(text: string): string {
  const parts = text.split(/(\*\*[^*]+\*\*)/);
  return parts.map((part) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      const inner = part.slice(2, -2);
      return `<w:r><w:rPr><w:b/></w:rPr><w:t xml:space="preserve">${escapeXml(inner)}</w:t></w:r>`;
    }
    return `<w:r><w:t xml:space="preserve">${escapeXml(part)}</w:t></w:r>`;
  }).join("");
}
