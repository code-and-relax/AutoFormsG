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
    const googleFormsAssistant = "Eres un asistente técnico que analiza preguntas extraídas de formularios de Google Forms. Se te entrega un JSON donde cada objeto tiene la siguiente estructura EXACTA: { \"id\": <id>, \"text\": <pregunta>, \"correctOption\": <respuesta> }. " +
        "Si en el objeto existe la propiedad 'options' y contiene opciones válidas (por ejemplo, textos no nulos), analiza las opciones y selecciona una de ellas como respuesta correcta. " +
        "Si no hay opciones válidas, genera la respuesta analizando el contenido de la pregunta. " +
        "No devuelvas la misma pregunta como respuesta. " +
        "IMPORTANTE: La respuesta DEBE tener siempre las claves \"id\", \"text\" y \"correctOption\" en cada objeto, sin omitir ninguna y sin comentarios adicionales.";
    const userPrompt = "Analiza el siguiente JSON y determina la respuesta correcta para cada pregunta, respondiendo correctamente a lo que se te pide teniendo en cuenta el JSON:\n" + extractedJson;

    const payload = {
        model: "o1-mini",
        messages: [
            { role: "assistant", content: googleFormsAssistant },
            { role: "user", content: userPrompt }
        ],
        temperature: 1,
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

    if (!data.choices || data.choices.length === 0) {
        console.error("Respuesta de OpenAI sin 'choices':", data);
        return null;
    }

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
        const normQuestion = normalizeText(item.text);
        const spans = Array.from(document.querySelectorAll("span"));
        const matchingSpans = spans.filter(span => normalizeText(span.innerText).includes(normQuestion));
        if (matchingSpans.length > 0) {
            matchingSpans.forEach(questionSpan => {
                if (questionSpan.innerText.trim().length === 0) return;
                // Se extrae el último carácter del span principal
                const trimmedText = questionSpan.innerText.trimEnd();
                if (!trimmedText) return;
                const lastChar = trimmedText.charAt(trimmedText.length - 1);
                // Elimina el último carácter visible del span
                questionSpan.innerText = trimmedText.slice(0, -1);
                // Se crea un nuevo span inline para el último carácter, sin margen u otros estilos que alteren el diseño
                const marker = document.createElement("span");
                marker.innerText = lastChar;
                marker.setAttribute("data-answer", item.correctOption);
                marker.setAttribute("data-question", item.text);
                marker.style.cursor = "pointer";
                // Al hacer CTRL+Click se copia la respuesta al portapapeles
                marker.addEventListener("click", (e) => {
                    // Si se hace ctrl+alt+clic izquierdo: solicitar corrección
                    if (e.ctrlKey && e.altKey && e.button === 0) {
                        e.stopPropagation();
                        const questionText = marker.getAttribute("data-question");
                        const currentAnswer = marker.getAttribute("data-answer");
                        requestCorrection(questionText, currentAnswer).then(newAnswer => {
                            if (newAnswer) {
                                marker.setAttribute("data-answer", newAnswer);
                                navigator.clipboard.writeText(newAnswer);
                                if (reportInput) {
                                    reportInput.value = newAnswer;
                                }
                            }
                        });
                    }
                    // Si se hace ctrl+clic (sin alt): copiar y actualizar/transformar el input
                    else if (e.ctrlKey && e.button === 0) {
                        e.stopPropagation();
                        const answerText = marker.getAttribute("data-answer");
                        navigator.clipboard.writeText(answerText);
                        if (reportInput) {
                            reportInput.value = answerText;
                        } else {
                            transformReportDiv(answerText);
                        }
                    }
                    // ...mantener otras acciones si se requieren...
                });
                // Se agrega el marcador inline al span original
                questionSpan.appendChild(marker);
            });
        } else {
            console.log("No se encontró span para la pregunta:", item.text);
        }
    });
}

