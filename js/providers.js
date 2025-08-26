const llm_providers = {
  "Gemini": {
    interpret: async function(prompt, apiKey) {
      const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${apiKey}`;
      const payload = { contents: [{ role: "user", parts: [{ text: prompt }] }] };

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        console.error("Gemini API Error:", errorBody);
        throw new Error(`API request failed with status ${response.status}: ${response.statusText}`);
      }
      const result = await response.json();
      const text = result?.candidates?.[0]?.content?.parts?.[0]?.text;
      return text || 'Could not generate an interpretation. The model returned an empty response.';
    }
  },
  "OpenAI": {
    interpret: async function(prompt, apiKey) {
      const apiUrl = `https://api.openai.com/v1/chat/completions`;
      const payload = {
        model: "gpt-4o",
        messages: [{ role: "user", content: prompt }]
      };

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        console.error("OpenAI API Error:", errorBody);
        throw new Error(`API request failed with status ${response.status}: ${response.statusText}`);
      }
      const result = await response.json();
      const text = result?.choices?.[0]?.message?.content;
      return text || 'Could not generate an interpretation. The model returned an empty response.';
    }
  },
  "Anthropic": {
    interpret: async function(prompt, apiKey) {
      const apiUrl = `https://api.anthropic.com/v1/messages`;
      const payload = {
        model: "claude-3-sonnet-20240229",
        max_tokens: 4096,
        messages: [{ role: "user", content: prompt }]
      };

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        console.error("Anthropic API Error:", errorBody);
        throw new Error(`API request failed with status ${response.status}: ${response.statusText}`);
      }
      const result = await response.json();
      const text = result?.content?.[0]?.text;
      return text || 'Could not generate an interpretation. The model returned an empty response.';
    }
  }
};
