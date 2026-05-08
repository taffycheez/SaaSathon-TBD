# FocusSpace AI — Backend Architecture & Code Skeleton

This is a production-style MVP backend structure for the SaaSathon project.

Recommended stack:
- Next.js App Router
- TypeScript
- OpenAI vision-capable model via OpenRouter
- Supabase (optional)
- Vercel deployment

---

# Folder Structure

```txt
/app
  /api
    /analyse-room
      route.ts

/lib
  ai.ts
  prompts.ts
  scoring.ts
  validation.ts

/types
  analysis.ts

/components
  UploadForm.tsx
  ResultsDashboard.tsx

/utils
  image.ts
```

---

# 1. Install Dependencies

```bash
npm install openai zod
```

Optional:

```bash
npm install @supabase/supabase-js
npm install sharp
```

---

# 2. Environment Variables

Create `.env.local`

```env
OPENROUTER_API_KEY=your_key_here
OPENROUTER_BASE_URL=https://openrouter.ai/api/v1
MODEL_NAME=openai/gpt-4.1-mini
```

---

# 3. Type Definitions

File: `/types/analysis.ts`

```ts
export type ImpactLevel = "low" | "medium" | "high";
export type EffortLevel = "low" | "medium" | "high";

export interface WorkspaceScores {
  focus_score: number;
  ergonomics_score: number;
  distraction_score: number;
  energy_score: number;
}

export interface WorkspaceIssue {
  id: string;
  title: string;
  description: string;
  impact: ImpactLevel;
  category: string;
  confidence: number;
}

export interface WorkspaceRecommendation {
  id: string;
  action: string;
  reason: string;
  impact: ImpactLevel;
  effort: EffortLevel;
  estimated_focus_gain: number;
}

export interface WorkspaceAnalysis {
  workspace_type: string;

  scores: WorkspaceScores;

  issues: WorkspaceIssue[];

  recommendations: WorkspaceRecommendation[];

  summary: string;

  analysis_confidence: number;
}
```

---

# 4. AI Prompt System

File: `/lib/prompts.ts`

```ts
export const SYSTEM_PROMPT = `
You are an elite workplace productivity consultant.

You analyse workspace images and produce structured productivity recommendations.

Focus ONLY on:
- productivity
- focus
- ergonomics
- workspace optimization
- cognitive load
- environmental efficiency

DO NOT discuss aesthetics unless it directly affects productivity.

You must:
- be decisive
- provide actionable recommendations
- avoid vague language
- avoid conversational tone

Return STRICT JSON ONLY.
No markdown.
No commentary.
`;

export const USER_PROMPT = `
Analyse this workspace image.

Evaluate:
- desk orientation
- lighting quality
- visible clutter
- distractions
- ergonomic risks
- workspace separation
- environmental focus quality

Return this schema exactly:

{
  "workspace_type": "",
  "scores": {
    "focus_score": 0,
    "ergonomics_score": 0,
    "distraction_score": 0,
    "energy_score": 0
  },
  "issues": [
    {
      "id": "",
      "title": "",
      "description": "",
      "impact": "low|medium|high",
      "category": "",
      "confidence": 0
    }
  ],
  "recommendations": [
    {
      "id": "",
      "action": "",
      "reason": "",
      "impact": "low|medium|high",
      "effort": "low|medium|high",
      "estimated_focus_gain": 0
    }
  ],
  "summary": "",
  "analysis_confidence": 0
}
`;
```

---

# 5. OpenRouter Client

File: `/lib/ai.ts`

```ts
import OpenAI from "openai";

export const openai = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY,
  baseURL: process.env.OPENROUTER_BASE_URL,
  defaultHeaders: {
    "HTTP-Referer": "http://localhost:3000",
    "X-Title": "FocusSpace AI"
  }
});
```

---

# 6. Validation Layer

File: `/lib/validation.ts`

```ts
import { z } from "zod";

export const analysisSchema = z.object({
  workspace_type: z.string(),

  scores: z.object({
    focus_score: z.number(),
    ergonomics_score: z.number(),
    distraction_score: z.number(),
    energy_score: z.number()
  }),

  issues: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      description: z.string(),
      impact: z.enum(["low", "medium", "high"]),
      category: z.string(),
      confidence: z.number()
    })
  ),

  recommendations: z.array(
    z.object({
      id: z.string(),
      action: z.string(),
      reason: z.string(),
      impact: z.enum(["low", "medium", "high"]),
      effort: z.enum(["low", "medium", "high"]),
      estimated_focus_gain: z.number()
    })
  ),

  summary: z.string(),

  analysis_confidence: z.number()
});
```