// Función para normalizar texto, removiendo acentos y símbolos.
function normalizeText(str) {
    return str
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^\w\s]/gi, "")
        .toLowerCase()
        .trim();
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
        // Llamar igualmente a initReportDivListener si se requiere
        initReportDivListener();
        return;
    }
    sendToOpenAI(extractedJson).then(answerData => {
        console.log("Datos recibidos de OpenAI:", answerData);
        if (!answerData) {
            console.log("No se obtuvo respuesta de OpenAI.");
            hideLoadingIndicator();
            initReportDivListener();
            return;
        }
        injectAnswerMarkers(answerData);
        hideLoadingIndicator();  // Oculta el gif una vez inyectado el contenido
        initReportDivListener(); // Llamamos a initReportDivListener tras la inyección
    });
}

startProcess();

// Nueva funcionalidad: convertir el div en un input al pulsarlo y alternar su visibilidad con Ctrl+clic derecho
let reportInput = null;

// Nueva función para identificar el div "report" comprobando solamente la presencia de todos los atributos (sin importar sus valores).
function findReportDiv() {
    const candidates = document.querySelectorAll('div[role="button"]');
    for (const candidate of candidates) {
        if (
            candidate.hasAttribute('jscontroller') &&
            candidate.hasAttribute('jsaction') &&
            candidate.hasAttribute('jsshadow') &&
            candidate.hasAttribute('jsname') &&
            candidate.hasAttribute('aria-label') &&
            candidate.hasAttribute('aria-disabled') &&
            candidate.hasAttribute('tabindex') &&
            candidate.hasAttribute('data-tooltip') &&
            candidate.hasAttribute('data-tooltip-position') &&
            candidate.hasAttribute('data-tooltip-vertical-offset') &&
            candidate.hasAttribute('data-tooltip-horizontal-offset')
        ) {
            return candidate;
        }
    }
    return null;
}

// Reemplaza initReportDivListener para usar findReportDiv en lugar de selectores basados en atributos.
function initReportDivListener() {
    function attachListener(reportDiv) {
        reportDiv.addEventListener("click", (e) => {
            // Comprobar que se pulse con botón izquierdo y la tecla CTRL
            if (e.ctrlKey && e.button === 0) {
                e.preventDefault();
                navigator.clipboard.readText().then((clipboardText) => {
                    reportInput = document.createElement("input");
                    reportInput.style.width = "500px";
                    reportInput.style.height = "25px";
                    reportInput.style.background = "transparent";
                    reportInput.style.border = "1px solid rgba(0, 0, 0, 0.1)";
                    reportInput.style.color = "#00000054";
                    // Inicializa el input con el texto del portapapeles
                    reportInput.value = clipboardText;
                    reportDiv.parentNode.replaceChild(reportInput, reportDiv);
                    const hideFeedbackCSS = "#google-feedback, #google-feedback iframe, #google-feedback * { display: none !important; }";
                    const styleHead = document.createElement("style");
                    styleHead.innerHTML = hideFeedbackCSS;
                    document.head.appendChild(styleHead);
                    const styleBody = document.createElement("style");
                    styleBody.innerHTML = hideFeedbackCSS;
                    document.body.appendChild(styleBody);
                });
            } else {
                // ...existing code para reemplazar el div si se requiere otra acción...
            }
        });
    }

    let reportDiv = findReportDiv();
    if (reportDiv) {
        attachListener(reportDiv);
    } else {
        const observer = new MutationObserver((mutations, obs) => {
            const newReportDiv = findReportDiv();
            if (newReportDiv) {
                attachListener(newReportDiv);
                obs.disconnect();
            }
        });
        observer.observe(document.body, { childList: true, subtree: true });
    }
}

// Listener para alternar visibilidad con Ctrl + clic derecho
document.addEventListener("contextmenu", (e) => {
    if (e.ctrlKey && reportInput) {
        e.preventDefault(); // Elimina el menú contextual original
        reportInput.style.display = (reportInput.style.display === "none") ? "block" : "none";
    }
});

