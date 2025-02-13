// Función para extraer los datos del formulario de Google Forms
function extractSurveyData() {
    // Se buscan todos los elementos <script> sin filtrar por atributo nonce.
    const scripts = document.querySelectorAll("script");
    console.log("Cantidad de scripts encontrados:", scripts.length);
    let fbScript = null;
    // Expresión regular para identificar el contenido que asigna FB_PUBLIC_LOAD_DATA_
    const regex = /var\s+FB_PUBLIC_LOAD_DATA_\s*=\s*(\[[\s\S]*?\]);/;
    for (const script of scripts) {
        if (regex.test(script.textContent)) {
            fbScript = script;
            break;
        }
    }
    if (!fbScript) {
        return null;
    }
    const match = fbScript.textContent.match(regex);
    if (!match || match.length < 2) {
        return null;
    }
    const fbDataString = match[1];
    let FB_PUBLIC_LOAD_DATA_;
    try {
        // Se intenta convertir la cadena extraída a un objeto mediante JSON.parse
        FB_PUBLIC_LOAD_DATA_ = JSON.parse(fbDataString);
    } catch (e) {
        console.error("Error al parsear la cadena extraída con JSON.parse:", e);
        return null;
    }

    if (!Array.isArray(FB_PUBLIC_LOAD_DATA_) || FB_PUBLIC_LOAD_DATA_.length < 2) {
        return null;
    }

    const surveySection = FB_PUBLIC_LOAD_DATA_[1];
    if (!Array.isArray(surveySection) || surveySection.length < 2 || !Array.isArray(surveySection[1])) {
        return null;
    }

    const questions = surveySection[1];
    const extracted = questions.map(q => {
        const id = q[0];
        const text = q[1];
        let type = null;
        for (let i = 2; i < q.length; i++) {
            if (typeof q[i] === "number") {
                type = q[i];
                break;
            }
        }
        const options = Array.isArray(q[4]) ? q[4] : null;
        return { id, text, type, options };
    });

    return JSON.stringify(extracted, null, 2);
}


// Función para enviar el JSON extraído a OpenAI y obtener las respuestas
async function sendToOpenAI(extractedJson) {
    const apiKey = "YOUR_API_KEY_HERE";
    // Nuevo system prompt que fuerza el formato de la respuesta con las 3 claves obligatorias.
    const systemPrompt = "Eres un asistente técnico que analiza preguntas extraídas de formularios de Google Forms. Se te entrega un JSON donde cada objeto tiene la siguiente estructura EXACTA: { \"id\": <id>, \"text\": <pregunta>, \"correctOption\": <respuesta> }. " +
        "Si en el objeto existe la propiedad 'options' y contiene opciones válidas (por ejemplo, textos no nulos), analiza las opciones y selecciona una de ellas como respuesta correcta. " +
        "Si no hay opciones válidas, genera la respuesta analizando el contenido de la pregunta. " +
        "No devuelvas la misma pregunta como respuesta. " +
        "IMPORTANTE: La respuesta DEBE tener siempre las claves \"id\", \"text\" y \"correctOption\" en cada objeto, sin omitir ninguna y sin comentarios adicionales.";
    const userPrompt = "Analiza el siguiente JSON y determina la respuesta correcta para cada pregunta:\n" + extractedJson;

    const payload = {
        model: "gpt-4o",
        messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt }
        ],
        temperature: 0.7
    };

    console.log("Enviando payload a OpenAI:", payload);

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${apiKey}`
        },
        body: JSON.stringify(payload)
    });
    const data = await response.json();
    console.log("Respuesta cruda de OpenAI:", data);

    try {
        let content = data.choices[0].message.content.trim();
        if (content.startsWith("```json")) {
            content = content.slice(7);
            if (content.endsWith("```")) {
                content = content.slice(0, -3);
            }
            content = content.trim();
        }
        const resultJson = JSON.parse(content);
        console.log("Respuesta procesada de OpenAI:", resultJson);
        return resultJson;
    } catch (e) {
        console.error("Error al parsear la respuesta de OpenAI:", e);
        return null;
    }
}


