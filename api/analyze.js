// Vercel Serverless Function - Gemini API Proxy
// This function securely proxies requests to Google Gemini API
// keeping the API key hidden from the client

export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle preflight request
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

  if (!GEMINI_API_KEY) {
    return res.status(500).json({ error: 'API key not configured' });
  }

  try {
    const { image, menuDB } = req.body;

    if (!image) {
      return res.status(400).json({ error: 'Image data required' });
    }

    // Generate system prompt from menu database
    const menuString = (menuDB || [])
      .map(item => `- ${item.name}: ~$${item.price > 0 ? item.price : Math.round(item.restaurantPrice / 1.5)}`)
      .join('\n');

    const systemPrompt = `You are analyzing a buffet meal photo. The image may contain ONE or MULTIPLE plates/dishes.

MENU DATABASE:
${menuString}

INSTRUCTIONS:
1. Identify ALL visible food items across ALL plates in the image
2. For each item, estimate the COUNT (e.g., 3 pieces of sushi, 2 slices of fish). Default to 1 if unclear.
3. Match items to the menu database when possible
4. Return ONLY valid JSON, no markdown, no code blocks

OUTPUT FORMAT (strict JSON):
{"items":[{"name":"item name","price":0,"calories":0,"count":1}],"comment":"brief observation"}`;

    // Prepare payload for Gemini API
    const payload = {
      contents: [{
        parts: [
          { text: systemPrompt },
          { text: "Analyze this image. Identify ALL food items on ALL plates. Return valid JSON only." },
          { inline_data: { mime_type: "image/jpeg", data: image } }
        ]
      }],
      generationConfig: {
        response_mime_type: "application/json",
        max_output_tokens: 4096
      }
    };

    // Call Gemini API with fallback
    const models = ['gemini-2.5-flash', 'gemini-2.5-pro'];
    let lastError = null;

    for (const model of models) {
      try {
        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          }
        );

        const data = await response.json();

        if (data.error) {
          lastError = data.error.message;
          console.log(`${model} failed: ${lastError}, trying fallback...`);
          continue;
        }

        // Check if we have valid response structure
        if (!data.candidates || !data.candidates[0] || !data.candidates[0].content || !data.candidates[0].content.parts) {
          lastError = `Invalid response structure: ${JSON.stringify(data).slice(0, 200)}`;
          console.log(`${model} failed: ${lastError}`);
          continue;
        }

        // Extract and sanitize JSON response
        let jsonText = data.candidates[0].content.parts[0].text;
        console.log(`${model} raw response: ${jsonText.slice(0, 500)}`);

        // Remove markdown code blocks if present
        jsonText = jsonText.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();

        // Try to find JSON object in the response
        const jsonMatch = jsonText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          jsonText = jsonMatch[0];
        }

        let result;
        try {
          result = JSON.parse(jsonText);
        } catch (parseError) {
          lastError = `JSON parse error: ${parseError.message}. Raw: ${jsonText.slice(0, 200)}`;
          console.log(`${model} failed: ${lastError}`);
          continue;
        }

        // Validate result structure
        if (!result.items || !Array.isArray(result.items)) {
          result.items = [];
        }

        return res.status(200).json(result);
      } catch (e) {
        lastError = e.message;
        console.log(`${model} failed: ${lastError}, trying fallback...`);
        continue;
      }
    }

    console.error('All models failed. Last error:', lastError);
    return res.status(500).json({ error: lastError || 'All models failed', details: 'Check Vercel logs for more info' });

  } catch (error) {
    console.error('Analyze error:', error);
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
}
