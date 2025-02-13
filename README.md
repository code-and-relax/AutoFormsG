# AutoFormsG Chrome Extension

## Descripción

AutoFormsG es una innovadora herramienta que agiliza dos procesos esenciales:

- Resumir artículos y redactar emails de manera rápida y precisa.
- Extraer preguntas de Google Forms y generar respuestas inteligentes con el apoyo de OpenAI.

Esta extensión automatiza la identificación de preguntas en formularios de Google Forms. Consulta a OpenAI para obtener la respuesta correcta —ya sea seleccionando entre opciones disponibles o generando la respuesta a partir del contenido— e inyecta un discreto marcador visual en el formulario. Durante el proceso, se muestra un elegante indicador de carga (un gif que sigue el puntero del mouse).

## Funcionalidades Destacadas

- **Extracción de Datos de Formularios**  
    Analiza los scripts de Google Forms para extraer un JSON con información sobre cada pregunta, incluyendo:
        - Identificador único (ID).
        - Contenido textual de la pregunta.
        - Opciones de respuesta (si están presentes).

- **Integración con OpenAI**  
    Utiliza la API de OpenAI para procesar el JSON extraído, permitiendo:
        - Seleccionar respuestas válidas cuando hay opciones disponibles.
        - Generar respuestas inteligentes cuando no hay opciones.
        - Devolver cada respuesta en el formato exacto:  
            { "id": &lt;id>, "text": &lt;pregunta>, "correctOption": &lt;respuesta> }

- **Inyección de Respuestas en el Formulario**  
    Emplea técnicas avanzadas de manipulación del DOM para:
        - Ubicar el span correspondiente a cada pregunta.
        - Extraer el último carácter del span para crear un marcador.
        - Inyectar un indicador interactivo que, al pasar el mouse, cambia el cursor a pointer y permite copiar la respuesta con CTRL + clic.

- **Indicador de Carga Personalizado**  
    Incorpora un sutil gif (`loading.gif`) que sigue el puntero del mouse durante el proceso para proporcionar retroalimentación visual inmediata.

- **Interfaz de Inicio a través de Popup**  
    Un popup minimalista permite al usuario iniciar el proceso de inyección desde cualquier pestaña activa, brindando una experiencia sencilla y efectiva.

## Estructura del Proyecto

La organización de archivos es la siguiente:

assets/  
  - lottie/  
    - loading.gif  

popup/  
  - popup.html  
  - popup.js  

scripts/  
  - inject.js  

manifest.json

## Uso Requerido

Para usar la extensión, introduce la API key en la función **sendToOpenAI** dentro de `scripts/inject.js`.