---

# 7. Main API Route

File: `/app/api/analyse-room/route.ts`

```ts
import { NextRequest, NextResponse } from "next/server";

import { openai } from "@/lib/ai";
import { SYSTEM_PROMPT, USER_PROMPT } from "@/lib/prompts";
import { analysisSchema } from "@/lib/validation";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();

    const image = formData.get("image") as File;

    if (!image) {
      return NextResponse.json(
        { error: "No image uploaded" },
        { status: 400 }
      );
    }

    const bytes = await image.arrayBuffer();
    const buffer = Buffer.from(bytes);

    const base64 = buffer.toString("base64");

    const mimeType = image.type;

    const imageUrl = `data:${mimeType};base64,${base64}`;

    const completion = await openai.chat.completions.create({
      model: process.env.MODEL_NAME || "openai/gpt-4.1-mini",

      messages: [
        {
          role: "system",
          content: SYSTEM_PROMPT
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: USER_PROMPT
            },
            {
              type: "image_url",
              image_url: {
                url: imageUrl
              }
            }
          ]
        }
      ],

      response_format: {
        type: "json_object"
      },

      temperature: 0.3,
      max_tokens: 2000
    });

    const content = completion.choices[0].message.content;

    if (!content) {
      throw new Error("No AI response returned");
    }

    const parsed = JSON.parse(content);

    const validated = analysisSchema.parse(parsed);

    return NextResponse.json(validated);
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      {
        error: "Analysis failed",
        details: error instanceof Error ? error.message : "Unknown error"
      },
      {
        status: 500
      }
    );
  }
}
```

---

# 8. Frontend Upload Example

File: `/components/UploadForm.tsx`

```tsx
"use client";

import { useState } from "react";

export default function UploadForm() {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);

  async function handleSubmit() {
    if (!file) return;

    setLoading(true);

    const formData = new FormData();
    formData.append("image", file);

    const res = await fetch("/api/analyse-room", {
      method: "POST",
      body: formData
    });

    const data = await res.json();

    setResult(data);
    setLoading(false);
  }

  return (
    <div className="space-y-4">
      <input
        type="file"
        accept="image/*"
        onChange={(e) => {
          if (e.target.files?.[0]) {
            setFile(e.target.files[0]);
          }
        }}
      />

      <button
        onClick={handleSubmit}
        disabled={loading}
        className="bg-black text-white px-4 py-2 rounded"
      >
        {loading ? "Analysing..." : "Analyse Workspace"}
      </button>

      {result && (
        <pre className="bg-gray-100 p-4 rounded overflow-auto text-xs">
          {JSON.stringify(result, null, 2)}
        </pre>
      )}
    </div>
  );
}
```

---

# 9. Recommended Scoring Logic

Do NOT make scores random.

Use weighted heuristics.

Example:

```ts
focus_score =
  lighting_quality * 0.25 +
  clutter_cleanliness * 0.35 +
  desk_orientation * 0.20 +
  distraction_control * 0.20;
```

This makes the product feel believable.

---

# 10. Optional Supabase Persistence

Store:
- uploaded image URL
- final analysis JSON
- timestamps

Suggested table:

```sql
create table analyses (
  id uuid primary key default gen_random_uuid(),
  created_at timestamp with time zone default now(),
  image_url text,
  analysis_json jsonb
);
```

---

# 11. Recommended Deployment

Frontend + API:
- Vercel

AI:
- OpenRouter

Storage:
- Supabase Storage

Database:
- Supabase Postgres

---

# 12. SaaSathon Demo Optimization

For demo reliability:

- use ONE stable model
- resize uploads before processing
- cap upload size to 10MB
- keep analysis under 10 seconds
- cache sample analyses as fallback

IMPORTANT:
Always have 2 pre-tested room images ready.

Hackathon demos fail because of:
- poor lighting in live camera tests
- upload issues
- slow AI responses
- malformed JSON

Pre-test everything.

---

# 13. Most Important Product Principle

The frontend should NEVER render raw AI text.

Always render:
- scores
- issue cards
- recommendation cards
- structured fields

This is what makes the project feel like:
- real software
- a productivity platform
- an AI-native SaaS product

instead of:
- a chatbot wrapper.

