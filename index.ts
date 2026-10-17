// Supabase Edge Function: analyze-photo
// Photo observation proxy for PawMatch's Pet Symptom Checker (phase 2).
//
// The browser sends { imageBase64, mimeType, species, symptoms[] }.
// This function holds the Gemini API key (server-side secret — never shipped
// to the site) and asks Gemini vision to describe ONLY what is visibly
// observable in the photo: signs, a triage hint, and questions for the vet.
// It never asks for and must never return a diagnosis or treatment advice.
//
// READY TO DEPLOY — NOT deployed yet (see README.md in this folder).

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

// Pinned primary model, verified live on 2026-10-15. gemini-3.8-flash does
// NOT exist yet (an earlier research note was wrong about the name).
// On 429/503 we fall back once to the lite model that answered live.
const MODELS = ["gemini-3.7-flash", "gemini-3.1-flash-lite"];

const MAX_BASE64_BYTES = 6 * 1024 * 1024; // keep payloads within function limits

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  // The Supabase JS SDK sends authorization, apikey and x-client-info; all
  // three must be listed or the browser blocks the POST after preflight.
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const DISCLAIMER =
  "These observations are for informational purposes only and are not veterinary advice, diagnosis, or treatment. Always consult a licensed veterinarian.";

const SYSTEM_PROMPT = `You are an observation assistant for PawMatch, a pet-care app. You analyze a photo of a pet and describe ONLY what you can VISIBLY OBSERVE. You are not a veterinarian and you do not diagnose.

Rules:
- Return ONLY a JSON object (no markdown fences, no extra text) with exactly these fields:
  {
    "observedSigns": [ { "sign": string, "region": string, "confidence": "low" | "medium" | "high" } ],
    "triageHint": "monitor" | "vet_soon" | "vet_today" | "emergency",
    "vetQuestions": [ string ],
    "disclaimer": string
  }
- NEVER state or imply a diagnosis. Do not name diseases as conclusions.
- NEVER recommend medications, dosages, or treatments.
- If you observe any red-flag sign — laboured or open-mouth breathing, collapse or inability to stand, uncontrolled bleeding, markedly swollen or hard abdomen, suspected ingestion of poison or chemicals, severe eye injury — set triageHint to "emergency" regardless of anything else.
- Otherwise choose triageHint honestly: "vet_today" for concerning visible signs (discharge, wounds, significant swelling, visibly distressed posture), "vet_soon" for mild visible signs worth professional eyes, "monitor" when nothing abnormal is visible.
- vetQuestions: 2-4 practical questions the owner can ask their veterinarian about what you observed.
- disclaimer must be exactly: "${DISCLAIMER}"
- If the image does not clearly show a pet, set observedSigns to [], triageHint to "monitor", and put a single helpful note in vetQuestions (e.g. ask for a clearer photo).`;

type AnalysisResult = {
  observedSigns: Array<{ sign: string; region: string; confidence: string }>;
  triageHint: "monitor" | "vet_soon" | "vet_today" | "emergency";
  vetQuestions: string[];
  disclaimer: string;
};

const VALID_TRIAGE = new Set(["monitor", "vet_soon", "vet_today", "emergency"]);

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

function sanitize(parsed: unknown): AnalysisResult | null {
  if (!parsed || typeof parsed !== "object") return null;
  const p = parsed as Record<string, unknown>;
  const signs = Array.isArray(p.observedSigns)
    ? p.observedSigns
        .filter((s) => s && typeof s === "object")
        .map((s) => {
          const r = s as Record<string, unknown>;
          return {
            sign: String(r.sign ?? ""),
            region: String(r.region ?? ""),
            confidence: ["low", "medium", "high"].includes(String(r.confidence))
              ? String(r.confidence)
              : "low",
          };
        })
        .filter((s) => s.sign.length > 0)
    : [];
  const triage = VALID_TRIAGE.has(String(p.triageHint))
    ? (String(p.triageHint) as AnalysisResult["triageHint"])
    : "monitor";
  const questions = Array.isArray(p.vetQuestions)
    ? p.vetQuestions.map(String).filter((q) => q.length > 0).slice(0, 6)
    : [];
  // The disclaimer is enforced server-side so the client can never drop it.
  return { observedSigns: signs, triageHint: triage, vetQuestions: questions, disclaimer: DISCLAIMER };
}

