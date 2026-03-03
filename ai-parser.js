export function parseTaskFromText(text) {
    const today = new Date();
    let taskDate = new Date(today);
    let title = text;
    let timeStr = "12:00"; // Hora Padrão

    // Deixar texto em minúsculas para facilitar, mas preservar o original para o título
    const lowerText = text.toLowerCase();

    // 1. Processar Data
    if (lowerText.includes("hoje")) {
        taskDate = today;
        title = title.replace(/hoje/i, "").trim();
    } else if (lowerText.includes("depois de amanhã") || lowerText.includes("depois de amanha")) {
        taskDate.setDate(today.getDate() + 2);
        title = title.replace(/depois de amanh[ãa]/i, "").trim();
    } else if (lowerText.includes("amanhã") || lowerText.includes("amanha")) {
        taskDate.setDate(today.getDate() + 1);
        title = title.replace(/amanh[ãa]/i, "").trim();
    } else if (lowerText.includes("amanhã de manhã")) {
        taskDate.setDate(today.getDate() + 1);
        timeStr = "08:00";
        title = title.replace(/amanh[ãa] de manh[ãa]/i, "").trim();
    }

    // Dias da semana simples (próximo X)
    const diasSemana = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado", "terca", "sabado"];
    for (let i = 0; i < diasSemana.length; i++) {
        const diaStr = diasSemana[i];
        if (lowerText.includes(diaStr)) {
            // Mapeia terca -> terça, sabado -> sábado para a lógica de índice
            const targetDay = (i === 7) ? 2 : (i === 8) ? 6 : i;
            let daysUntil = targetDay - today.getDay();
            if (daysUntil <= 0) daysUntil += 7; // Sempre o próximo dia da semana
            taskDate.setDate(today.getDate() + daysUntil);
            title = title.replace(new RegExp(diaStr + "(-feira)?", "i"), "").trim();
            break;
        }
    }

    // 2. Processar Hora
    // Ex: 15h, 15:30, as 15
    const timeRegex = /(?:às|as)?\s*(\d{1,2})(?:[\.:h](\d{2}))?(?:h)?/i;
    const matchTime = lowerText.match(timeRegex);

    if (matchTime) {
        const hour = matchTime[1].padStart(2, '0');
        const min = (matchTime[2] || "00").padStart(2, '0');
        timeStr = `${hour}:${min}`;
        title = title.replace(matchTime[0], "").trim();
    } else if (lowerText.includes("meio dia") || lowerText.includes("meio-dia")) {
        timeStr = "12:00";
        title = title.replace(/meio[- ]dia/i, "").trim();
    } else if (lowerText.includes("meia noite") || lowerText.includes("meia-noite")) {
        timeStr = "00:00";
        title = title.replace(/meia[- ]noite/i, "").trim();
    }

    // 3. Limpeza Final
    // Limpar preposições de comando ("lembrar de", "agendar", etc) no INÍCIO
    title = title.replace(/^(lembrar de|marcar|agendar)\s/i, "").trim();
    title = title.replace(/^(para o|para a|para|o|a)\s/i, "").trim();

    // Se o título ficou vazio, usa o texto original formatado
    if (!title || title.length < 2) title = "Nova Tarefa (" + text + ")";

    // Capitalizar primeira letra do Título
    title = title.charAt(0).toUpperCase() + title.slice(1);

    // Formatar data em YYYY-MM-DD
    const yyyy = taskDate.getFullYear();
    const mm = String(taskDate.getMonth() + 1).padStart(2, '0');
    const dd = String(taskDate.getDate()).padStart(2, '0');

    return {
        title: title,
        date: `${yyyy}-${mm}-${dd}`,
        time: timeStr
    };
}
