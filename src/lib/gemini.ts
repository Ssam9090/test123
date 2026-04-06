import { GoogleGenAI } from "@google/genai";

const apiKey = process.env.GEMINI_API_KEY;

export async function generateColoringPage(prompt: string, difficulty: string = "medium", category: string = "general") {
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured.");
  }

  const ai = new GoogleGenAI({ apiKey });
  
  const difficultyPrompt = {
    simple: "Very simple shapes, thick bold lines, minimal detail, perfect for toddlers. No shading, no background clutter.",
    medium: "Clear outlines, moderate detail, engaging for kids aged 5-7. No shading, clean white background.",
    detailed: "Intricate line art, more complex patterns, suitable for older kids aged 8-10. No shading, high contrast black and white."
  }[difficulty as 'simple' | 'medium' | 'detailed'] || "Clear outlines, no shading, black and white line art.";

  const systemInstruction = `You are an expert coloring book illustrator for children. 
  Your task is to generate a high-quality black-and-white coloring page based on the user's prompt.
  
  STRICT RULES:
  1. ONLY black lines on a PURE white background.
  2. NO shading, NO grayscale, NO gradients, NO textures.
  3. BOLD, well-defined outlines.
  4. Minimal visual clutter.
  5. The subject should be centered.
  6. Style: ${difficultyPrompt}
  7. Category: ${category}.
  8. Do not include any text unless explicitly requested.
  9. The output MUST be a single image.`;

  const fullPrompt = `Generate a coloring page of: ${prompt}. ${difficultyPrompt}`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-image",
      contents: {
        parts: [{ text: fullPrompt }]
      },
      config: {
        systemInstruction: systemInstruction,
        imageConfig: {
          aspectRatio: "3:4", // Portrait for coloring pages
        }
      }
    });

    const part = response.candidates?.[0]?.content?.parts.find(p => p.inlineData);
    if (part?.inlineData?.data) {
      return `data:image/png;base64,${part.inlineData.data}`;
    }
    
    throw new Error("No image data returned from Gemini.");
  } catch (error) {
    console.error("Gemini Image Generation Error:", error);
    throw error;
  }
}
