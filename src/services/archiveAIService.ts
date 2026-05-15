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

export async function extractArchivalRulesFromPDF(base64Data: string) {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: "application/pdf",
              data: base64Data
            }
          },
          {
            text: `
              Tu es un expert en archivage et records management de haut niveau.
              Ton objectif est d'analyser ce document PDF (calendrier de conservation des archives) et d'extraire TOUTES les règles de conservation, même si elles sont présentées de manière complexe ou peu structurée.

              CONSIGNES CRITIQUES :
              1. Analyse Exhaustive : Ne saute aucune ligne de tableau ou de texte décrivant une règle.
              2. Catégorisation : Identifie la catégorie (ex: 'Juridique', 'Financier', 'RH', 'Technique', 'Médical', 'Commercial', 'Logistique').
              3. Criticité : Marque comme 'isCritical: true' tout document ayant une valeur probante forte, une durée de conservation > 10 ans, ou une importance vitale (ex: contrats, bilans, dossiers médicaux, statuts).
              4. Directions : Identifie la direction tunisienne concernée (ex: Direction Générale, Direction des Finances, Direction de l'Audit, etc.).
              5. Déduction Intelligente : Si une durée est ambiguë (ex: "Durée légale"), déduis-la si possible ou utilise 10 ans par défaut pour le financier/juridique.
              6. Format des Durées : Les champs activeYears et semiActiveYears doivent être des ENTIERS (ex: 'Permanent' = 99, 'Illimité' = 99).

              Chaque règle doit comporter :
              - reference: le code ou la référence documentaire (ex: FIN-01)
              - title: l'intitulé clair du type de document
              - direction: le nom complet de la direction/service
              - activeYears: DUA en années (Entier)
              - semiActiveYears: Conservation intermédiaire en années (Entier)
              - finalDisposition: 'EL' (Élimination), 'CP' (Conservation Permanente), 'ECH' (Échantillonnage)
              - docType: description détaillée du contenu
              - support: 'Papier', 'Numérique' ou 'Hybride'
              - retentionTrigger: l'évènement de départ (ex: 'Date de clôture', 'Date d'émission')
              - isCritical: boolean (indique si c'est un document à haut risque ou haute valeur)
              - category: 'Juridique', 'Financier', 'RH', 'Technique', etc.

              Réponds UNIQUEMENT au format JSON (un tableau d'objets).
            `
          }
        ]
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              reference: { type: Type.STRING },
              title: { type: Type.STRING },
              direction: { type: Type.STRING },
              activeYears: { type: Type.INTEGER },
              semiActiveYears: { type: Type.INTEGER },
              finalDisposition: { type: Type.STRING },
              docType: { type: Type.STRING },
              support: { type: Type.STRING },
              retentionTrigger: { type: Type.STRING },
              isCritical: { type: Type.BOOLEAN },
              category: { type: Type.STRING }
            },
            required: ["reference", "title", "direction", "activeYears", "semiActiveYears", "finalDisposition", "isCritical", "category"]
          }
        }
      }
    });

    return JSON.parse(response.text);
  } catch (error) {
    console.error("PDF Extraction error:", error);
    throw error;
  }
}