async function callGemini(
  apiKey: string,
  model: string,
  imageBase64: string,
  mimeType: string,
  species: string,
  symptoms: string[],
): Promise<{ status: number; body: string }> {
  const symptomText = symptoms.length > 0 ? symptoms.join(", ") : "none selected by owner";
  const payload = {
    systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
    contents: [
      {
        parts: [
          {
            text:
              `Species (owner-stated): ${species}. Owner-reported symptoms: ${symptomText}. ` +
              `Describe what you can OBSERVE in this photo.`,
          },
          { inline_data: { mime_type: mimeType, data: imageBase64 } },
        ],
      },
    ],
    generationConfig: {
      temperature: 0.2,
      // 3.x flash models spend output tokens on hidden reasoning
      // (thoughtsTokenCount); leave room for it plus the answer.
      maxOutputTokens: 2048,
      thinkingConfig: { thinkingBudget: 512 },
      responseMimeType: "application/json",
    },
  };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 120_000);
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      },
    );
    const text = await res.text();
    return { status: res.status, body: text };
  } finally {
    clearTimeout(timer);
  }
}

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "method not allowed" }, 405);
  }

  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) {
    return jsonResponse(
      { error: "photo analysis is not configured on the server yet" },
      500,
    );
  }

  let input: {
    imageBase64?: unknown;
    mimeType?: unknown;
    species?: unknown;
    symptoms?: unknown;
  };
  try {
    input = await req.json();
  } catch {
    return jsonResponse({ error: "request body must be JSON" }, 400);
  }

  const imageBase64 = typeof input.imageBase64 === "string" ? input.imageBase64 : "";
  const mimeType = typeof input.mimeType === "string" ? input.mimeType : "image/jpeg";
  const species = typeof input.species === "string" && input.species.length > 0
    ? input.species
    : "unknown";
  const symptoms = Array.isArray(input.symptoms)
    ? input.symptoms.map(String).filter((s) => s.length > 0).slice(0, 12)
    : [];

  if (!imageBase64) {
    return jsonResponse({ error: "imageBase64 is required" }, 400);
  }
  if (!mimeType.startsWith("image/")) {
    return jsonResponse({ error: "mimeType must be an image type" }, 400);
  }
  if (imageBase64.length > MAX_BASE64_BYTES) {
    return jsonResponse(
      { error: "photo is too large; please use a smaller image" },
      413,
    );
  }

  let lastError = "unknown error";
  for (const model of MODELS) {
    try {
      const { status, body } = await callGemini(
        apiKey, model, imageBase64, mimeType, species, symptoms,
      );
      if (status === 429 || status === 503) {
        lastError = `model ${model} overloaded (HTTP ${status}), trying fallback`;
        continue; // try the next model
      }
      if (status !== 200) {
        let detail = body.slice(0, 200);
        try {
          const parsed = JSON.parse(body);
          detail = String(parsed?.error?.message ?? detail);
        } catch { /* keep raw slice */ }
        return jsonResponse(
          { error: `photo analysis failed: ${detail}`, retryable: true },
          502,
        );
      }
      const data = JSON.parse(body);
      const candidate = data?.candidates?.[0];
      if (!candidate || candidate.finishReason === "SAFETY") {
        return jsonResponse(
          {
            error:
              "the photo could not be analyzed safely; please run the rule-based symptom check instead",
            retryable: false,
          },
          200,
        );
      }
      let raw: string = candidate?.content?.parts?.[0]?.text ?? "";
      // Be tolerant: strip markdown fences if the model adds them anyway.
      raw = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch {
        return jsonResponse(
          { error: "photo analysis returned an unreadable response", retryable: true },
          502,
        );
      }
      const result = sanitize(parsed);
      if (!result) {
        return jsonResponse(
          { error: "photo analysis returned an unreadable response", retryable: true },
          502,
        );
      }
      return jsonResponse({ ...result, servedBy: model }, 200);
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
    }
  }

  return jsonResponse(
    {
      error: "the photo service is busy right now; please try again later",
      detail: lastError,
      retryable: true,
    },
    503,
  );
});