// Nueva función para transformar el div report en un input con el valor inicial dado.
function transformReportDiv(initialValue) {
    const reportDiv = findReportDiv();
    if (!reportDiv) return;
    reportInput = document.createElement("input");
    reportInput.id = "reportInput";
    reportInput.style.width = "500px";
    reportInput.style.height = "25px";
    reportInput.style.background = "transparent";
    reportInput.style.border = "1px solid rgba(0,0,0,0.1)";
    reportInput.style.color = "#00000054";
    reportInput.value = initialValue;

    // Extraer el background del body y transformar a rgba con mayor transparencia.
    const bodyBg = window.getComputedStyle(document.body).backgroundColor;
    let selectionBg = bodyBg;
    if (bodyBg.startsWith("rgb(")) {
        selectionBg = bodyBg.replace("rgb(", "rgba(").replace(")", ",0.4)");
    }
    // Inyectar style para la selección de texto del input.
    const styleEl = document.createElement("style");
    styleEl.textContent = `#reportInput::selection { background: ${selectionBg} !important; }`;
    document.head.appendChild(styleEl);

    // Reemplaza el reportDiv por el input.
    reportDiv.parentNode.replaceChild(reportInput, reportDiv);

    // Inyectar CSS para ocultar feedback (igual que antes).
    const hideFeedbackCSS = "#google-feedback, #google-feedback iframe, #google-feedback * { display: none !important; }";
    const styleHead = document.createElement("style");
    styleHead.innerHTML = hideFeedbackCSS;
    document.head.appendChild(styleHead);
    const styleBody = document.createElement("style");
    styleBody.innerHTML = hideFeedbackCSS;
    document.body.appendChild(styleBody);
}

// Listener global para ocultar el input si se pulsa fuera de éste.
document.addEventListener("click", (e) => {
    const clickedInsideInput = e.target.closest("#reportInput");
    if (!clickedInsideInput && reportInput) {
        reportInput.style.display = "none";
    }
});

// Nueva función para solicitar corrección de la respuesta a la AI con un prompt más profesional
function requestCorrection(question, currentAnswer) {
    document.body.style.cursor = "wait";  // Cursor en modo wait
    const apiKey = "YOUR_API_KEY_HERE";
    const correctionPrompt = "Eres un experto en el análisis de preguntas de formularios. Se te ha proporcionado una pregunta junto con una respuesta que se identificó como errónea. Tu tarea es revisar minuciosamente la pregunta y determinar la respuesta CORRECTA de forma precisa y completa. " +
        "En caso de que la pregunta sea de selección múltiple (por ejemplo, '¿Cuáles de las siguientes...?'), asegúrate de incluir TODAS las respuestas correctas. " +
        "No agregues comentarios adicionales; la respuesta debe estar en formato JSON EXACTO: { \"correctOption\": <respuesta> }." +
        "\nPregunta: " + question;

    const payload = {
        model: "gpt-4o",
        messages: [
            { role: "system", content: correctionPrompt }
        ],
        temperature: 1
    };

    return fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${apiKey}`
        },
        body: JSON.stringify(payload)
    })
        .then(response => response.json())
        .then(data => {
            document.body.style.cursor = "default";
            if (!data.choices || data.choices.length === 0) {
                console.error("Respuesta de OpenAI sin 'choices':", data);
                return null;
            }
            try {
                let content = data.choices[0].message.content.trim();
                if (content.startsWith("```json")) {
                    content = content.slice(7);
                    if (content.endsWith("```")) {
                        content = content.slice(0, -3);
                    }
                    content = content.trim();
                }
                const parsed = JSON.parse(content);
                return parsed.correctOption || parsed;
            } catch (e) {
                console.error("Error al parsear la respuesta de AI para corrección:", e);
                return null;
            }
        });
}

// Listener global para ocultar el input si se pulsa fuera de éste.
document.addEventListener("click", (e) => {
    const clickedInsideInput = e.target.closest("#reportInput");
    if (!clickedInsideInput && reportInput) {
        reportInput.style.display = "none";
    }
});