// Función para inyectar marcadores de respuesta en la página (en Google Forms)
function injectAnswerMarkers(answerData) {
    console.log("Inyectando marcadores de respuesta...: ", answerData);
    // answerData es un array de objetos: { id, text, correctOption }
    answerData.forEach(item => {
        // Validar que item.text esté definido antes de proceder
        if (!item.text) {
            console.error("Elemento sin texto:", item);
            return;
        }
        const questionText = item.text.trim().toLowerCase();
        const spans = Array.from(document.querySelectorAll("span"));
        // Se seleccionan los spans que incluyan, en minúsculas, el texto de la pregunta
        const matchingSpans = spans.filter(span => span.innerText.trim().toLowerCase().includes(questionText));
        if (matchingSpans.length > 0) {
            matchingSpans.forEach(questionSpan => {
                if (questionSpan.innerText.trim().length === 0) return;
                // Se extrae el último carácter del span principal
                const fullText = questionSpan.innerText;
                const lastChar = fullText.slice(-1);
                questionSpan.innerText = fullText.slice(0, -1);
                // Se crea un nuevo span inline para el último carácter, sin margen u otros estilos que alteren el diseño
                const marker = document.createElement("span");
                marker.innerText = lastChar;
                marker.setAttribute("data-answer", item.correctOption);
                marker.style.cursor = "pointer";
                // Al hacer CTRL+Click se copia la respuesta al portapapeles
                marker.addEventListener("click", (e) => {
                    if (e.ctrlKey) {
                        navigator.clipboard.writeText(item.correctOption);
                    }
                });
                // Se agrega el marcador inline al span original
                questionSpan.appendChild(marker);
            });
        } else {
            console.log("No se encontró span para la pregunta:", item.text);
        }
    });
}

// Funciones para mostrar y ocultar el indicador de carga personalizado
function updateLoadingIndicatorPosition(e) {
    const loadingIndicator = document.getElementById("customLoadingIndicator");
    if (loadingIndicator) {
        loadingIndicator.style.left = (e.clientX + 10) + "px";
        loadingIndicator.style.top = (e.clientY + 10) + "px";
    }
}

function showLoadingIndicator() {
    let loadingIndicator = document.createElement("img");
    loadingIndicator.id = "customLoadingIndicator";
    // Obtiene la ruta correcta del gif dentro de la extensión
    loadingIndicator.src = chrome.runtime.getURL("assets/lottie/loading.gif");
    loadingIndicator.style.position = "fixed";
    loadingIndicator.style.width = "25px";
    loadingIndicator.style.height = "25px";
    loadingIndicator.style.pointerEvents = "none";
    loadingIndicator.style.zIndex = "9999";
    document.body.appendChild(loadingIndicator);
    document.addEventListener("mousemove", updateLoadingIndicatorPosition);
}

function hideLoadingIndicator() {
    const loadingIndicator = document.getElementById("customLoadingIndicator");
    if (loadingIndicator) {
        loadingIndicator.remove();
        document.removeEventListener("mousemove", updateLoadingIndicatorPosition);
    }
}

// Función principal: extrae datos, consulta OpenAI y marca respuestas
function startProcess() {
    console.log("Iniciando proceso en inject.js...");
    showLoadingIndicator();  // Muestra el gif de carga
    const extractedJson = extractSurveyData();
    console.log("Resultado de extracción:", extractedJson);
    if (!extractedJson) {
        console.log("No se pudo extraer la información del formulario.");
        hideLoadingIndicator();
        return;
    }
    sendToOpenAI(extractedJson).then(answerData => {
        console.log("Datos recibidos de OpenAI:", answerData);
        if (!answerData) {
            console.log("No se obtuvo respuesta de OpenAI.");
            hideLoadingIndicator();
            return;
        }
        injectAnswerMarkers(answerData);
        hideLoadingIndicator();  // Oculta el gif una vez inyectado el contenido
    });
}

console.log("Esperando 2 segundos...");
setTimeout(() => {
    console.log("Intentando iniciar proceso...");
    startProcess();
}, 2000);
