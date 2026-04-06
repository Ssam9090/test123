/**
 * Compresses a base64 image string to ensure it's under the Firestore 1MB limit.
 * @param base64Str The original base64 string.
 * @param maxWidth Maximum width of the image.
 * @param quality Quality of the JPEG compression (0 to 1).
 * @returns A promise that resolves to the compressed base64 string.
 */
export async function compressImage(base64Str: string, maxWidth: number = 1200, quality: number = 0.8): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.src = base64Str;
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let width = img.width;
      let height = img.height;

      if (width > maxWidth) {
        height = (maxWidth / width) * height;
        width = maxWidth;
      }

      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error("Could not get canvas context"));
        return;
      }

      // Fill white background (important for coloring pages)
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, width, height);
      
      ctx.drawImage(img, 0, 0, width, height);

      // Use image/jpeg for better compression of large images
      // Even though it's line art, high quality JPEG is usually fine and much smaller than PNG for base64
      let compressed = canvas.toDataURL('image/jpeg', quality);
      
      // If still too large (unlikely for 1200px), reduce quality further
      if (compressed.length > 1000000) {
        compressed = canvas.toDataURL('image/jpeg', quality * 0.7);
      }

      resolve(compressed);
    };
    img.onerror = (err) => reject(err);
  });
}
