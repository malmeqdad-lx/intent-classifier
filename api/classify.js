// api/classify.js
export default async function handler(req, res) {
    // Enable CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
    // Handle preflight requests
    if (req.method === 'OPTIONS') {
      res.status(200).end();
      return;
    }
  
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }
  
    try {
      const { prompt, apiKey } = req.body;
  
      if (!apiKey) {
        return res.status(400).json({ error: 'API key is required' });
      }
  
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: 'claude-3-sonnet-20240229',
          max_tokens: 1000,
          messages: [
            {
              role: 'user',
              content: prompt
            }
          ]
        })
      });
  
      if (!response.ok) {
        const errorText = await response.text();
        return res.status(response.status).json({ 
          error: `Claude API Error: ${response.status} - ${errorText}` 
        });
      }
  
      const data = await response.json();
      res.status(200).json(data);
  
    } catch (error) {
      console.error('Classification error:', error);
      res.status(500).json({ 
        error: error.message || 'Internal server error' 
      });
    }
  }