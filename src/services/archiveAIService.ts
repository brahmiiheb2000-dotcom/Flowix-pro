import { GoogleGenAI, Type } from "@google/genai";
import { RETENTION_CALENDAR } from "../constants/retentionCalendar";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export async function suggestRetentionRule(title: string, direction?: string, directory: any[] = []) {
  try {
    const rulesToUse = directory.length > 0 ? directory : RETENTION_CALENDAR.flatMap(d => 
      d.rules.map(r => ({ 
        direction: d.name, 
        rule_title: r.title, 
        reference: r.reference,
        active: r.active,
        semiActive: r.semiActive,
        disposition: r.finalDisposition
      }))
    );

    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `
        Tu es un expert en archivage professionnel (Records Management).
        On te donne l'intitulé d'un dossier d'inventaire : "${title}".
        Direction suggérée : "${direction || 'Inconnue'}".

        Trouve la règle de conservation la plus proche dans ce catalogue :
        ${JSON.stringify(rulesToUse, null, 2)}

        Si l'intitulé mentionne explicitement "Sinistre Matériel" ou "Sinistre Corporel", utilise les règles SMA ou SCA.
        
        Réponds UNIQUEMENT au format JSON avec ces champs:
        - match: boolean (est-ce un bon match ?)
        - reference: string (la référence trouvée)
        - title: string (le titre de la règle)
        - retention: string (le délai semi-actif + actif)
        - confidence: number (0 à 1)
      `,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            match: { type: Type.BOOLEAN },
            reference: { type: Type.STRING },
            title: { type: Type.STRING },
            retention: { type: Type.STRING },
            confidence: { type: Type.NUMBER }
          },
          required: ["match", "reference", "title", "retention"]
        }
      }
    });

    return JSON.parse(response.text);
  } catch (error) {
    console.error("AI Classification error:", error);
    return { match: false, confidence: 0 };
  }
}
