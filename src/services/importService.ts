import mammoth from 'mammoth';
import TurndownService from 'turndown';

const turndownService = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced'
});

export const importFromDOCX = async (file: File): Promise<string> => {
  const arrayBuffer = await file.arrayBuffer();
  const result = await mammoth.convertToHtml({ arrayBuffer });
  const html = result.value;
  return turndownService.turndown(html);
};

export const importFromHTML = (html: string): string => {
  return turndownService.turndown(html);
};

export const importFromMarkdown = async (file: File): Promise<string> => {
  return await file.text();
};

export const importFile = async (file: File): Promise<string> => {
  const extension = file.name.split('.').pop()?.toLowerCase();

  if (extension === 'docx') {
    return await importFromDOCX(file);
  } else if (extension === 'html' || extension === 'htm') {
    const html = await file.text();
    return importFromHTML(html);
  } else if (extension === 'md' || extension === 'markdown' || extension === 'txt') {
    return await importFromMarkdown(file);
  } else {
    throw new Error('Unsupported file format');
  }
};
