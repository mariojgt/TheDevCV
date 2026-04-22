import Tesseract from 'tesseract.js';

export async function extractTextFromImage(
  file: File,
  onProgress?: (progress: number) => void
): Promise<{ text: string; confidence: number }> {
  const result = await Tesseract.recognize(file, 'eng', {
    logger: (info) => {
      if (info.status === 'recognizing text' && onProgress) {
        onProgress(Math.round(info.progress * 100));
      }
    },
  });
  return { text: result.data.text, confidence: result.data.confidence };
}

export async function extractTextFromPDF(file: File): Promise<string> {
  const pdfjsLib = await import('pdfjs-dist');
  const pdfjsWorker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
  pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker.default;

  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const pages: string[] = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale: 2 });
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext('2d')!;
    await page.render({ canvas, canvasContext: ctx, viewport }).promise;

    const textContent = await page.getTextContent();
    const textFromLayer = textContent.items
      .map((item: any) => item.str)
      .join(' ')
      .trim();

    if (textFromLayer.length > 50) {
      pages.push(textFromLayer);
    } else {
      const blob = await new Promise<Blob>((resolve) =>
        canvas.toBlob((b) => resolve(b!), 'image/png')
      );
      const ocrFile = new File([blob], `page-${i}.png`, { type: 'image/png' });
      const { text } = await extractTextFromImage(ocrFile);
      pages.push(text);
    }
  }
  return pages.join('\n\n--- Page Break ---\n\n');
}

export async function performOCR(
  file: File,
  onProgress?: (progress: number) => void
): Promise<{ text: string; confidence: number; pageCount: number }> {
  if (file.type === 'application/pdf') {
    const text = await extractTextFromPDF(file);
    return { text, confidence: 0, pageCount: text.split('--- Page Break ---').length };
  }
  const result = await extractTextFromImage(file, onProgress);
  return { ...result, pageCount: 1 };
}
