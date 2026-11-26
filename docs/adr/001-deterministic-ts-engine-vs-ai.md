# ADR-001: Motor Determinista de Simulación en TypeScript Puro Separado de la IA

* **Estado:** Aceptado (Arquitectura Blueprint)
* **Autor:** Max Clever Quintana Morales (Arquitecto Backend)

## Contexto
Portal Job evalúa a jóvenes sin experiencia laboral mediante misiones 3D gamificadas (Logística, RRHH, Operaciones) cuyos puntajes alimentan un dossier de competencias consultado por empresas aliadas. Necesitamos decidir si la evaluación de desempeño la ejecuta un modelo LLM o un motor de cálculo programático.

## Decisión
Toda evaluación numérica (KPIs, cumplimiento de SLA, penalizaciones, aprobación y otorgamiento de XP) se ejecuta en un **motor determinista escrito en TypeScript puro** (`packages/simulation-engine`) sin acceso a red, sin React y sin llamadas a LLMs. La Inteligencia Artificial se utiliza únicamente *después* de persistir el resultado, para redactar explicaciones pedagógicas y recomendar micro-capacitaciones.

## Alternativas Consideradas
1. **Evaluación directa mediante LLM:** Descartada por no ser reproducible, tener latencia alta, costo variable por intento y riesgo de *prompt injection* o sesgos al asignar puntajes.
2. **Microservicio externo en Python para scoring:** Descartada para el MVP por introducir complejidad operativa de despliegue entre dos runtimes cuando la lógica de reglas operativas y SLA se ejecuta en `< 5 ms` nativamente dentro del runtime TypeScript del BFF Next.js 16.

## Consecuencias
* **Positivas:** Reproducibilidad del 100% (`engineVersion + inputHash`), costo cero por evaluación, auditoría clara de cada penalización para empresas B2B y pruebas unitarias ultrarrápidas.
* **Negativas / Mitigación:** Requiere modelar explícitamente las rúbricas de cada nuevo escenario en `rubric_config` y TypeScript; se mitiga diseñando un contrato genérico extensible por vertical.
