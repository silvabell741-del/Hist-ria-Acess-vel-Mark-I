
export async function onRequestPost(context) {
  try {
    const { request, env } = context;
    const body = await request.json();
    
    // Recupera a chave da variável de ambiente do Cloudflare
    const apiKey = env.GEMINI_API_KEY || process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return new Response(JSON.stringify({ error: "API Key não configurada no servidor." }), {
        status: 500,
        headers: { "Content-Type": "application/json" }
      });
    }

    const { contents, config, model } = body;
    const modelName = model || "gemini-2.5-flash";

    // Monta a URL da API REST do Google
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;

    // Prepara o payload para a API REST do Google
    // A SDK do cliente envia estruturas ligeiramente diferentes, normalizamos aqui se necessário
    // Mas o frontend já enviará no formato compatível ou o SDK params
    const googlePayload = {
      contents: contents,
      generationConfig: config,
    };

    // Adiciona systemInstruction se fornecido
    if (body.systemInstruction) {
        googlePayload.systemInstruction = {
            parts: [{ text: body.systemInstruction }]
        };
    }

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(googlePayload)
    });

    const data = await response.json();

    if (!response.ok) {
      return new Response(JSON.stringify(data), { status: response.status, headers: { "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify(data), {
      headers: { "Content-Type": "application/json" }
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
}
