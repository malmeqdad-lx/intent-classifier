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
  
      console.log('API route called with:', { 
        hasPrompt: !!prompt, 
        hasApiKey: !!apiKey,
        apiKeyPrefix: apiKey ? apiKey.substring(0, 15) + '...' : 'none',
        promptLength: prompt?.length || 0
      });
  
      if (!apiKey) {
        console.log('Missing API key');
        return res.status(400).json({ error: 'API key is required' });
      }
  
      if (!prompt) {
        console.log('Missing prompt');
        return res.status(400).json({ error: 'Prompt is required' });
      }
  
      console.log('Making Claude API call...');
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
  
      console.log('Claude API response status:', response.status);
  
      if (!response.ok) {
        const errorText = await response.text();
        console.log('Claude API error:', errorText);
        return res.status(response.status).json({ 
          error: `Claude API Error: ${response.status} - ${errorText}` 
        });
      }
  
      const data = await response.json();
      console.log('Claude API success, returning data');
      res.status(200).json(data);
  
    } catch (error) {
      console.error('Handler error:', error);
      res.status(500).json({ 
        error: error?.message || 'Internal server error',
        stack: error?.stack
      });
    }
  }