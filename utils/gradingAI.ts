
// FILE: utils/gradingAI.ts
import { auth } from '../components/firebaseClient';

export interface GradingResult {
  grade: number;
  feedback: string;
}

/**
 * Uses the Cloudflare Proxy (/api/ai) to grade a text answer.
 * This prevents the API Key from being exposed in the client.
 */
export async function generateFeedbackAndGrade(
  question: string,
  studentAnswer: string,
  maxPoints: number
): Promise<GradingResult> {

  if (!studentAnswer || studentAnswer.trim() === "") {
      return { grade: 0, feedback: "Não houve resposta para esta questão." };
  }

  const user = auth.currentUser;
  if (!user) {
      throw new Error("Usuário não autenticado.");
  }

  const token = await user.getIdToken();

  const prompt = `
    Atue como um professor de História experiente. Avalie a resposta do aluno para a questão abaixo.

    ---
    Enunciado: "${question}"
    Resposta do Aluno: "${studentAnswer}"
    Valor da Questão: ${maxPoints} pontos
    ---

    Instruções de Avaliação:
    Avalie a resposta do estudante com rigor acadêmico, mas mantenha proporcionalidade na atribuição da nota. Reconheça claramente todos os acertos, mesmo que parciais, e diferencie entre erros conceituais, informações incompletas e pontos omitidos. A crítica deve explicar o que está correto, o que está incorreto e o que falta para uma resposta plenamente adequada ao nível de exigência da pergunta. Evite penalizar de maneira excessiva por um único erro quando houver demonstração geral de compreensão do tema. Considere sempre a dificuldade da questão, o contexto da disciplina e o nível esperado do estudante. Ao final, apresente uma justificativa clara da avaliação e atribua uma nota coerente com o desempenho global demonstrado.

    Retorne um JSON puro com:
    - "grade": Nota sugerida (número flutuante entre 0 e ${maxPoints}).
    - "feedback": Um comentário construtivo e didático para o aluno, justificando a nota com base nas instruções acima.
  `;

  try {
    // Call our Cloudflare Pages Function Proxy
    const response = await fetch('/api/ai', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
            model: "gemini-2.5-flash",
            contents: [{ parts: [{ text: prompt }] }],
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                  type: "OBJECT",
                  properties: {
                    grade: { type: "NUMBER", description: "Nota atribuída ao aluno." },
                    feedback: { type: "STRING", description: "Feedback pedagógico." },
                  },
                  required: ["grade", "feedback"],
                },
            }
        })
    });

    if (!response.ok) {
        if (response.status === 401) {
            throw new Error("Sessão expirada ou não autorizada. Faça login novamente.");
        }
        throw new Error(`Erro na API: ${response.statusText}`);
    }

    const data = await response.json();
    
    // The structure returned by the proxy mimics the Google API response
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    
    if (!text) throw new Error("Resposta vazia da IA");

    const result = JSON.parse(text);
    
    // Sanity check
    let grade = typeof result.grade === 'number' ? result.grade : 0;
    grade = Math.max(0, Math.min(grade, maxPoints)); // Clamp grade

    return {
        grade,
        feedback: result.feedback || "Sem feedback gerado."
    };

  } catch (error) {
    console.error("Erro na correção com IA (Proxy):", error);
    throw error;
  }
}
