import { GoogleGenAI, Modality } from '@google/genai';
import fs from 'fs/promises';
import 'dotenv/config';

async function generateAndSaveImage(prompt, outputPath) {
  try {
    const apiKey = process.env.GOOGLE_GENAI_API_KEY;
    if (!apiKey) {
      throw new Error("GOOGLE_GENAI_API_KEY environment variable is not set. Please add it to your .env file.");
    }
    const client = new GoogleGenAI({ apiKey });

    console.log(`Generating image for: ${outputPath}...`);
    const model = 'gemini-2.5-flash-image'; 

    const response = await client.models.generateContent({
      model: model,
      contents: {
        parts: [{ text: prompt }],
      },
      config: {
        responseModalities: [Modality.IMAGE],
      },
    });

    const part = response.candidates[0].content.parts[0];
    if (part.inlineData) {
      const base64ImageBytes = part.inlineData.data;
      const buffer = Buffer.from(base64ImageBytes, 'base64');
      await fs.writeFile(outputPath, buffer);
      console.log(`✅ Successfully saved image to ${outputPath}`);
    } else {
      throw new Error('No image data found in API response.');
    }
  } catch (error) {
    console.error(`❌ Error generating image for ${outputPath}:`, error);
  }
}

async function main() {
  const context = await fs.readFile('CONTEXT.md', 'utf-8');

  const logoPrompt = `
    You are a professional branding and logo designer. Your task is to create a logo for a web application based on the detailed project context provided below.

    **Project Context:**
    ---
    ${context}
    ---

    **Logo Requirements:**
    - **Name:** Calm Aura
    - **Style:** Modern, minimalist, abstract, and calming.
    - **Concepts to convey:** Empathetic listening, sound waves, a gentle presence, a safe and secure space.
    - **Color Palette:** Soft, soothing colors. Primarily lavender and muted teal.
    - **Format:** Clean, professional, on a transparent background, suitable for a web application header. Avoid any text in the logo itself.
  `;

  const faviconPrompt = `
    You are a professional icon designer. Based on the project context below, create a simple, iconic favicon.

    **Project Context:**
    ---
    ${context}
    ---

    **Favicon Requirements:**
    - **Style:** A very simplified, abstract version of the main logo concept. It must be instantly recognizable at very small sizes (16x16, 32x32).
    - **Concepts to convey:** A single, abstract shape that suggests a calm sound wave or a gentle aura.
    - **Format:** Extremely clean, minimalist, and on a transparent background.
  `;

  await fs.mkdir('public', { recursive: true });
  await generateAndSaveImage(logoPrompt, 'public/logo.png');
  await generateAndSaveImage(faviconPrompt, 'public/favicon.png');
}

main();
