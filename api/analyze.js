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

    const systemPrompt = `Context: User is eating at NAGOMI Buffet. Goal: Identify food, count items, estimate value.
DB:
${menuString}
Instructions:
1. Identify items.
2. ESTIMATE COUNT (e.g., 3 slices). Default 1.
3. Return JSON: { items: [{name, price, calories, count}], comment }`;

    // Prepare payload for Gemini API
    const payload = {
      contents: [{
        parts: [
          { text: systemPrompt },
          { text: "Analyze image. Return JSON: { items: [{name, price, calories, count}], comment }" },
          { inline_data: { mime_type: "image/jpeg", data: image } }
        ]
      }],
      generationConfig: { response_mime_type: "application/json" }
    };

    // Call Gemini API
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      }
    );

    const data = await response.json();

    if (data.error) {
      return res.status(500).json({ error: data.error.message });
    }

    // Parse and return the result
    const result = JSON.parse(data.candidates[0].content.parts[0].text);
    return res.status(200).json(result);

  } catch (error) {
    console.error('Analyze error:', error);
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
}
